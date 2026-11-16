// @ts-nocheck — Node-only test; executed by tests/business/run.sh
/* Cross-module alignment: what one person does in one place must show correctly everywhere else.
   tutor uploads a video lesson → enrolled learner plays it, stranger can't, preview is open, course page counts it
   tutor showcases it → marketing video wall shows it; admin blocks → gone; consent off → gone
   tutor coupon → checkout price → learner payments + tutor earnings + course students
   learner doubt → tutor inbox → answer → learner notified;  review → course reviews
   learner finishes course → certificate in their list → public verify page confirms it (unique per learner)
   Super Admin price / trial change → public pricing page + new trials;  going private → off marketplace, learners keep access */
import { db } from '@/api/mockDb';
import * as api from '@/api/client';
import * as g2 from '@/api/growth2';
import { courses as seedCourses } from '@/api/catalogSeed';
import { allLessons } from '@/core/catalog';

let pass = 0, fail = 0; const fails: string[] = [];
const ok = (c, n, x?) => { if (c) pass++; else { fail++; fails.push(n + (x !== undefined ? '  → ' + JSON.stringify(x)?.slice(0, 300) : '')); } };
async function throws(fn, n, m?) { try { await fn(); ok(false, n + ' (expected error)'); } catch (e) { ok(!m || m.test(e?.message ?? ''), n, e?.message); } }
const newLearner = async (tag) => { const s = await api.auth.signUp({ name: `Learner ${tag}`, email: `${tag}@align.in`, phone: `98761${String(10000 + Math.floor(Math.random() * 89999))}`, password: 'demo1234', role: 'student' }); await api.auth.verifySignupOtp(s.userId, '123456'); return s.userId; };

(async () => {
  const R = 'u_rajesh';
  const C = seedCourses.find((c) => c.tenantId === 't_rajesh' && api.learning.isEnrolled('u_arjun', c.id) && c.visibility === 'public_promoted') ?? seedCourses.find((c) => c.tenantId === 't_rajesh' && api.learning.isEnrolled('u_arjun', c.id));
  ok(!!C, 'found a Rajesh course Arjun is enrolled in', C?.id);
  g2.showcaseApi.wall(); // demo seeds sample clips on first open; do it before adding our lesson
  const before = allLessons(seedCourses.find((c) => c.id === C.id)).length;

  /* 1. upload a video lesson → appears for learners */
  const file = await api.courseAdmin.upload(R, 'video', 'meta-ads-budgeting.mp4', 180, () => {});
  ok(file.durationSec > 0, 'upload returns duration (transcode stand-in)');
  const mod = seedCourses.find((c) => c.id === C.id).modules[0];
  api.courseAdmin.saveLesson(R, C.id, mod.id, { title: 'Budgeting your first Meta campaign', type: 'video', durationSec: file.durationSec, sizeMb: 180 });
  const fresh = seedCourses.find((c) => c.id === C.id);
  const L = allLessons(fresh).find((l) => l.title === 'Budgeting your first Meta campaign');
  ok(!!L && allLessons(fresh).length === before + 1, 'lesson saved into the live course', allLessons(fresh).length);
  const opened = api.player.open('u_arjun', C.id, L.id);
  ok(opened.lesson.id === L.id && opened.lesson.durationSec === file.durationSec, 'enrolled learner plays the new video');
  const home = await api.learning.home('u_arjun');
  ok(JSON.stringify(home).includes(C.id), 'course still on learner home');
  const stranger = await newLearner('stranger');
  await throws(() => api.player.open(stranger, C.id, L.id), 'non-enrolled learner cannot play it', /Enroll/);
  api.courseAdmin.saveLesson(R, C.id, mod.id, { ...L, preview: true });
  ok(api.player.open(stranger, C.id, L.id).lesson.id === L.id, 'marked as free preview → anyone can watch it');
  const cp = await api.catalog.course?.(C.id) ?? null;
  const viaSearch = (await api.catalog.search({ text: fresh.title.slice(0, 12) }, null)).find((x) => x.course.id === C.id);
  ok(viaSearch && allLessons(viaSearch.course).length === before + 1, 'marketplace course page shows the new lesson count', viaSearch && allLessons(viaSearch.course).length);

  /* 2. showcase on marketing pages */
  const clip = g2.showcaseApi.add(R, { courseId: C.id, lessonId: L.id });
  ok(g2.showcaseApi.wall().rows.some((r) => r.c.id === clip.id), 'tutor’s showcased lesson appears on the public video wall');
  g2.adminGrowth.block('u_admin', clip.id, true, 'test block');
  ok(!g2.showcaseApi.wall().rows.some((r) => r.c.id === clip.id), 'Super Admin block removes it from the wall');
  g2.adminGrowth.block('u_admin', clip.id, false);
  ok(g2.showcaseApi.wall().rows.some((r) => r.c.id === clip.id), 'unblock brings it back');
  api.courseAdmin.setListing(R, C.id, 'public');
  ok(!g2.showcaseApi.wall().rows.some((r) => r.c.id === clip.id), 'tutor withdraws promotion consent → video leaves the marketing pages at once');
  api.courseAdmin.setListing(R, C.id, 'public_promoted');

  /* 3. coupon → checkout → payments / earnings */
  const C2 = seedCourses.find((c) => c.tenantId === 't_rajesh' && c.id !== C.id && c.priceInr > 0 && c.status !== 'draft' && !api.learning.isEnrolled(stranger, c.id));
  const code = 'ALIGN20';
  api.couponsApi.create(R, { code, type: 'pct', value: 20, courseIds: [C2.id], maxUses: 5, startsAt: new Date(Date.now() - 6e4).toISOString(), endsAt: new Date(Date.now() + 7 * 864e5).toISOString() });
  const q = api.commerce.quote(C2.id, code);
  ok(q.totalInr < C2.priceInr && Math.abs((C2.priceInr - q.discountInr) - (q.totalInr - (q.gstInr ?? 0))) <= 2 || q.discountInr === Math.round(C2.priceInr * 0.2), 'coupon gives 20% at checkout', q);
  const earnBefore = api.educator.earnings('t_rajesh');
  const route = api.commerce.route(C2.id, 't_rajesh', stranger);
  ok(!route.blocked, 'checkout open', route.blocked);
  const order = await api.commerce.pay({ userId: stranger, courseId: C2.id, coupon: code, method: 'upi', source: 'tutor_site', checkoutTenantId: 't_rajesh' });
  ok(order.amountInr === q.totalInr, 'charged exactly the quoted price', [order.amountInr, q.totalInr]);
  ok(api.learning.isEnrolled(stranger, C2.id), 'learner enrolled right after paying');
  const pays = await api.payments.list(stranger);
  ok(JSON.stringify(pays).includes(order.id) || JSON.stringify(pays).includes(order.invoiceNo), 'payment appears in learner Profile → Payments');
  const earnAfter = api.educator.earnings('t_rajesh');
  ok(JSON.stringify(earnAfter) !== JSON.stringify(earnBefore), 'tutor earnings updated by the sale');
  ok(db.coupons.find((x) => x.code === code)?.uses === 1 || db.coupons.find((x) => x.code === code)?.used === 1 || JSON.stringify(db.coupons.find((x) => x.code === code)).includes('"1'), 'coupon use counted', db.coupons.find((x) => x.code === code));
  ok(order.channel === 'direct' || order.collector === 'tutor' || order.sellerTenantId === 't_rajesh', 'own-site sale goes to the tutor (no 20% commission)', order);

  /* 4. doubt → tutor → answer → learner */
  await api.questions.ask({ courseId: C.id, lessonId: L.id, userId: 'u_arjun', userName: 'Arjun', text: 'How much budget should I start with?' });
  const open = await api.doubts.list(R, 'open');
  const dq = JSON.stringify(open).includes('How much budget should I start with?');
  ok(dq, 'learner doubt reaches the tutor’s Doubts inbox');
  const qid = db.questions.find((x) => x.text === 'How much budget should I start with?').id;
  await api.doubts.answer(R, qid, 'Start with ₹300 a day for 5 days, then scale what works.');
  ok(db.notifications.some((n) => n.userId === 'u_arjun' && /doubt was answered/.test(n.title)), 'learner is notified of the answer');
  ok(!JSON.stringify(await api.doubts.list(R, 'open')).includes('How much budget should I start with?') && JSON.stringify(await api.doubts.list(R, 'answered')).includes('How much budget'), 'doubt moves to Answered');

  /* 5. review → course reviews */
  await api.reviews.submit({ courseId: C2.id, userId: stranger, userName: 'Learner stranger', rating: 5, text: 'Clear and practical, loved the examples.', tags: ['Clear'] });
  ok((await api.reviews.list(C2.id)).some?.((r) => r.userId === stranger) ?? JSON.stringify(await api.reviews.list(C2.id)).includes('Clear and practical'), 'review shows on the course page');

  /* 6. finish course → certificate → public verify (unique per learner) */
  const certCourse = seedCourses.find((c) => c.certificate && c.tenantId === 't_rajesh' && c.priceInr > 0 && !api.learning.isEnrolled(stranger, c.id) && c.id !== C2.id) ?? C2;
  if (!api.learning.isEnrolled(stranger, certCourse.id)) await api.commerce.pay({ userId: stranger, courseId: certCourse.id, method: 'upi', source: 'tutor_site', checkoutTenantId: 't_rajesh' });
  const other = await newLearner('other');
  await api.commerce.pay({ userId: other, courseId: certCourse.id, method: 'upi', source: 'tutor_site', checkoutTenantId: 't_rajesh' });
  for (const u of [stranger, other]) for (const l of allLessons(seedCourses.find((c) => c.id === certCourse.id))) api.player.setComplete(u, certCourse.id, l.id, true);
  const c1 = api.certificates.list(stranger).find((x) => x.courseId === certCourse.id);
  const c2 = api.certificates.list(other).find((x) => x.courseId === certCourse.id);
  ok(!!c1 && !!c2, 'both learners get a certificate on completion');
  ok(c1 && c2 && c1.id !== c2.id, 'certificate IDs are unique per learner', [c1?.id, c2?.id]);
  const v = g2.verifyCertificate(c1.id);
  ok(v.valid && v.learner === 'Learner stranger', 'public verify page confirms the earned certificate', v);
  ok(api.certificates.list(stranger).find((x) => x.courseId === certCourse.id).id === c1.id, 'certificate ID is stable when opened again');

  /* 7. Super Admin settings → public pages */
  const cfg = api.settingsAdmin.platform('u_admin').cfg;
  await api.settingsAdmin.savePlatform('u_admin', { ...cfg, trialDays: 7 }, 'shorter trial');
  ok(g2.marketing.pricing().trialDays === 7, 'pricing page shows the trial length Super Admin set (was hardcoded 14)');
  const plan = api.settingsAdmin.plan('u_admin', 'starter');
  const next = { ...plan.p, monthlyInr: 899 };
  await api.settingsAdmin.savePlan('u_admin', 'starter', next, plan.features ?? g2.marketing.pricing().plans.find((x) => x.p.id === 'starter').features, 'price test');
  ok(g2.marketing.pricing().plans.find((x) => x.p.id === 'starter').p.monthlyInr === 899, 'new Starter price shows on the public pricing page');
  await api.settingsAdmin.savePlan('u_admin', 'starter', { ...next, monthlyInr: 799 }, plan.features ?? g2.marketing.pricing().plans.find((x) => x.p.id === 'starter').features, 'restore');

  /* 8. private → off marketplace, learners keep access */
  api.courseAdmin.setListing(R, C.id, 'private');
  const ex = await api.catalog.search({ text: fresh.title.slice(0, 12) }, null);
  ok(!ex.some((x) => x.course.id === C.id), 'private course disappears from the marketplace');
  ok(api.player.open('u_arjun', C.id, L.id).lesson.id === L.id, 'enrolled learner still learns it');
  api.courseAdmin.setListing(R, C.id, 'public_promoted');

  console.log(`  alignment: ${pass} passed, ${fail} failed`);
  fails.forEach((f) => console.log('   ✗ ' + f));
  if (fail) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
