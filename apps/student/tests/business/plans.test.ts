// @ts-nocheck — Node-only test; executed by tests/business/run.sh
/* Subscription plans: every plan's limits and locked features are enforced by the real api/*.ts on the mock DB.
   Starter / Creator / Growth / Institute, as shown on Subscription & usage. */
import { db } from '@/api/mockDb';
import * as api from '@/api/client';
import * as g from '@/api/growth';
import * as g2 from '@/api/growth2';
import * as ac from '@/api/academy';
import { courses as seedCourses } from '@/api/catalogSeed';
import { getPlan } from '@/core/plans';
import { PLAN_FEATURES } from '@/core/business';

let pass = 0, fail = 0; const fails: string[] = [];
const ok = (c, n, x?) => { if (c) pass++; else { fail++; fails.push(n + (x !== undefined ? '  → ' + JSON.stringify(x)?.slice(0, 200) : '')); } };
const code = async (fn) => { try { await fn(); return 'ok'; } catch (e) { return e?.code ?? String(e); } };

const U = 'u_rajesh';
const t = db.tenants.find((x) => x.ownerUserId === U);
const course = seedCourses.find((c) => c.tenantId === t.id && c.status === 'published');
const freeCourse = seedCourses.find((c) => c.tenantId === t.id && c.priceInr === 0) ?? null;

function setPlan(plan, usage = {}, extra = {}) {
  t.plan = plan;
  t.status = 'active';
  t.subscription = { plan, status: 'active', billing: 'monthly', periodEnd: new Date(Date.now() + 20 * 864e5).toISOString(), addons: [], ...extra };
  t.domain = null;
  t.disabledModules = [];
  db.usage[t.id] = { activeStudents: 0, storageGb: 0, liveHours: 0, tutorSeats: 1, ...usage };
  db.invites = db.invites.filter((i) => i.tenantId !== t.id);
}
// A time far from the seeded classes so only the plan rule can block it.
let slot = 0;
const freeTime = () => { const d = new Date(Date.now() + (40 + slot++) * 864e5); d.setHours(3, 0, 0, 0); return d.toISOString(); };

const GATES: [string, () => unknown][] = [
  ['crm', () => g.leadsApi.list(U, 'all')],
  ['automations', () => g.automationsApi.list(U)],
  ['broadcast', () => g.broadcastsApi.list(U)],
  ['emi', () => g.emiApi.overview(U)],
  ['webinars', () => g.webinarsApi.list(U)],
  ['community', () => g.communityApi.admin(U)],
  ['bundles', () => g2.bundlesApi.list(U)],
  ['affiliates', () => g2.affiliatesApi.admin(U)],
  ['certificate_designer', () => g2.certDesignApi.get(U)],
  ['multi_currency', () => g2.intlApi.admin(U)],
  ['embed', () => g2.embedApi.get(U)],
  ['coupons', () => api.couponsApi.create(U, { code: 'PLANT' + slot++, type: 'pct', value: 10, courseIds: [], maxUses: null, startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 864e5).toISOString() })],
  ['multi_tutor', () => api.teamApi.invite(U, { name: 'Plan Test', email: `plan${slot++}@test.in`, courseIds: [] })],
  ['custom_domain', () => api.workspaceApi.addDomain(U, 'learn.example.com')],
  ['batches', () => api.batchesApi.create(U, { name: 'x', courseId: '' }, [])],
];

(async () => {
  for (const p of ['starter', 'creator', 'growth', 'institute'] as const) {
    const plan = getPlan(p);

    /* Limits shown on Subscription & usage equal the plan */
    setPlan(p);
    const rows = api.educator.context(U).usage.rows;
    const lim = (k) => rows.find((r) => r.key === k)?.limit;
    ok(lim('activeStudents') === plan.activeStudents, `${p}: student limit ${plan.activeStudents}`, lim('activeStudents'));
    ok(lim('storageGb') === plan.videoStorageGb, `${p}: video limit ${plan.videoStorageGb} GB`, lim('storageGb'));
    ok(lim('liveHours') === plan.liveRoomHoursPerMonth, `${p}: live limit ${plan.liveRoomHoursPerMonth} h`, lim('liveHours'));
    ok(lim('tutorSeats') === plan.tutorSeats, `${p}: tutor seats ${plan.tutorSeats}`, lim('tutorSeats'));

    /* Locked features: blocked with an upgrade message; included features open */
    for (const [f, fn] of GATES) {
      setPlan(p);
      const r = await code(fn);
      const included = f === 'custom_domain' ? plan.customDomain === 'included' : PLAN_FEATURES[p].includes(f);
      const blocked = r === 'plan' || r === 'module';
      ok(included ? !blocked : blocked, `${p}: ${f} ${included ? 'open' : 'locked'}`, r);
    }
    // Custom domain add-on unlocks it on plans where it's an add-on
    if (plan.customDomain === 'addon') {
      setPlan(p, {}, { addons: [{ kind: 'custom_domain', qty: 1 }] });
      ok((await code(() => api.workspaceApi.addDomain(U, 'learn.example.com'))) !== 'plan', `${p}: custom domain add-on unlocks domain`);
    }

    /* Students: at the limit new learners can't enrol (existing ones keep access) */
    setPlan(p, { activeStudents: plan.activeStudents });
    const route = api.commerce.route(course.id, null, 'u_plan_newbie');
    ok(!!route.blocked, `${p}: enrolment paused at ${plan.activeStudents} students`, route.blocked);
    setPlan(p, { activeStudents: plan.activeStudents - 1 });
    ok(!api.commerce.route(course.id, null, 'u_plan_newbie').blocked || api.commerce.route(course.id, null, 'u_plan_newbie').blocked?.includes('payment setup'), `${p}: enrolment open below the limit`, api.commerce.route(course.id, null, 'u_plan_newbie').blocked);
    if (freeCourse) {
      setPlan(p, { activeStudents: plan.activeStudents });
      ok((await code(() => api.commerce.enrollFree('u_plan_newbie', freeCourse.id, 'direct'))) === 'not_open', `${p}: free enrolment paused at the limit`);
    }

    /* Video storage: uploads stop at the limit */
    setPlan(p, { storageGb: plan.videoStorageGb });
    ok(!api.courseAdmin.canUpload(U, 50).ok, `${p}: upload blocked when ${plan.videoStorageGb} GB is full`);
    setPlan(p, { storageGb: plan.videoStorageGb - 1 });
    ok(api.courseAdmin.canUpload(U, 50).ok, `${p}: 50 MB upload allowed with 1 GB free`);
    ok(!api.courseAdmin.canUpload(U, 2048).ok, `${p}: 2 GB upload blocked with 1 GB free`);

    /* Live room-hours: course-wide classes can't be scheduled past the monthly limit */
    setPlan(p, { liveHours: plan.liveRoomHoursPerMonth });
    const full = await code(() => ac.courseLive.schedule(U, { courseId: course.id, title: 'Plan limit class', startsAt: freeTime(), durationMin: 60, notifyNow: false }));
    ok(full === 'limit', `${p}: course live class blocked when ${plan.liveRoomHoursPerMonth} h used`, full);
    setPlan(p, { liveHours: 0 });
    const open = await code(() => ac.courseLive.schedule(U, { courseId: course.id, title: 'Plan open class', startsAt: freeTime(), durationMin: 60, notifyNow: false }));
    ok(open === 'ok', `${p}: course live class allowed with hours left`, open);

    /* Live room-hours: a new online batch must fit this month's hours left */
    if (PLAN_FEATURES[p].includes('batches')) {
      const d1 = new Date(Date.now() + 864e5), d2 = new Date(Date.now() + 6 * 864e5);
      if (d1.getMonth() === new Date().getMonth()) {
        const hr = { starter: 1, creator: 2, growth: 4, institute: 6 }[p];
        const batch = (code) => ({ courseId: course.id, type: 'cohort', instructorIds: [U], capacity: 30, startDate: d1.toISOString().slice(0, 10), endDate: d2.toISOString().slice(0, 10), enrollment: { selfEnroll: true, approval: false, closesAt: d2.toISOString() }, name: `Plan Batch ${code}`, code, slots: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, start: `0${hr}:00`, end: `0${hr}:45`, mode: 'online' })) });
        setPlan(p, { liveHours: plan.liveRoomHoursPerMonth });
        const r = await code(() => api.batchesApi.create(U, batch(`PL${p.slice(0, 3).toUpperCase()}1`), []));
        ok(r === 'limit', `${p}: online batch blocked when this month's live hours are used`, r);
        setPlan(p, { liveHours: 0 });
        const r2 = await code(() => api.batchesApi.create(U, batch(`PL${p.slice(0, 3).toUpperCase()}2`), []));
        ok(r2 === 'ok', `${p}: online batch allowed with hours left`, r2);
      }
    }

    /* Tutor seats: invites stop when every seat is used */
    if (PLAN_FEATURES[p].includes('multi_tutor')) {
      setPlan(p);
      const seats = api.teamApi.get(U).seats;
      for (let i = seats.used; i < seats.limit; i++) db.invites.push({ id: `iv_plan_${i}`, tenantId: t.id, name: 'Seat filler', email: `seat${i}@test.in`, courseIds: [], sentAt: new Date().toISOString() });
      const r = await code(() => api.teamApi.invite(U, { name: 'One Too Many', email: 'extra@test.in', courseIds: [] }));
      ok(r === 'seats', `${p}: invite blocked when all ${seats.limit} seats are used`, r);
    }

    /* Downgrade blocked while over the smaller plan's limits */
    if (p !== 'starter') {
      setPlan(p, { activeStudents: plan.activeStudents });
      const r = await code(() => api.subscriptionApi.changePlan(U, 'starter', 'monthly'));
      ok(r !== 'ok', `${p}: can't move to Starter while over its student limit`, r);
    }
  }

  console.log(`  plans: ${pass} passed, ${fail} failed`);
  fails.forEach((f) => console.log('  ✗ ' + f));
  if (fail) process.exitCode = 1;
})();
