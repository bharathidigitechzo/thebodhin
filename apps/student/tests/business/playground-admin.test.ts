// @ts-nocheck — Node-only test; executed by tests/business/run.sh
/* Super Admin adds Playground challenges → learners see and solve them like the built-in ones. */
import { db, loadHooks } from '@/api/mockDb';
import * as api from '@/api/client';
import { CHALLENGES, challengeGroups, challengeOf, twinChallenge } from '@/playground/challenges';
import { gradeIo } from '@/playground/checks';

let pass = 0, fail = 0; const fails: string[] = [];
const ok = (c, n, x?) => { if (c) pass++; else { fail++; fails.push(n + (x !== undefined ? '  → ' + JSON.stringify(x)?.slice(0, 200) : '')); } };
const err = (fn) => { try { fn(); return null; } catch (e) { return e; } };

const ADMIN = 'u_admin', LEARNER = 'u_arjun';
const builtIn = CHALLENGES.length;
const base = { kind: 'io', title: 'Reverse a word', level: 'Beginner', points: 15, prompt: 'Read one word and print it backwards.', langs: [{ stack: 'python', starter: 'w = input()\n' }, { stack: 'java', starter: 'class Main {}' }], tests: [{ name: 'abc', stdin: 'abc\r\n', expect: 'cba\n' }, { name: 'one letter', stdin: 'x\n', expect: 'x' }] };

/* Only Bodhin content staff */
ok(err(() => api.playgroundAdmin.save(LEARNER, base, false))?.code === 'forbidden', 'learner can’t add challenges');
ok(err(() => api.playgroundAdmin.list('u_rajesh'))?.code === 'forbidden', 'educator can’t open the admin list');

/* Validation */
ok(err(() => api.playgroundAdmin.save(ADMIN, { ...base, title: 'ab' }, false))?.field === 'title', 'short title rejected');
ok(err(() => api.playgroundAdmin.save(ADMIN, { ...base, prompt: 'too short' }, false))?.field === 'prompt', 'short task text rejected');
ok(err(() => api.playgroundAdmin.save(ADMIN, { ...base, langs: [] }, false))?.field === 'langs', 'no language rejected');
ok(err(() => api.playgroundAdmin.save(ADMIN, { ...base, tests: [] }, true))?.field === 'tests', 'publishing without tests rejected');
ok(err(() => api.playgroundAdmin.save(ADMIN, { ...base, tests: [{ name: 'x', stdin: '1', expect: ' ' }] }, false))?.field === 'tests', 'test without expected output rejected');
ok(err(() => api.playgroundAdmin.save(ADMIN, { ...base, title: 'FizzBuzz' }, false))?.field === 'title', 'title of a built-in challenge rejected');

/* Draft: saved but hidden from learners */
const draft = api.playgroundAdmin.save(ADMIN, base, false);
ok(draft.status === 'draft', 'saved as draft');
ok(CHALLENGES.length === builtIn && !challengeOf(`python-${draft.id}`), 'draft not in the Playground');
ok(draft.tests[0].stdin === 'abc\n' && draft.tests[0].expect === 'cba', 'line endings / trailing newline normalised');
ok(db.audit.some((a) => a.action === 'playground.challenge.create' && a.target.id === draft.id), 'creation audited');

/* Publish: one card, two languages, same checking as built-ins */
api.playgroundAdmin.setStatus(ADMIN, draft.id, 'published');
const py = challengeOf(`python-${draft.id}`), java = challengeOf(`java-${draft.id}`);
ok(!!py && !!java && CHALLENGES.length === builtIn + 2, 'published → playable in Python and Java', CHALLENGES.length - builtIn);
ok(py.files[0].name === 'main.py' && py.files[0].code === 'w = input()\n', 'starter code per language');
ok(twinChallenge(py, 'java')?.id === java.id, 'language picker switches to the same challenge');
const group = challengeGroups().find((g) => g.main.id === py.id);
ok(group?.all.length === 2, 'one list card for both languages');
ok(gradeIo(py.tests[0], 'cba\n').pass && !gradeIo(py.tests[0], 'abc').pass, 'tests grade like built-ins');

/* Learner solves it → points */
const before = api.playground.overview(LEARNER).points;
api.playground.markSolved(LEARNER, py.id);
ok(api.playground.overview(LEARNER).points === before + 15, 'learner earns its points');
ok(api.playgroundAdmin.list(ADMIN).find((r) => r.c.id === draft.id)?.solvers === 1, 'admin sees how many solved it');

/* Edit while published → live at once */
api.playgroundAdmin.save(ADMIN, { ...base, id: draft.id, title: 'Reverse a word!', langs: [...base.langs, { stack: 'go', starter: 'package main' }] }, false);
ok(challengeOf(`go-${draft.id}`)?.title === 'Reverse a word!' && challengeOf(`python-${draft.id}`)?.title === 'Reverse a word!', 'edit adds a language and renames, stays published');

/* Unpublish hides it; learner's solve is kept for when it returns */
api.playgroundAdmin.setStatus(ADMIN, draft.id, 'draft');
ok(!challengeOf(`python-${draft.id}`) && CHALLENGES.length === builtIn, 'unpublished → hidden');
ok(db.playgroundSolved.some((s) => s.challengeId === py.id), 'solve record kept');

/* SQL challenge */
const sqlBase = { kind: 'sql', title: 'Total per customer', level: 'Intermediate', points: 20, prompt: 'Table orders(customer, amount). Show each customer and their total amount, ordered by customer.', langs: [], tests: [], setup: 'CREATE TABLE orders(customer TEXT, amount INT); INSERT INTO orders VALUES (\'A\',10),(\'B\',5),(\'A\',7);', sqlStarter: 'SELECT * FROM orders;', sqlSolution: 'SELECT customer, SUM(amount) FROM orders GROUP BY customer ORDER BY customer;', ordered: true, expect: [] };
ok(err(() => api.playgroundAdmin.save(ADMIN, sqlBase, true))?.field === 'expect', 'SQL needs an expected result before publishing');
const sq = api.playgroundAdmin.save(ADMIN, { ...sqlBase, expect: [['A', 17], ['B', 5]] }, true);
const sqc = challengeOf(`sql-${sq.id}`);
ok(sqc?.kind === 'sql' && sqc.expect.length === 2 && sqc.files[0].code === 'SELECT * FROM orders;', 'SQL challenge playable with setup, expected rows and starter');

/* Delete */
api.playgroundAdmin.remove(ADMIN, sq.id);
ok(!challengeOf(`sql-${sq.id}`) && !db.playgroundChallenges.some((c) => c.id === sq.id), 'deleted');

/* Loading shared data re-applies them (another device published) */
db.playgroundChallenges.push({ ...draft, id: 'remote1', title: 'From another device', status: 'published', langs: [{ stack: 'python', starter: '' }] });
loadHooks.forEach((h) => h());
ok(!!challengeOf('python-remote1'), 'challenge published on another device appears after loading');

console.log(`  playground-admin: ${pass} passed, ${fail} failed`);
fails.forEach((f) => console.log('  ✗ ' + f));
if (fail) process.exitCode = 1;
