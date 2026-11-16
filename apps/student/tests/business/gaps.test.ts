// @ts-nocheck — Node-only test; executed by tests/business/run.sh
/* Blueprint gaps: recording retention, module on/off (enforced everywhere, data kept), pilot success measures. */
import { db } from '@/api/mockDb';
import * as api from '@/api/client';
import * as growth from '@/api/growth';
import { courses as seedCourses } from '@/api/catalogSeed';

let pass = 0, fail = 0; const fails: string[] = [];
const ok = (c, n, x?) => { if (c) pass++; else { fail++; fails.push(n + (x !== undefined ? '  → ' + JSON.stringify(x)?.slice(0, 300) : '')); } };
async function throws(fn, n, m?) { try { await fn(); ok(false, n + ' (expected error)'); } catch (e) { ok(!m || m.test(e?.message ?? ''), n, e?.message); } }
const ago = (d) => new Date(Date.now() - d * 864e5).toISOString();

(async () => {
  /* recording retention */
  ok(api.recordingWindow(ago(10), 180).available && api.recordingWindow(ago(10), 180).daysLeft === 170, 'class 10 days ago: 170 days of recording left');
  ok(!api.recordingWindow(ago(181), 180).available, 'after 180 days the recording expires');
  ok(api.recordingWindow(ago(2000), 0).available && api.recordingWindow(ago(2000), 0).until === null, '0 = keep forever');
  const cfg = api.settingsAdmin.platform('u_admin').cfg;
  ok(cfg.recordingRetentionDays === 180, 'default retention 180 days visible to Super Admin');
  await throws(() => api.settingsAdmin.savePlatform('u_admin', { ...cfg, recordingRetentionDays: 5 }, 'trying a very short retention'), 'retention below 30 days refused', /30–1095/);
  await api.settingsAdmin.savePlatform('u_admin', { ...cfg, recordingRetentionDays: 30 }, 'short pilot retention');
  const sch = await api.liveTab.schedule('u_arjun', null);
  ok(sch.past.length > 0 && sch.past.every((r) => 'recording' in r), 'learner Past rows carry the recording window');
  ok(sch.past.some((r) => r.recording.available === (Date.now() - new Date(r.session.endsAt).getTime() < 30 * 864e5)), 'availability follows the new 30-day rule');
  await api.settingsAdmin.savePlatform('u_admin', { ...api.settingsAdmin.platform('u_admin').cfg, recordingRetentionDays: 180 }, 'restore');

  /* modules on/off */
  const R = 'u_rajesh';
  const mods = api.modulesApi.list(R);
  ok(mods.length >= 15 && mods.every((m) => m.inPlan && m.on), 'Institute academy: every module available and on');
  api.modulesApi.set(R, 'live_classes', false);
  ok(!api.modulesApi.list(R).find((m) => m.key === 'live_classes').on, 'owner switches live classes off');
  await throws(() => api.liveAdmin.schedule(R, { batchId: 'b_dm_wk', title: 'x class', description: '', startsAt: new Date(Date.now() + 2 * 864e5).toISOString(), durationMin: 60, instructorId: R, mode: 'online', settings: { record: true, saveToCourse: true, qa: true, chat: true, trackAttendance: true }, notifyNow: false, reminders: [] }), 'off → cannot schedule live classes', /switched off/);
  const sess = db.classSessions.find((x) => x.batchId === 'b_dm_wk' && x.status === 'scheduled');
  sess.startsAt = new Date(Date.now() - 6e4).toISOString(); sess.endsAt = new Date(Date.now() + 36e5).toISOString(); sess.mode = 'online';
  await throws(() => api.liveTab.join('u_arjun', sess.id), 'off → learners can’t join either', /switched off live classes/);
  api.modulesApi.set(R, 'live_classes', true);
  const j = await api.liveTab.join('u_arjun', sess.id);
  ok(!!j.token, 'switched back on → everything works again (nothing was deleted)');
  // CRM off: hub shows "off", API refuses, data kept
  const leadsBefore = growth.leadsApi.list(R, 'all');
  api.modulesApi.set(R, 'crm', false);
  const hub = growth.growHub.get(R).tools.find((t) => t.key === 'crm');
  ok(!hub.on && hub.off, 'grow hub shows CRM as switched off (not "upgrade")');
  await throws(() => growth.leadsApi.list(R, 'all'), 'CRM API refuses while off', /upgrade|Leads/i);
  api.modulesApi.set(R, 'crm', true);
  ok(JSON.stringify(growth.leadsApi.list(R, 'all')) === JSON.stringify(leadsBefore), 'CRM back on → same leads (data kept)');
  // coupons off → code ignored at checkout
  const C2 = seedCourses.find((c) => c.tenantId === 't_rajesh' && c.priceInr > 0);
  api.couponsApi.create(R, { code: 'MODTEST10', type: 'pct', value: 10, courseIds: [C2.id], maxUses: null, startsAt: new Date(Date.now() - 6e4).toISOString(), endsAt: new Date(Date.now() + 864e5).toISOString() });
  ok(api.commerce.quote(C2.id, 'MODTEST10').discountInr > 0, 'coupon works while Coupons is on');
  api.modulesApi.set(R, 'coupons', false);
  await throws(() => api.commerce.quote(C2.id, 'MODTEST10'), 'Coupons off → code no longer accepted', /not valid|valid/i);
  api.modulesApi.set(R, 'coupons', true);
  // marketplace off → off thebodhin.com, still on own site
  const listed = seedCourses.find((c) => c.tenantId === 't_rajesh' && c.visibility !== 'private' && c.moderation === 'approved');
  ok((await api.catalog.search({ text: '' }, null)).some((x) => x.course.id === listed.id), 'listed course is on the marketplace');
  api.modulesApi.set(R, 'marketplace', false);
  ok(!(await api.catalog.search({ text: '' }, null)).some((x) => x.course.id === listed.id), 'Marketplace off → course leaves thebodhin.com');
  ok((await api.catalog.search({ text: '' }, 't_rajesh')).some((x) => x.course.id === listed.id), '…but stays on the academy’s own site');
  api.modulesApi.set(R, 'marketplace', true);
  // not in plan
  const starterOwner = db.tenants.find((t) => t.slug === 'yogawithmeena').ownerUserId;
  await throws(() => api.modulesApi.set(starterOwner, 'crm', true), 'cannot switch on a module the plan does not include', /isn’t in your plan/);
  await throws(() => api.modulesApi.list('u_meera'), 'tutors (non-owners) cannot change modules', /owner/);
  ok(db.audit.some((a) => a.action === 'module.off') && db.audit.some((a) => a.action === 'module.on'), 'module changes are in the audit log');

  /* pilot success */
  const p = api.pilotOps.overview('u_admin');
  ok(p.funnel.length === 5 && p.funnel[0].n >= p.funnel[1].n && p.funnel[0].n > 0, 'activation funnel from approval to first live class', p.funnel);
  ok(p.channels.length === 3 && p.channels.every((c) => c.rate >= 0 && c.rate <= 100), 'refund rate per channel', p.channels);
  ok(p.subs.trial + p.subs.paying + p.subs.locked >= 1 && typeof p.medianDaysToPublish !== 'undefined', 'subscriptions and time-to-first-course reported');
  await throws(() => api.pilotOps.overview('u_arjun'), 'learners cannot open pilot metrics', /admin role/);

  console.log(`  gaps: ${pass} passed, ${fail} failed`);
  fails.forEach((f) => console.log('   ✗ ' + f));
  if (fail) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
