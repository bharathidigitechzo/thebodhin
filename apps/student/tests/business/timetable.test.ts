// @ts-nocheck — Node-only test; executed by tests/business/run.sh
/* Timetable & live classes: clash rules (batch + instructor), weekly slot overlap, reschedule, in-person classes,
   batch members joining, week views (learner + educator), Super Admin live monitor and its permission. */
import { db } from '@/api/mockDb';
import * as api from '@/api/client';
import { findClash, instructorClashIds, overlaps, slotClashes, weekDays, weekStart } from '@/core/timetable';

let pass = 0, fail = 0; const fails: string[] = [];
const ok = (c, n, x?) => { if (c) pass++; else { fail++; fails.push(n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };
async function throws(fn, n, m?) { try { await fn(); ok(false, n + ' (expected error)'); } catch (e) { ok(!m || m.test(e?.message ?? ''), n, e?.message); } }
const SET = { record: true, saveToCourse: true, qa: true, chat: true, trackAttendance: true };
const at = (days, h, m = 0) => { const d = new Date(Date.now() + days * 864e5); d.setHours(h, m, 0, 0); return d.toISOString(); };
const sched = (batchId, startsAt, instructorId, extra = {}) => api.liveAdmin.schedule('u_rajesh', { batchId, title: 'Timetable test class', description: '', startsAt, durationMin: 60, instructorId, mode: 'online', settings: SET, notifyNow: true, reminders: [15], ...extra });

(async () => {
  /* pure rules */
  ok(!overlaps({ start: 0, end: 10 }, { start: 10, end: 20 }) && overlaps({ start: 0, end: 11 }, { start: 10, end: 20 }), 'back-to-back classes do not clash; overlapping ones do');
  ok(slotClashes([{ day: 1, start: '18:00', end: '19:00', mode: 'online' }, { day: 1, start: '18:30', end: '19:30', mode: 'online' }]).length === 1, 'overlapping weekly slots on the same day detected');
  ok(slotClashes([{ day: 1, start: '18:00', end: '19:00', mode: 'online' }, { day: 3, start: '18:00', end: '19:00', mode: 'online' }, { day: 1, start: '19:00', end: '20:00', mode: 'online' }]).length === 0, 'different days / back-to-back slots are fine');
  const ws = weekStart(new Date('2026-11-14T10:00:00'));
  ok(ws.getDay() === 1 && ws.getDate() === 9, 'week starts on Monday', ws.toString());
  const wd = weekDays([{ startsAt: new Date(2026, 10, 9, 9).toISOString() }, { startsAt: new Date(2026, 10, 15, 21).toISOString() }, { startsAt: new Date(2026, 10, 16, 9).toISOString() }], ws);
  ok(wd.length === 7 && wd[0].items.length === 1 && wd[6].items.length === 1 && wd.reduce((n, d) => n + d.items.length, 0) === 2, 'week view puts classes on the right day and skips next week');

  /* scheduling: same batch, then same instructor in another batch */
  const t1 = at(3, 10);
  const id1 = await sched('b_dm_wk', t1, 'u_rajesh');
  ok(!!id1, 'class scheduled');
  await throws(() => sched('b_dm_wk', at(3, 10, 30), 'u_meera'), 'same batch overlapping time blocked', /in this batch/);
  await throws(() => sched('b_meta_eve', t1, 'u_rajesh'), 'same instructor double-booked in another batch is blocked', /Rajesh.*already teaching/);
  const id2 = await sched('b_meta_eve', t1, 'u_meera');
  ok(!!id2, 'another instructor can teach the other batch at the same time');
  const id3 = await sched('b_dm_wk', at(3, 11), 'u_rajesh');
  ok(!!id3, 'back-to-back class in the same batch allowed');
  ok(db.notifications.filter((n) => /New live class scheduled/.test(n.title)).length > 0 || db.people.some((p) => (p.inbox ?? []).length), 'students notified of new class');

  /* reschedule */
  await throws(() => api.liveAdmin.reschedule('u_rajesh', id1, { startsAt: at(0, 0), durationMin: 60 }), 'cannot move a class into the past', /5 minutes/);
  await throws(() => api.liveAdmin.reschedule('u_rajesh', id1, { startsAt: at(3, 10, 30), durationMin: 60 }), 'move into a clash (own batch next class) blocked', /in this batch/);
  await throws(() => api.liveAdmin.reschedule('u_rajesh', id3, { startsAt: at(3, 11), durationMin: 600 }), 'silly duration rejected', /15 minutes to 5 hours/);
  const moved = await api.liveAdmin.reschedule('u_rajesh', id1, { startsAt: at(4, 9), durationMin: 90 });
  ok(moved.startsAt === at(4, 9) && new Date(moved.endsAt).getTime() - new Date(moved.startsAt).getTime() === 90 * 6e4, 'class moved with new duration');
  ok(db.people.some((p) => JSON.stringify(p).includes('Class time changed')) || db.notifications.some((n) => n.title === 'Class time changed'), 'students told the time changed');
  await throws(() => api.liveAdmin.reschedule('u_arjun', id1, { startsAt: at(5, 9), durationMin: 60 }), 'a learner cannot move classes', /can’t change/);
  api.batchesApi.setSessionStatus(id3, 'cancelled');
  await throws(() => api.liveAdmin.reschedule('u_rajesh', id3, { startsAt: at(5, 9), durationMin: 60 }), 'cancelled class must be restored before moving', /Restore/);
  const id4 = await sched('b_dm_wk', at(3, 11), 'u_rajesh');
  ok(!!id4, 'cancelled class frees its slot');

  /* batch creation: overlapping slots + lead instructor busy */
  const course = db.batches.find((b) => b.id === 'b_dm_wk').courseId;
  const base = { courseId: course, type: 'cohort', instructorIds: ['u_rajesh'], capacity: 30, startDate: at(1, 0).slice(0, 10), endDate: at(30, 0).slice(0, 10), enrollment: { selfEnroll: true, approval: false, closesAt: at(10, 0) } };
  await throws(() => api.batchesApi.create('u_rajesh', { ...base, name: 'Overlap Batch', code: 'OVL1', slots: [{ day: 2, start: '18:00', end: '19:00', mode: 'online' }, { day: 2, start: '18:30', end: '20:00', mode: 'online' }] }, []), 'overlapping weekly slots rejected', /overlap/);
  const busy = db.classSessions.find((s) => s.batchId === 'b_dm_wk' && s.status === 'scheduled' && new Date(s.startsAt).getTime() > Date.now() + 864e5 && !s.instructorId);
  const bd = new Date(busy.startsAt);
  const hh = (d) => d.toTimeString().slice(0, 5);
  await throws(() => api.batchesApi.create('u_rajesh', { ...base, name: 'Busy Batch', code: 'BSY1', slots: [{ day: bd.getDay(), start: hh(bd), end: hh(new Date(busy.endsAt)), mode: 'online' }] }, []), 'new batch whose slot clashes with the lead instructor’s class is rejected', /already teaching/);
  const nb = await api.batchesApi.create('u_rajesh', { ...base, name: 'Free Batch', code: 'FRE1', slots: [{ day: 3, start: '06:00', end: '07:00', mode: 'offline' }] }, ['p_arjun']);
  ok(!!nb && db.classSessions.filter((s) => s.batchId === nb).length >= 3, 'batch at a free time created with its classes');
  ok(instructorClashIds(db.classSessions, db.batches).size === 0, 'no instructor double-bookings anywhere after all of this', [...instructorClashIds(db.classSessions, db.batches)]);

  /* learners: in-person classes, batch members joining */
  const sch = await api.liveTab.schedule('u_arjun', null);
  const off = sch.upcoming.find((r) => db.classSessions.find((s) => s.id === r.session.id)?.batchId === nb);
  ok(off && off.session.mode === 'offline', 'in-person class reaches the learner marked as in person');
  ok(sch.upcoming.some((r) => r.session.id === moved.id && r.session.startsAt === moved.startsAt), 'learner sees the moved class at its new time');
  ok(!sch.upcoming.some((r) => r.session.id === id3), 'learner does not see the cancelled class');
  const offRow = db.classSessions.find((s) => s.batchId === nb);
  offRow.startsAt = new Date(Date.now() - 6e4).toISOString(); offRow.endsAt = new Date(Date.now() + 36e5).toISOString(); offRow.instructorId = 'u_guest_teacher'; // keep the test itself clash-free
  await throws(() => api.liveTab.join('u_arjun', offRow.id), 'in-person class cannot be joined online', /in person/);
  // a batch member whose only access is the batch (no course purchase) can still join an online class
  const onl = db.classSessions.find((s) => s.id === id2);
  onl.startsAt = new Date(Date.now() - 6e4).toISOString(); onl.endsAt = new Date(Date.now() + 36e5).toISOString();
  const metaCourse = db.batches.find((b) => b.id === 'b_meta_eve').courseId;
  const arjun = db.people.find((p) => p.id === 'p_arjun');
  arjun.courses.push({ courseId: metaCourse, batchId: 'b_meta_eve', progress: 0, enrolledAt: new Date().toISOString(), status: 'active' });
  db.enrollments = db.enrollments.filter((e) => !(e.userId === 'u_arjun' && e.courseId === metaCourse));
  const room = await api.liveTab.join('u_arjun', onl.id).catch((e) => e);
  ok(room && room.token, 'batch member (added by the educator, no purchase) can join the online class', room?.message);
  await throws(() => api.liveTab.join('u_meera_student_nobody', onl.id), 'stranger cannot join', /enrolled/);

  /* educator week view */
  const wk = api.liveAdmin.week('u_rajesh', 0);
  const wk1 = api.liveAdmin.week('u_rajesh', 1);
  ok(wk.days.length === 7 && wk1.days.length === 7 && wk.total + wk1.total > 0, 'educator week timetable has 7 days with classes', [wk.total, wk1.total]);
  ok([...wk.days, ...wk1.days].flatMap((d) => d.items).every((s) => s.state !== 'cancelled'), 'cancelled classes are not on the timetable');
  ok(api.liveAdmin.week('u_meera', 0).days.flatMap((d) => d.items).every((s) => !s.batchId || db.batches.find((b) => b.id === s.batchId).instructorIds.includes('u_meera')), 'a tutor only sees batches they teach');

  /* Super Admin live monitor */
  const ov = api.liveOps.overview('u_admin');
  ok(ov.liveNow.some((r) => r.s.id === onl.id) && ov.today.length >= 1 && ov.weekCount >= 1, 'admin sees live-now and today’s classes across academies', [ov.liveNow.length, ov.today.length]);
  ok(ov.tenants.some((t) => t.t.id === 't_rajesh' && t.hours), 'admin sees room-hours per academy');
  ok(ov.clashes.length === 0, 'no clashes reported when there are none', ov.clashes.map((r) => [r.s.id, r.s.batchId, r.s.startsAt, db.classSessions.find((x) => x.id === r.s.id)?.instructorId]));
  // older data with a double-booking is surfaced to admins
  db.classSessions.push({ ...db.classSessions.find((s) => s.id === id4), id: 's_legacy_dup', batchId: 'b_meta_eve', instructorId: 'u_rajesh' });
  ok(api.liveOps.overview('u_admin').clashes.length === 2, 'legacy double-booking shows on the admin monitor');
  ok(api.liveAdmin.week('u_rajesh', 0).clashes + api.liveAdmin.week('u_rajesh', 1).clashes >= 1, 'and is flagged on the educator timetable');
  await throws(() => api.liveOps.overview('u_arjun'), 'learners cannot open the admin monitor', /admin role/);
  db.flags.liveClasses = false;
  ok(api.liveOps.overview('u_admin').paused, 'admin monitor shows when live classes are paused');
  await throws(() => sched('b_dm_wk', at(6, 10), 'u_rajesh'), 'pause flag blocks scheduling', /paused/);
  db.flags.liveClasses = true;

  console.log(`  timetable: ${pass} passed, ${fail} failed`);
  fails.forEach((f) => console.log('   ✗ ' + f));
  if (fail) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
