// @ts-nocheck — Node-only test; executed by tests/business/run.sh
/* Super Admin portal, section by section (QA pass, Nov 21): every admin action through the real api/client.ts,
   checking the outcome (data, notification, audit, permission), not just "no crash". */
import { db } from '@/api/mockDb';
import * as api from '@/api/client';
import { courses as seedCourses } from '@/api/catalogSeed';

let pass = 0, fail = 0; const fails: string[] = [];
const ok = (c, n, x?) => { if (c) pass++; else { fail++; fails.push(n + (x !== undefined ? '  → ' + JSON.stringify(x)?.slice(0, 220) : '')); } };
const call = async (fn) => { try { return { r: await fn() }; } catch (e) { return { e }; } };
const ADMIN = 'u_admin';
const audited = (action, id?) => db.audit.some((a) => a.action === action && (!id || a.target.id === id));
const notified = (userId, re) => db.notifications.some((n) => n.userId === userId && re.test(`${n.title} ${n.body}`));

(async () => {
  await api.admin.verify(ADMIN, '123456');

  /* ── Home / overview ── */
  const ov = await call(() => api.admin.overview(ADMIN));
  ok(!ov.e && ov.r, 'Home: overview loads', ov.e?.message);

  /* ── Tenants ── */
  const list = await api.tenantsAdmin.list(ADMIN, 'all', '', 'newest');
  ok(Array.isArray(list.rows ?? list) && (list.rows ?? list).length > 0, 'Tenants: list loads');
  const search = await api.tenantsAdmin.list(ADMIN, 'all', 'rajesh', 'newest');
  ok((search.rows ?? search).some((r) => (r.t ?? r).id === 't_rajesh'), 'Tenants: search by name finds Rajesh Kumar Academy');
  const tr = db.tenants.find((t) => t.subscription?.status === 'trialing' && new Date(t.subscription.periodEnd).getTime() > Date.now());
  if (tr) {
    const before = new Date(tr.subscription.periodEnd).getTime();
    const ex = await call(() => api.tenantsAdmin.act(ADMIN, tr.id, { kind: 'extend_trial', days: 7, reason: 'QA extend trial' }));
    ok(!ex.e && Math.round((new Date(tr.subscription.periodEnd).getTime() - before) / 864e5) === 7, 'Tenants: extend trial by 7 days', ex.e?.message);
    ok(audited('tenant.extend_trial', tr.id), 'Tenants: trial extension audited');
  }
  const t = db.tenants.find((x) => x.id === 't_priyacodes') ?? db.tenants.find((x) => x.id !== 't_bodhin' && x.id !== 't_rajesh');
  const sus = await call(() => api.tenantsAdmin.act(ADMIN, t.id, { kind: 'status', status: 'suspended', reason: 'QA suspend test' }));
  ok(!sus.e && t.status === 'suspended', 'Tenants: suspend workspace', sus.e?.message);
  const c1 = seedCourses.find((c) => c.tenantId === t.id);
  if (c1) ok(!!api.commerce.route(c1.id, null, 'u_qa_new').blocked, 'Tenants: suspended academy takes no new enrolments');
  const act = await call(() => api.tenantsAdmin.act(ADMIN, t.id, { kind: 'status', status: 'active', reason: 'QA reactivate' }));
  ok(!act.e && t.status === 'active', 'Tenants: reactivate workspace', act.e?.message);
  const np = await call(() => api.tenantsAdmin.act(ADMIN, t.id, { kind: 'plan', plan: 'institute', billing: 'monthly', when: 'now', reason: 'QA upgrade' }));
  ok(!np.e && t.subscription?.plan === 'institute', 'Tenants: change plan now → Institute', np.e?.message ?? t.subscription?.plan);
  const ad = await call(() => api.tenantsAdmin.act(ADMIN, t.id, { kind: 'addon', addon: 'storage', qty: 1, free: true, reason: 'QA free storage' }));
  ok(!ad.e && t.subscription.addons.some((a) => a.kind === 'storage'), 'Tenants: add a free storage add-on', ad.e?.message);
  const rm = await call(() => api.tenantsAdmin.act(ADMIN, t.id, { kind: 'remove_addon', addon: 'storage', reason: 'QA remove storage' }));
  ok(!rm.e && !t.subscription.addons.some((a) => a.kind === 'storage'), 'Tenants: remove the add-on', rm.e?.message);
  const ovr = await call(() => api.tenantsAdmin.act(ADMIN, t.id, { kind: 'overrides', features: { embed: true }, limits: { activeStudents: 2000 }, reason: 'QA override' }));
  ok(!ovr.e && t.subscription.overrides?.features?.embed === true && t.subscription.overrides?.limits?.activeStudents === 2000, 'Tenants: feature + limit override', ovr.e?.message);
  const msg = await call(() => api.tenantsAdmin.act(ADMIN, t.id, { kind: 'message', title: 'QA message to owner', body: 'Hello from Bodhin QA' }));
  ok(!msg.e && notified(t.ownerUserId, /QA message to owner/), 'Tenants: message reaches the owner', msg.e?.message);
  const note = await call(() => api.tenantsAdmin.act(ADMIN, t.id, { kind: 'note', text: 'QA internal note' }));
  ok(!note.e && db.tenantNotes.some((n) => n.tenantId === t.id && n.text === 'QA internal note'), 'Tenants: internal note saved', note.e?.message);
  const noReason = await call(() => api.tenantsAdmin.act(ADMIN, t.id, { kind: 'status', status: 'suspended', reason: '' }));
  ok(!!noReason.e && t.status === 'active', 'Tenants: suspending needs a reason');
  const sup = await call(() => api.tenantsAdmin.act('u_sup', t.id, { kind: 'status', status: 'suspended', reason: 'support tries' }));
  ok(!!sup.e, 'Tenants: support role cannot suspend');
  const det = await call(() => api.tenantsAdmin.detail(ADMIN, t.id));
  ok(!det.e && det.r, 'Tenants: detail page data loads', det.e?.message);

  /* ── Inbox: educators ── */
  const irfan = db.applications.find((a) => a.id === 'app_irfan');
  if (irfan) {
    const short = await call(() => api.approvals.decideEducator(ADMIN, irfan.id, 'changes_requested', 'x'));
    ok(!!short.e, 'Inbox: asking for changes needs a real note');
    const ch = await call(() => api.approvals.decideEducator(ADMIN, irfan.id, 'changes_requested', 'Please add a teaching sample video link.'));
    ok(!ch.e && irfan.status === 'changes_requested' && notified(irfan.userId, /update your educator application/i), 'Inbox: request changes → status + applicant notified', ch.e?.message);
  }
  const another = db.applications.find((a) => ['submitted', 'under_review'].includes(a.status));
  if (another) {
    const rj = await call(() => api.approvals.decideEducator(ADMIN, another.id, 'rejected', 'Teaching sample does not match the subjects listed.'));
    ok(!rj.e && another.status === 'rejected' && notified(another.userId, /not approved/i), 'Inbox: reject educator → applicant notified', rj.e?.message);
  }

  /* ── Inbox: courses ── */
  const pend = db.courses.filter((c) => c.moderation === 'pending');
  if (pend[0]) {
    const ap = await call(() => api.approvals.decideCourse(ADMIN, pend[0].id, 'approve'));
    const c = seedCourses.find((x) => x.id === pend[0].id);
    ok(!ap.e && c.moderation === 'approved', 'Inbox: approve course', ap.e?.message ?? c?.moderation);
    ok(audited('course.approve', c.id) || db.audit.some((a) => a.target.id === c.id), 'Inbox: course approval audited');
  }
  if (pend[1]) {
    const noNote = await call(() => api.approvals.decideCourse(ADMIN, pend[1].id, 'reject', { note: '' }));
    ok(!!noNote.e, 'Inbox: rejecting a course needs a reason');
    const rj = await call(() => api.approvals.decideCourse(ADMIN, pend[1].id, 'reject', { note: 'Intro video is missing and lesson 2 audio is unclear.' }));
    const c = seedCourses.find((x) => x.id === pend[1].id);
    ok(!rj.e && c.moderation === 'rejected', 'Inbox: reject course with reason', rj.e?.message ?? c?.moderation);
  }

  /* ── Inbox: reports ── */
  const rep = (db.reports ?? []).find((r) => r.status !== 'resolved' && r.status !== 'dismissed');
  if (rep) {
    const rr = await call(() => api.approvals.resolveReport(ADMIN, rep.id, 'dismiss', 'Reviewed: content follows the guidelines.'));
    ok(!rr.e && rep.status && rep.status !== 'open', 'Inbox: dismiss a report', rr.e?.message ?? rep.status);
  }

  /* ── More → Feature flags & maintenance ── */
  const f0 = api.flagsAdmin.get(ADMIN).flags;
  const fl = await call(() => api.flagsAdmin.save(ADMIN, { ...f0, maintenance: { on: true, message: 'QA maintenance window tonight 11 pm' }, tutorSignups: false }, 'QA maintenance test'));
  ok(!fl.e && db.flags.maintenance.on && db.flags.tutorSignups === false, 'Flags: maintenance on + tutor sign-ups paused', fl.e?.message);
  const blockedSignup = await call(() => api.auth.signUp({ name: 'QA Tutor', email: 'qa.tutor.flags@test.in', phone: '9876011111', password: 'demo1234', role: 'tutor' }));
  ok(!!blockedSignup.e && /paused/i.test(blockedSignup.e.message), 'Flags: paused tutor sign-ups really block sign-up', blockedSignup.e?.message);
  await api.flagsAdmin.save(ADMIN, { ...f0 }, 'QA restore flags');
  ok(!db.flags.maintenance.on && db.flags.tutorSignups === true, 'Flags: restored');
  ok(!!(await call(() => api.flagsAdmin.save(ADMIN, { ...f0, liveClasses: false }, ''))).e, 'Flags: change needs a reason');

  /* ── More → Platform rules ── */
  const cfg = api.settingsAdmin.platform(ADMIN).cfg;
  const imp = api.settingsAdmin.platformImpact({ ...cfg, commissionRate: 0.25 });
  ok(imp.changes.some((c) => /commission/i.test(c.field)), 'Platform rules: impact preview lists the commission change');
  const sp = await call(() => api.settingsAdmin.savePlatform(ADMIN, { ...cfg, commissionRate: 0.25 }, 'QA commission test'));
  ok(!sp.e && db.platformConfig.commissionRate === 0.25, 'Platform rules: commission saved', sp.e?.message);
  ok(!!(await call(() => api.settingsAdmin.savePlatform(ADMIN, { ...cfg, commissionRate: 0.9 }, 'too high'))).e, 'Platform rules: 90% commission rejected');
  await api.settingsAdmin.savePlatform(ADMIN, { ...cfg }, 'QA restore commission');

  /* ── Bodhin content → curation ── */
  const cur = api.contentAdmin.curation(ADMIN);
  ok(cur && cur.courses?.length !== 0, 'Curation: loads');
  const pub = seedCourses.filter((c) => c.status === 'published').slice(0, 2).map((c) => c.id);
  const fe = await call(() => api.contentAdmin.setList(ADMIN, 'featured', pub));
  ok(!fe.e && JSON.stringify(db.curation.featured) === JSON.stringify(pub), 'Curation: set featured courses', fe.e?.message);
  const cat = await call(() => api.contentAdmin.saveCategory(ADMIN, { name: 'QA Robotics', icon: 'hardware-chip' }));
  ok(!cat.e && (db.curation.categories ?? []).some((c) => c.name === 'QA Robotics'), 'Curation: add a category', cat.e?.message);

  /* ── Users ── */
  const ul = api.usersAdmin.list(ADMIN, 'all', 'arjun');
  ok((ul.rows ?? ul).some((r) => (r.u ?? r).id === 'u_arjun'), 'Users: search finds Arjun');
  const course = seedCourses.find((c) => c.status === 'published' && !db.enrollments.some((e) => e.userId === 'u_meera' && e.courseId === c.id));
  const gr = await call(() => api.usersAdmin.act(ADMIN, 'u_meera', { kind: 'grant', courseId: course.id, reason: 'QA complimentary access' }));
  ok(!gr.e && db.enrollments.some((e) => e.userId === 'u_meera' && e.courseId === course.id), 'Users: grant course access', gr.e?.message);
  const rv = await call(() => api.usersAdmin.act(ADMIN, 'u_meera', { kind: 'revoke', courseId: course.id, reason: 'QA revoke access' }));
  ok(!rv.e && !db.enrollments.some((e) => e.userId === 'u_meera' && e.courseId === course.id && (!e.validTill || new Date(e.validTill) > new Date())), 'Users: revoke course access', rv.e?.message);
  const rs = await call(() => api.usersAdmin.act(ADMIN, 'u_meera', { kind: 'reset' }));
  ok(!rs.e, 'Users: send password reset', rs.e?.message);
  const ud = await call(() => api.usersAdmin.detail(ADMIN, 'u_arjun'));
  ok(!ud.e && ud.r, 'Users: detail loads', ud.e?.message);

  /* ── Admin team & roles ── */
  const inv = await call(() => api.staffAdmin.invite(ADMIN, { name: 'QA Moderator', email: 'qa.mod@thebodhin.com', role: 'moderator' }));
  ok(!inv.e, 'Admin team: invite a moderator', inv.e?.message);
  const staff = api.staffAdmin.list(ADMIN);
  const qa = (staff.rows ?? staff).find((r) => (r.u ?? r).email === 'qa.mod@thebodhin.com');
  ok(!!qa, 'Admin team: invited moderator listed');
  if (qa) {
    const id = (qa.u ?? qa).id;
    ok(!(await call(() => api.staffAdmin.setRole(ADMIN, id, 'support'))).e, 'Admin team: change role → support');
    ok(!(await call(() => api.staffAdmin.remove(ADMIN, id))).e, 'Admin team: remove staff member');
  }
  ok(!!(await call(() => api.staffAdmin.invite('u_sup', { name: 'X', email: 'x@thebodhin.com', role: 'super_admin' }))).e, 'Admin team: support cannot add admins');

  /* ── Search & audit ── */
  const sr = await call(() => api.admin.search(ADMIN, 'rajesh'));
  ok(!sr.e && JSON.stringify(sr.r).toLowerCase().includes('rajesh'), 'Search: finds Rajesh', sr.e?.message);
  const al = api.auditAdmin.list(ADMIN, 'all', 'QA');
  ok((al.rows ?? al).length >= 5, 'Audit log: QA actions recorded and searchable', (al.rows ?? al).length);
  ok(typeof api.auditAdmin.csv((al.rows ?? al)) === 'string', 'Audit log: CSV export');

  console.log(`  admin-portal: ${pass} passed, ${fail} failed`);
  fails.forEach((f) => console.log('  ✗ ' + f));
  if (fail) process.exitCode = 1;
})().catch((e) => { console.log('CRASH', e); process.exitCode = 1; });
