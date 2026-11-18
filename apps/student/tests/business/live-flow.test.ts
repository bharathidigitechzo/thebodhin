// @ts-nocheck — Node-only test; executed by tests/business/run.sh
/* Live class flow end to end (data side): teacher presses "Go live" → class becomes Live now for learners only
   then → every learner is notified once → learners can open the room → ending clears it. Also: no scripted
   demo people in any join result, attendance is per class, and the host list for role checks. */
import { db } from '@/api/mockDb';
import * as api from '@/api/client';

let pass = 0, fail = 0; const fails: string[] = [];
const ok = (c, n, x?) => { if (c) pass++; else { fail++; fails.push(n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };
async function throws(fn, n, m?) { try { await fn(); ok(false, n + ' (expected error)'); } catch (e) { ok(!m || m.test(e?.message ?? ''), n, e?.message); } }
const SET = { record: true, saveToCourse: true, qa: true, chat: true, trackAttendance: true };
const notes = (u) => db.notifications.filter((n) => n.userId === u);

(async () => {
  const R = 'u_rajesh', A = 'u_arjun';
  const id = await api.liveAdmin.schedule(R, { batchId: 'b_dm_wk', title: 'Go-live flow class', description: '', startsAt: new Date(Date.now() + 40 * 864e5).toISOString(), durationMin: 60, instructorId: R, mode: 'online', settings: SET, notifyNow: false, reminders: [] });
  // move it into its time slot so the learner could join (the slot has begun, the teacher has not started)
  const row = db.classSessions.find((s) => s.id === id);
  row.startsAt = new Date(Date.now() - 5 * 6e4).toISOString(); row.endsAt = new Date(Date.now() + 55 * 6e4).toISOString();

  /* before Go live: waiting, not live */
  let sched = await api.liveTab.schedule(A, null);
  ok(!sched.liveNow.some((r) => r.session.id === id), 'inside its slot but not started → NOT live for learners');
  const waiting = sched.upcoming.find((r) => r.session.id === id);
  ok(waiting && waiting.waiting === true, 'learner sees it as "waiting for the teacher"');
  ok(api.liveTab.roomState(id).state === 'waiting', 'room state: waiting');
  ok(api.liveAdmin.get(R, id).session.started === false, 'educator view: not started');

  /* learner can open the waiting room, and the join result has no demo crowd */
  const j0 = await api.liveTab.join(A, id);
  ok(j0.provider === 'mesh' && !!j0.token && /^t_rajesh:/.test(j0.room) && j0.participants === 1, 'join → built-in room, tenant-scoped name, real count (just me)', [j0.provider, j0.room, j0.participants]);
  ok(Array.isArray(j0.hostIds) && j0.hostIds.includes(R), 'join lists who may act as host (owner + instructors)', j0.hostIds);
  ok(!j0.hostIds.includes(A), 'a learner is never in the host list');

  /* go live */
  const before = notes(A).length;
  const s1 = api.liveAdmin.start(R, id);
  ok(s1.first === true && api.liveAdmin.get(R, id).session.started === true, 'start → class is started');
  const n = notes(A).slice(before);
  ok(n.length === 1 && /is live now/.test(n[0].title) && n[0].kind === 'live' && n[0].link?.pathname === '/live-room/[id]' && n[0].link?.params?.id === id, 'learner gets ONE "live now" notification that opens the room', n);
  ok(db.liveMeta[id].hostId === R, 'who started it is recorded');
  sched = await api.liveTab.schedule(A, null);
  ok(sched.liveNow.some((r) => r.session.id === id) && !sched.upcoming.some((r) => r.session.id === id), 'now it is Live now (and no longer "upcoming")');
  ok(api.liveTab.roomState(id).state === 'live' && api.liveTab.roomState(id).host.id === R, 'room state: live, with the host');

  /* refresh / reconnect never re-notifies */
  const s2 = api.liveAdmin.start(R, id);
  ok(s2.first === false && notes(A).length === before + 1, 'starting again (page refresh) does not notify again');

  /* people outside the class get nothing */
  ok(!(await api.liveTab.schedule('u_meera_student_nobody', null)).liveNow.some((r) => r.session.id === id), 'non-members do not see it live');
  await throws(() => api.liveAdmin.start(A, id), 'a learner cannot start a class', /can’t host/);

  /* attendance is per class (regression: any earlier class used to count) */
  db.attendance.push({ userId: 'u_x_other', sessionId: 'lp_1', minutes: 30, joinedAt: new Date().toISOString() });
  const marks = api.batchesApi.importFromLive(id);
  const arjun = db.people.find((p) => p.userId === A);
  ok(marks.find((m) => m.personId === arjun.id)?.status === 'present', 'attendance import counts the learner who joined THIS class');

  /* end */
  api.liveAdmin.end(R, id, { elapsedSec: 600, peak: 1, chapters: [], materials: [], qa: [], polls: [], chatCount: 0 });
  ok(!db.liveMeta[id] && api.liveTab.roomState(id).state === 'ended', 'ending clears the live marker and closes the room');
  sched = await api.liveTab.schedule(A, null);
  ok(!sched.liveNow.some((r) => r.session.id === id) && sched.past.some((r) => r.session.id === id), 'ended class moves to Past');
  await throws(() => api.liveTab.join(A, id), 'cannot join an ended class', /ended/);
  await throws(() => api.liveAdmin.start(R, id), 'cannot restart an ended class', /ended/);
  const sum = api.liveAdmin.summary(R, id);
  ok(sum.sum.durationSec >= 60 && sum.sum.peak === 1, 'summary uses the real duration and peak', [sum.sum.durationSec, sum.sum.peak]);

  /* in-person classes have no online room */
  const id2 = await api.liveAdmin.schedule(R, { batchId: 'b_dm_wk', title: 'In person class', description: '', startsAt: new Date(Date.now() + 41 * 864e5).toISOString(), durationMin: 60, instructorId: R, mode: 'offline', settings: SET, notifyNow: false, reminders: [] });
  await throws(() => api.liveAdmin.start(R, id2), 'in-person class cannot be started online', /in person/);

  console.log(`  live-flow: ${pass} passed, ${fail} failed`);
  fails.forEach((f) => console.log('   ✗ ' + f));
  if (fail) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
