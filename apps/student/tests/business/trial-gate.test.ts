// @ts-nocheck — Node-only test; executed by tests/business/run.sh
/* Free trial & subscription gate, with time travel:
   7-day trial → day-by-day state → day 7 locks the educator workspace (create/upload/live/growth tools blocked,
   subscription still open) → choosing a plan unlocks; plan booked during the trial starts by itself;
   learners keep what they bought but new enrolments/live classes pause; failed renewal → 7-day grace → lock;
   cancelled → works until period end; Super Admin sees it and can extend; Bodhin's own academy never locks. */
import { db } from '@/api/mockDb';
import * as api from '@/api/client';
import { courses as seedCourses } from '@/api/catalogSeed';
import { subGate } from '@/core/business';
import * as growth from '@/api/growth';

let pass = 0, fail = 0; const fails: string[] = [];
const ok = (c, n, x?) => { if (c) pass++; else { fail++; fails.push(n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };
async function throws(fn, n, m?) { try { await fn(); ok(false, n + ' (expected error)'); } catch (e) { ok(!m || m.test(e?.message ?? ''), n, e?.message); } }
async function works(fn, n) { try { return await fn(); } catch (e) { ok(false, n, e?.message); return null; } finally { pass++; } }
const REAL = Date.now; let shift = 0;
Date.now = () => REAL() + shift;
const travel = (days) => { shift += days * 864e5; };
const home = () => { shift = 0; };

(async () => {
  /* ── pure rule ── */
  const T0 = Date.UTC(2026, 10, 14, 6);
  const trial = { plan: 'growth', status: 'trialing', billing: 'monthly', periodEnd: new Date(T0 + 7 * 864e5).toISOString(), addons: [] };
  ok(subGate(trial, T0).state === 'trial' && subGate(trial, T0).daysLeft === 7, 'day 0: trial, 7 days left');
  ok(subGate(trial, T0 + 6.5 * 864e5).daysLeft === 1 && !subGate(trial, T0 + 6.5 * 864e5).locked, 'day 6½: still open, 1 day left');
  ok(subGate(trial, T0 + 7 * 864e5).locked && subGate(trial, T0 + 7 * 864e5).state === 'trial_ended', 'exactly at the end: locked');
  ok(/safe/.test(subGate(trial, T0 + 8 * 864e5).message) && /Choose a plan/.test(subGate(trial, T0 + 8 * 864e5).message), 'lock message says nothing is lost and what to do');
  ok(!subGate(null).locked, 'no subscription (Bodhin) → never locked');

  /* ── a new educator approved with a 7-day trial ── */
  const cfg = api.settingsAdmin.platform('u_admin').cfg;
  await api.settingsAdmin.savePlatform('u_admin', { ...cfg, trialDays: 7 }, 'pilot: 7-day trial');
  const s = await api.auth.signUp({ name: 'Trial Tutor', email: 'trial.tutor@test.in', phone: '9876022222', password: 'demo1234', role: 'tutor' });
  await api.auth.verifySignupOtp(s.userId, '123456');
  await api.auth.submitApplication(s.userId, { workspaceName: 'Trial Maths Academy', subjects: ['Maths'], experienceYears: 4, city: 'Madurai', plannedStudents: 60, sampleUrl: 'https://youtube.com/@trialtutor', idVerified: true });
  const app = db.applications.find((a) => a.userId === s.userId);
  await api.approvals.approveEducator('u_mod', app.id);
  const t = db.tenants.find((x) => x.ownerUserId === s.userId);
  const len = (new Date(t.subscription.periodEnd).getTime() - Date.now()) / 864e5;
  ok(t.subscription.status === 'trialing' && len > 6.9 && len <= 7, '7-day trial set from the Super Admin setting', len);
  const U = s.userId;
  const g = () => api.educator.context(U).gate;
  ok(g().state === 'trial' && g().daysLeft === 7 && !api.educator.context(U).locked, 'day 0: full access');
  const cid = await works(() => api.courseAdmin.create(U), 'day 0: can create a course');
  travel(4);
  ok(g().daysLeft === 3, 'day 4: 3 days left (countdown strip shows from here)', g());
  travel(2.5);
  ok(g().daysLeft === 1 && !g().locked, 'day 6½: last day, still working');
  travel(0.6);
  ok(g().locked && g().state === 'trial_ended', 'day 7: trial ended → locked automatically');
  await throws(() => api.courseAdmin.create(U), 'locked: cannot create a course', /trial has ended/);
  ok(api.courseAdmin.canUpload(U, 50).ok === false, 'locked: uploads refused');
  await throws(() => api.batchesApi.create(U, { courseId: seedCourses[0].id, name: 'X', code: 'XX1', type: 'cohort', instructorIds: [U], capacity: 10, startDate: '2026-12-01', endDate: '2026-12-30', slots: [{ day: 1, start: '07:00', end: '08:00', mode: 'online' }], enrollment: { selfEnroll: true, approval: false, closesAt: '2026-12-01' } }, []), 'locked: cannot create a batch', /trial has ended/);
  const ov = await works(() => api.subscriptionApi.overview(U), 'locked: Subscription screen still opens');
  ok(ov && ov.ctx.locked, 'subscription overview reports the lock');
  // choose a plan after the trial → unlocks now, charged now
  const inv0 = db.invoices.filter((i) => i.tenantId === t.id).length;
  const r = await api.subscriptionApi.changePlan(U, 'starter', 'monthly');
  ok(r.mode === 'now' && t.subscription.status === 'active' && t.subscription.plan === 'starter', 'pick Starter after trial → active now', r);
  ok(!api.educator.context(U).locked, 'workspace unlocked immediately');
  ok(db.invoices.filter((i) => i.tenantId === t.id).length === inv0 + 1 && db.invoices.at(-1).amountInr === Math.round(799 * 1.18), 'invoice for ₹799 + 18% GST', db.invoices.at(-1));
  await works(() => api.courseAdmin.create(U), 'after paying: can create courses again');
  home();

  /* ── plan chosen DURING the trial starts by itself ── */
  const tt = db.tenants.find((x) => x.slug === 'stockmarketsimple');
  const owner = tt.ownerUserId;
  ok(api.educator.context(owner).gate.state === 'trial', 'seeded trial workspace is in trial');
  const r2 = await api.subscriptionApi.changePlan(owner, 'growth', 'monthly');
  ok(r2.mode === 'after_trial' && tt.subscription.status === 'trialing' && tt.subscription.pending?.plan === 'growth', 'Growth during a Growth trial is booked for trial end (old bug: never activated)', r2);
  ok(/starts automatically/.test(api.educator.context(owner).gate.message), 'status says the plan starts automatically');
  travel(10);
  const c2 = api.educator.context(owner);
  ok(!c2.locked && tt.subscription.status === 'active' && tt.subscription.plan === 'growth' && !tt.subscription.pending, 'trial ended → booked plan started, no lock');
  ok(db.invoices.some((i) => i.tenantId === tt.id && /trial converted/.test(i.description)), 'first invoice raised at conversion');
  ok(db.notifications.some((n) => n.userId === owner && /plan has started/.test(n.title)), 'owner told the plan started');
  home();

  /* ── learners & live classes when an academy is locked ── */
  const rt = db.tenants.find((x) => x.id === 't_rajesh');
  const keep = JSON.parse(JSON.stringify(rt.subscription));
  rt.subscription = { ...rt.subscription, status: 'trialing', periodEnd: new Date(Date.now() - 864e5).toISOString(), pending: null };
  const enrolledCourse = db.enrollments.find((e) => e.userId === 'u_arjun' && seedCourses.find((c) => c.id === e.courseId)?.tenantId === 't_rajesh').courseId;
  const paidLesson = seedCourses.find((c) => c.id === enrolledCourse).modules.flatMap((m) => m.lessons).find((l) => !l.preview);
  const op = api.player.open('u_arjun', enrolledCourse, paidLesson.id);
  ok(op && op.lesson.id === paidLesson.id, 'enrolled learner still opens lessons they bought', op && op.lesson?.id);
  const other = seedCourses.find((c) => c.tenantId === 't_rajesh' && !api.learning.isEnrolled('u_arjun', c.id));
  if (other) ok(/isn’t taking new enrolments/.test(api.commerce.route(other.id, null, 'u_arjun').blocked ?? ''), 'new enrolment for a locked academy is blocked at checkout');
  await throws(() => api.commerce.pay({ userId: 'u_arjun', courseId: other.id, method: 'upi', source: 'explore', checkoutTenantId: null }), 'pay() also refuses (server rule, not just the screen)', /new enrolments/);
  const sess = db.classSessions.find((x) => x.batchId === 'b_dm_wk' && x.status === 'scheduled');
  sess.startsAt = new Date(Date.now() - 6e4).toISOString(); sess.endsAt = new Date(Date.now() + 36e5).toISOString(); sess.mode = 'online';
  await throws(() => api.liveTab.join('u_arjun', sess.id), 'learners cannot join live classes of a locked academy', /paused/);
  await throws(() => api.liveAdmin.start('u_rajesh', sess.id), 'tutor cannot go live while locked', /Live classes resume/);
  await throws(() => api.liveAdmin.schedule('u_rajesh', { batchId: 'b_dm_wk', title: 'x', description: '', startsAt: new Date(Date.now() + 864e5).toISOString(), durationMin: 60, instructorId: 'u_rajesh', mode: 'online', settings: { record: true, saveToCourse: true, qa: true, chat: true, trackAttendance: true }, notifyNow: false, reminders: [] }), 'cannot schedule while locked', /trial has ended/);
  await throws(() => growth.leadsApi.list('u_rajesh', 'all'), 'growth tools (CRM) locked too', /trial has ended/);
  // admin sees it and can extend
  const detail = await api.tenantsAdmin.list('u_admin', 'all', '', 'newest');
  const flags = detail ? detail.rows.find((x) => x.t.id === 't_rajesh')?.flags : null;
  ok(flags && flags.locked && flags.trialEnded, 'Super Admin list flags "trial ended · locked"');
  await api.tenantsAdmin.act('u_admin', 't_rajesh', { kind: 'extend_trial', days: 7, reason: 'pilot extension' });
  ok(!api.educator.context('u_rajesh').locked && api.educator.context('u_rajesh').gate.daysLeft === 7, 'admin extends trial → unlocked, 7 days left');
  rt.subscription = keep;

  /* ── failed renewal: 7-day grace, then lock ── */
  rt.subscription = { ...keep, status: 'active', periodEnd: new Date(Date.now() - 2 * 864e5).toISOString() };
  rt.renewalFails = true;
  const gg = api.educator.context('u_rajesh').gate;
  ok(rt.subscription.status === 'past_due' && gg.state === 'grace' && gg.daysLeft === 5 && !gg.locked, 'renewal failed 2 days ago → past due, 5 days of grace, still working', gg);
  travel(6);
  ok(api.educator.context('u_rajesh').locked, 'grace over → locked');
  rt.renewalFails = false;
  await api.subscriptionApi.changePlan('u_rajesh', 'institute', 'annual');
  ok(!api.educator.context('u_rajesh').locked && rt.subscription.status === 'active', 'paying unlocks');
  home();
  // auto-renew works when the card is fine
  rt.subscription = { ...keep, status: 'active', billing: 'monthly', periodEnd: new Date(Date.now() - 3600e3).toISOString() };
  const n0 = db.invoices.length;
  api.educator.context('u_rajesh');
  ok(new Date(rt.subscription.periodEnd).getTime() > Date.now() + 28 * 864e5 && db.invoices.length === n0 + 1 && /renewal/.test(db.invoices.at(-1).description), 'period ended → auto-renewed for a month, one invoice');
  api.educator.context('u_rajesh');
  ok(db.invoices.length === n0 + 1, 'renewal runs once (idempotent)');

  /* ── cancelled ── */
  rt.subscription = { ...keep, status: 'cancelled', periodEnd: new Date(Date.now() + 3 * 864e5).toISOString() };
  ok(!api.educator.context('u_rajesh').locked, 'cancelled: keeps working until the paid period ends');
  travel(4);
  ok(api.educator.context('u_rajesh').locked, 'after the paid period: locked');
  home();
  rt.subscription = keep;

  /* ── Bodhin's own academy ── */
  ok(!api.tenantGate(db.platformConfig.bodhinTenantId).locked, 'Bodhin’s own academy never locks');

  Date.now = REAL;
  console.log(`  trial-gate: ${pass} passed, ${fail} failed`);
  fails.forEach((f) => console.log('   ✗ ' + f));
  if (fail) process.exit(1);
})().catch((e) => { Date.now = REAL; console.error(e); process.exit(1); });
