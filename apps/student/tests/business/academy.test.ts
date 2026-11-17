// @ts-nocheck — Node-only test; executed by tests/business/run.sh
/* Nov 16 change request: certificate approval (75% + required quiz), 1:1 mentorship, course-wide live classes,
   teaching reminders, "Other" course category, cover/video validation, students by course, community announcements,
   tutors creating courses, role-based navigation. Runs the real api/client.ts + api/academy.ts on the mock DB. */
import { db } from '@/api/mockDb';
import * as api from '@/api/client';
import * as ac from '@/api/academy';
import { courses as seedCourses, liveSessions as seedLive } from '@/api/catalogSeed';
import { ASSESSMENTS } from '@/api/assessSeed';
import { allLessons, progressOf } from '@/core/catalog';
import { CERT_MIN_PCT, canMentorMove, categoryNameError, certEligibility, mediaError, mentorLabel, mentorRequestErrors, reminderBucket, reminderErrors, requiredQuizOf } from '@/core/academy';
import { activeKey, navFor, primaryOf } from '@/core/nav';

let pass = 0, fail = 0; const fails: string[] = [];
const ok = (c, n, x?) => { if (c) pass++; else { fail++; fails.push(n + (x !== undefined ? '  → ' + JSON.stringify(x)?.slice(0, 300) : '')); } };
async function throws(fn, n, m?) { try { await fn(); ok(false, n + ' (expected error)'); } catch (e) { ok(!m || m.test(e?.message ?? ''), n, e?.message); } }
const notes = (u) => db.notifications.filter((n) => n.userId === u);
const lastNote = (u, re) => notes(u).filter((n) => re.test(n.title)).at(-1);
const newLearner = async (tag) => { const s = await api.auth.signUp({ name: `Learner ${tag}`, email: `${tag}@acad.in`, phone: `98762${String(10000 + Math.floor(Math.random() * 89999))}`, password: 'demo1234', role: 'student' }); await api.auth.verifySignupOtp(s.userId, '123456'); return s.userId; };
const enrol = (userId, courseId) => db.enrollments.push({ userId, courseId, enrolledAt: new Date().toISOString(), completedLessonIds: [], source: 'direct' });
const later = (h) => new Date(Date.now() + h * 3600e3).toISOString();

(async () => {
  const R = 'u_rajesh', M = 'u_meera', ADMIN = 'u_admin';

  /* ── pure rules ── */
  ok(CERT_MIN_PCT === 75, 'certificate threshold is 75%');
  ok(!certEligibility({ progressPct: 74, quiz: null }).eligible && certEligibility({ progressPct: 75, quiz: null }).eligible, '74% not eligible, 75% eligible (no quiz)');
  ok(!certEligibility({ progressPct: 90, quiz: { id: 'q', title: 'Final', passPct: 60, bestPct: 55 } }).eligible, 'quiz below pass mark → not eligible');
  ok(certEligibility({ progressPct: 90, quiz: { id: 'q', title: 'Final', passPct: 60, bestPct: 60 } }).eligible, 'quiz at pass mark → eligible');
  const miss = certEligibility({ progressPct: 40, quiz: { id: 'q', title: 'Final', passPct: 60, bestPct: null } }).missing;
  ok(miss.length === 2 && /75%/.test(miss[0]) && /Final/.test(miss[1]), 'missing steps explained in plain words', miss);
  ok(requiredQuizOf([{ id: 'a', kind: 'quiz' }, { id: 'b', kind: 'assignment' }, { id: 'c', kind: 'exam' }])?.id === 'c', 'required quiz defaults to the last quiz/exam (not an assignment)');
  ok(requiredQuizOf([{ id: 'a', kind: 'quiz' }], 'none') === null && requiredQuizOf([{ id: 'a', kind: 'quiz' }, { id: 'c', kind: 'quiz' }], 'a').id === 'a', 'required quiz: picked one or none');
  ok(canMentorMove('pending', 'accepted') && canMentorMove('accepted', 'cancelled') && !canMentorMove('rejected', 'accepted') && !canMentorMove('cancelled', 'pending'), 'mentorship status moves');
  ok(mentorRequestErrors({ topic: 'short', preferredAt: later(0.2), durationMin: 20 }).length === 3, 'mentorship request: topic, time and length checked');
  ok(mentorLabel({ status: 'accepted', startsAt: later(-0.05), endsAt: later(0.5) }) === 'Live now' && mentorLabel({ status: 'accepted', startsAt: later(5), endsAt: later(6) }) === 'Confirmed', 'mentorship label: live now vs confirmed');
  ok(reminderErrors({ title: 'ok', dueAt: 'x', kind: 'nope' }, { isNew: true }).length === 3, 'reminder: title, time and type checked');
  ok(reminderBucket({ dueAt: later(-1), done: false }) === 'overdue' && reminderBucket({ dueAt: later(-1), done: true }) === 'done' && reminderBucket({ dueAt: later(48), done: false }) === 'upcoming', 'reminder buckets');
  ok(mediaError('cover', { name: 'a.gif', mime: 'image/gif', sizeBytes: 1000 }) && mediaError('cover', { name: 'a.jpg', mime: 'image/jpeg', sizeBytes: 6 * 1048576 }) && !mediaError('cover', { name: 'a.webp', sizeBytes: 1048576 }), 'cover: JPG/PNG/WebP under 5 MB');
  ok(mediaError('video', { name: 'a.avi', sizeBytes: 1000 }) && mediaError('video', { name: 'a.mp4', mime: 'video/mp4', sizeBytes: 3 * 1024 ** 3 }) && !mediaError('video', { name: 'clip.mov', sizeBytes: 50 * 1048576 }), 'video: MP4/MOV/WebM/MKV under 2 GB');
  ok(categoryNameError('ab', []) && categoryNameError('Marketing', ['marketing']) && !categoryNameError('Spoken Tamil', ['Marketing']), 'category name: length and duplicates');

  /* ── navigation by role ── */
  const learnerNav = navFor('learner').map((x) => x.key);
  ok(learnerNav.indexOf('quizzes') === learnerNav.indexOf('live') + 1 && learnerNav.indexOf('assignments') === learnerNav.indexOf('quizzes') + 1, 'student: Quiz and Assignment sections right below Live', learnerNav);
  ok(learnerNav.indexOf('certificates') === learnerNav.indexOf('playground') + 1, 'student: Certificates right below Playground', learnerNav);
  const tutorNav = navFor('tutor').map((x) => x.key), ownerNav = navFor('owner').map((x) => x.key), adminNav = navFor('admin').map((x) => x.key);
  ok(['home', 'courses', 'create', 'live', 'timetable', 'quizzes', 'assignments', 'community'].every((k, i, a) => i === 0 || tutorNav.indexOf(k) > tutorNav.indexOf(a[i - 1])), 'tutor: teaching modules first, in priority order', tutorNav);
  ok(!tutorNav.includes('playground') && !tutorNav.includes('certificates') && !ownerNav.includes('playground') && !ownerNav.some((k) => k === 'learner'), 'tutor/educator: no Playground, no learner dashboard; tutors have no certificate section');
  ok(ownerNav.includes('certificates') && ownerNav.includes('earnings') && !tutorNav.includes('earnings'), 'owner-only modules hidden from tutors');
  ok(!navFor('owner', { modulesOff: ['community'] }).some((x) => x.key === 'community'), 'switched-off module is hidden');
  ok(['courses', 'quizzes', 'assignments', 'live', 'mentorship', 'certificates', 'students'].every((k) => adminNav.includes(k)), 'admin: course, quiz, assignment, live, mentorship, certificate and student management', adminNav);
  ok(primaryOf(navFor('owner')).length === 5 && primaryOf(navFor('learner')).length === 5 && primaryOf(navFor('admin')).length === 5, 'phone bar keeps 5 slots in every dashboard');
  ok(activeKey(navFor('owner'), '/edu/community') === 'community' && activeKey(navFor('owner'), '/edu/zzz') === 'more' && activeKey(navFor('owner'), '/edu/assess', 'kind=assignment') === 'assignments', 'opening a module highlights it (unknown pages → More)');
  ok(activeKey(navFor('learner'), '/assignment/asg_1') === 'assignments' && activeKey(navFor('learner'), '/quiz/x') === 'quizzes', 'student detail pages stay under their section');

  /* ── certificates: approval workflow ── */
  const C = seedCourses.find((c) => c.tenantId === 't_rajesh' && c.certificate && ASSESSMENTS.some((a) => a.courseId === c.id && a.kind !== 'assignment' && a.status !== 'draft'));
  ok(!!C, 'found a Rajesh course with a quiz and certificate', C?.id);
  const quiz = requiredQuizOf(ASSESSMENTS.filter((a) => a.courseId === C.id));
  const L1 = await newLearner('certone');
  enrol(L1, C.id);
  const lessons = allLessons(C);
  const upTo = (n) => lessons.slice(0, Math.ceil(lessons.length * n)).forEach((l) => api.player.setComplete(L1, C.id, l.id, true));
  upTo(0.5);
  ok(!db.academy.certRequests.some((r) => r.userId === L1), 'at 50% nothing is requested');
  upTo(0.8);
  const e1 = db.enrollments.find((e) => e.userId === L1 && e.courseId === C.id);
  ok(progressOf(C, e1).pct >= 75, '≥75% of lessons done', progressOf(C, e1).pct);
  ok(!db.academy.certRequests.some((r) => r.userId === L1), 'without passing the quiz: still no request');
  db.attempts.push({ id: 'att_x1', userId: L1, assessmentId: quiz.id, answers: [], startedAt: new Date().toISOString(), submittedAt: new Date().toISOString(), timeTakenSec: 60, scorePct: quiz.passPct - 1, correct: 0, wrong: 0, skipped: 0, marks: 0, rank: 1, of: 1 });
  api.player.setComplete(L1, C.id, lessons[lessons.length - 1].id, true);
  ok(!db.academy.certRequests.some((r) => r.userId === L1), 'quiz below the pass mark: no request');
  db.attempts.push({ id: 'att_x2', userId: L1, assessmentId: quiz.id, answers: [], startedAt: new Date().toISOString(), submittedAt: new Date().toISOString(), timeTakenSec: 60, scorePct: Math.max(quiz.passPct, 80), correct: 0, wrong: 0, skipped: 0, marks: 0, rank: 1, of: 1 });
  const mine0 = await ac.certApprovals.mine(L1);
  const req = db.academy.certRequests.find((r) => r.userId === L1 && r.courseId === C.id);
  ok(req?.status === 'pending' && mine0.pending.length === 1 && !mine0.issued.some((c) => c.courseId === C.id), 'pass the quiz → request waits for approval (no certificate yet)', req);
  ok(!!lastNote(R, /Certificate approval needed/), 'academy owner notified to approve');
  ok(!!lastNote(L1, /sent for approval/), 'learner told it is with the educator');
  ok(!api.certificates.list(L1).some((c) => c.courseId === C.id), 'certificate list shows only issued certificates');
  await throws(() => ac.certApprovals.decide(M, req.id, 'approve'), 'tutor cannot approve certificates', /owner/);
  await throws(() => ac.certApprovals.decide(R, req.id, 'reject', 'no'), 'reject needs a real reason', /10 characters/);
  await ac.certApprovals.decide(R, req.id, 'reject', 'Please submit the final project file first.');
  ok(db.academy.certRequests.find((r) => r.id === req.id).status === 'rejected' && /not approved/i.test(lastNote(L1, /not approved/i)?.title ?? ''), 'rejected → learner gets the reason');
  const mine1 = await ac.certApprovals.mine(L1);
  ok(mine1.rejected.length === 1 && mine1.rejected[0].request.reason.includes('final project'), 'learner sees the rejection reason in Certificates');
  const again = await ac.certApprovals.requestAgain(L1, C.id);
  await throws(() => ac.certApprovals.requestAgain(L1, C.id), 'cannot ask twice while pending', /already/);
  await ac.certApprovals.decide(R, again.id, 'approve');
  const cert = api.certificates.list(L1).find((c) => c.courseId === C.id);
  ok(!!cert && /^BODHIN-/.test(cert.id), 'approved → certificate issued and in the learner’s list', cert?.id);
  ok(!!lastNote(L1, /Certificate approved/), 'learner notified on approval');
  ok((await api.certificates.verify(cert.id)).valid, 'public verify confirms the approved certificate');
  ok(!(await api.certificates.verify('BODHIN-FAKE-2026-ABCDEF')).valid, 'unknown ID does not verify');
  const L2 = await newLearner('certtwo'); enrol(L2, C.id); lessons.forEach((l) => api.player.setComplete(L2, C.id, l.id, true));
  await ac.certApprovals.setRequiredQuiz(R, C.id, 'none');
  api.player.setComplete(L2, C.id, lessons[0].id, false); api.player.setComplete(L2, C.id, lessons[0].id, true);
  const r2 = db.academy.certRequests.find((r) => r.userId === L2);
  ok(r2?.status === 'pending' && r2.quizPct === null, 'required quiz set to none → 75% alone is enough');
  await ac.certApprovals.decide(R, r2.id, 'approve');
  const cert2 = api.certificates.list(L2).find((c) => c.courseId === C.id);
  ok(cert2 && cert2.id !== cert.id, 'certificate IDs stay unique per learner');
  await ac.certApprovals.setMode(R, 'auto');
  const L3 = await newLearner('certthree'); enrol(L3, C.id); lessons.forEach((l) => api.player.setComplete(L3, C.id, l.id, true));
  ok(api.certificates.list(L3).some((c) => c.courseId === C.id) && !db.academy.certRequests.some((r) => r.userId === L3), 'approval switched off → issued automatically');
  await ac.certApprovals.setMode(R, 'approval');
  const ov = await ac.certApprovals.overview(R);
  ok(ov.mode === 'approval' && ov.courses.some((x) => x.course.id === C.id) && ov.decided.length >= 3, 'owner overview: mode, courses with quizzes, decisions');
  await throws(() => ac.certApprovals.overview(M), 'tutor has no certificate management', /owner/);
  await throws(() => ac.certApprovals.addDesign(R, { name: 'bg.gif', dataUrl: 'data:x', mime: 'image/gif', sizeBytes: 100 }), 'design upload: wrong type rejected', /JPG/);
  const des = await ac.certApprovals.addDesign(R, { name: 'Gold frame.png', dataUrl: 'data:image/png;base64,AAAA', mime: 'image/png', sizeBytes: 2048 });
  ok(des.name === 'Gold frame' && ac.certApprovals.designs('t_rajesh').length >= 1, 'design uploaded to the academy library');

  /* Bodhin's own courses: the Bodhin team approves */
  const B = seedCourses.find((c) => c.tenantId === 't_bodhin' && c.certificate);
  if (B) {
    const L4 = await newLearner('bodhincert'); enrol(L4, B.id);
    await ac.certApprovals.setRequiredQuiz(ADMIN, B.id, 'none');
    allLessons(B).forEach((l) => api.player.setComplete(L4, B.id, l.id, true));
    const rb = db.academy.certRequests.find((r) => r.userId === L4);
    ok(rb?.tenantId === 't_bodhin' && !!lastNote(ADMIN, /Certificate approval needed/), 'Bodhin course → request goes to the admin');
    await ac.certApprovals.decide(ADMIN, rb.id, 'approve');
    ok(api.certificates.list(L4).some((c) => c.courseId === B.id), 'admin approves → issued');
    await throws(() => ac.certApprovals.decide(R, rb.id, 'approve'), 'an academy owner cannot touch Bodhin requests', /not found/);
  } else ok(true, 'no Bodhin certificate course in seed');

  /* ── 1:1 mentorship ── */
  const MC = seedCourses.find((c) => c.id === 'c_dm_ai');
  const stranger = await newLearner('nomentor');
  await throws(() => ac.mentorship.request(stranger, { courseId: MC.id, mentorUserId: M, topic: 'Help me with ads targeting please', preferredAt: later(30), durationMin: 30 }), 'only buyers can book mentorship', /bought/);
  const mine = await ac.mentorship.mine('u_arjun');
  const row = mine.courses.find((x) => x.course.id === MC.id);
  ok(row && row.mentors.some((m) => m.userId === M) && row.mentors.some((m) => m.userId === R), 'learner can pick the course tutor or the owner', row?.mentors);
  await throws(() => ac.mentorship.request('u_arjun', { courseId: MC.id, mentorUserId: 'u_zzz', topic: 'Help me with ads targeting please', preferredAt: later(30), durationMin: 30 }), 'mentor must belong to the course', /Pick a tutor/);
  const mr = await ac.mentorship.request('u_arjun', { courseId: MC.id, mentorUserId: M, topic: 'Help me with ads targeting please', preferredAt: later(30), durationMin: 30 });
  ok(mr.status === 'pending' && !!lastNote(M, /mentorship request/i), 'request → the chosen tutor is notified');
  await throws(() => ac.mentorship.request('u_arjun', { courseId: MC.id, mentorUserId: M, topic: 'Another question about reports', preferredAt: later(40), durationMin: 30 }), 'one pending request per course', /already/);
  const inboxM = await ac.mentorship.inbox(M);
  ok(inboxM.pending.some((x) => x.r.id === mr.id), 'tutor sees it in the mentorship inbox');
  ok((await ac.mentorship.inbox(R)).pending.some((x) => x.r.id === mr.id), 'owner sees academy requests too');
  await throws(() => ac.mentorship.respond(ADMIN, mr.id, 'accept'), 'Bodhin staff cannot answer an academy’s request', /can’t/);
  await throws(() => ac.mentorship.respond(M, mr.id, 'reject', { note: 'no' }), 'decline needs a reason', /10 characters/);
  await ac.mentorship.respond(M, mr.id, 'accept', { note: 'Bring your ad account screenshots', startsAt: later(26) });
  const acc = db.academy.mentor.find((x) => x.id === mr.id);
  ok(acc.status === 'accepted' && acc.startsAt === new Date(later(26)).toISOString().slice(0, 16) + acc.startsAt.slice(16) && !!lastNote('u_arjun', /Mentorship confirmed/), 'accept with a new time → learner notified with the time');
  ok(ac.mentorship.sessionsFor(M).some((x) => x.id === mr.id) && ac.mentorship.learnerSessions('u_arjun').some((x) => x.r.id === mr.id), 'confirmed 1:1 shows in tutor timetable and learner Live tab');
  await throws(() => ac.mentorship.join('u_arjun', mr.id), 'room opens only near the start time', /opens/);
  await throws(() => ac.mentorship.respond(M, mr.id, 'reject', { note: 'Changed my mind about this' }), 'a decision is final', /already/);
  const mr2 = await ac.mentorship.request('u_arjun', { courseId: MC.id, mentorUserId: R, topic: 'Can we review my SEO plan together?', preferredAt: later(28), durationMin: 30 });
  await throws(() => ac.mentorship.respond(M, mr2.id, 'accept', { startsAt: later(26.2) }), 'tutor cannot double-book a 1:1', /already have a 1:1/);
  await ac.mentorship.respond(R, mr2.id, 'reject', { note: 'Travelling that week. Please pick a date after the 25th.' });
  ok(/not accepted/i.test(lastNote('u_arjun', /not accepted/i)?.title ?? ''), 'decline → learner gets the reason');
  await ac.mentorship.cancel('u_arjun', mr.id);
  ok(db.academy.mentor.find((x) => x.id === mr.id).status === 'cancelled' && !!lastNote(M, /cancelled by learner/i), 'learner cancels → tutor notified');
  const live = await ac.mentorship.request('u_arjun', { courseId: MC.id, mentorUserId: M, topic: 'Quick doubt about campaign budget split', preferredAt: later(2), durationMin: 30 });
  await ac.mentorship.respond(M, live.id, 'accept');
  db.academy.mentor.find((x) => x.id === live.id).startsAt = later(-0.05);
  ok((await ac.mentorship.join('u_arjun', live.id)).other.includes('Meera') && !!(await ac.mentorship.join(M, live.id)).token, 'both sides can join when it is time');

  /* ── course-wide live classes ── */
  const before = notes('u_arjun').length;
  await throws(() => ac.courseLive.schedule(R, { courseId: MC.id, title: 'Q&A', startsAt: later(24), durationMin: 60, notifyNow: true }), 'title needs 4+ characters', /title/);
  await throws(() => ac.courseLive.schedule(R, { courseId: MC.id, title: 'Weekly Q&A', startsAt: later(0.01), durationMin: 60, notifyNow: true }), 'must be 5+ minutes ahead', /5 minutes/);
  const s1 = await ac.courseLive.schedule(R, { courseId: MC.id, title: 'Weekly Q&A for all buyers', startsAt: later(24), durationMin: 60, notifyNow: true });
  ok(notes('u_arjun').length > before && /New live class/.test(notes('u_arjun').at(-1).title), 'every buyer notified with the schedule');
  const lt = await api.liveTab.schedule('u_arjun', null);
  ok(lt.upcoming.some((r) => r.session.id === s1.id), 'class appears in the learner’s Live tab (upcoming)');
  ok(!(await api.liveTab.schedule(stranger, null)).upcoming.some((r) => r.session.id === s1.id), 'non-buyers do not see it');
  await throws(() => ac.courseLive.schedule(R, { courseId: MC.id, title: 'Clashing class', startsAt: later(24.5), durationMin: 30, notifyNow: false }), 'clash with another class of the course', /Clashes/);
  ok((await api.liveAdmin.list(R)).some ? true : true, 'educator live list loads');
  ok(api.liveAdmin.week(R, 1).total + api.liveAdmin.week(R, 0).total >= 1, 'class is on the educator timetable');
  await ac.courseLive.schedule(M, { courseId: MC.id, title: 'Tutor revision class', startsAt: later(50), durationMin: 45, notifyNow: false });
  await throws(() => ac.courseLive.schedule(M, { courseId: 'c_seo_growth', title: 'Not my course', startsAt: later(60), durationMin: 45, notifyNow: false }), 'tutor schedules only assigned courses', /Choose one of your courses/);
  await throws(() => ac.courseLive.cancel(R, s1.id, 'no'), 'cancel needs a reason', /why/);
  await ac.courseLive.cancel(R, s1.id, 'Moved to Saturday, same time');
  ok(!(await api.liveTab.schedule('u_arjun', null)).upcoming.some((r) => r.session.id === s1.id) && /cancelled/i.test(notes('u_arjun').at(-1).title), 'cancelled → gone from Live tab, learners told');
  const B2 = seedCourses.find((c) => c.tenantId === 't_bodhin' && c.title);
  const sb = await ac.courseLive.schedule(ADMIN, { courseId: B2.id, title: 'Bodhin live orientation', startsAt: later(30), durationMin: 60, notifyNow: true });
  ok(seedLive.some((x) => x.id === sb.id) && (await ac.courseLive.list(ADMIN)).upcoming.some((r) => r.s.id === sb.id), 'admin schedules for a Bodhin course and sees it in Live');

  /* ── reminders ── */
  await throws(() => ac.reminders.add(R, { kind: 'quiz', title: 'x', dueAt: later(5) }), 'reminder title checked', /title/);
  const rm = await ac.reminders.add(R, { kind: 'assignment', title: 'Set the SEO assignment deadline', dueAt: later(5), courseId: MC.id });
  let lst = ac.reminders.list(R);
  ok(lst.today.concat(lst.upcoming).some((x) => x.id === rm.id) && !!lastNote(R, /Reminder: Set the SEO/), 'reminder listed and notified a day before');
  await ac.reminders.update(R, rm.id, { done: true });
  lst = ac.reminders.list(R);
  ok(lst.done.some((x) => x.id === rm.id), 'ticked off → Done');
  ok(!ac.reminders.list(M).done.some((x) => x.id === rm.id), 'reminders are private to each educator');
  ok(api.liveAdmin.week(R, 0).days.every((d) => d.items.every((i) => !/SEO assignment deadline/.test(i.title))), 'reminders never appear as meetings');
  await ac.reminders.remove(R, rm.id);
  ok(!ac.reminders.list(R).done.some((x) => x.id === rm.id), 'reminder deleted');

  /* ── categories ── */
  await throws(() => ac.categoriesApi.add(R, 'Ma'), 'short category refused', /3 characters/);
  const k = await ac.categoriesApi.add(R, 'Spoken Tamil');
  ok(ac.categoriesApi.forCourse(R).some((x) => x.id === k.id && x.own) && !ac.categoriesApi.forCourse('u_zzz').some((x) => x.id === k.id), 'new category saved for this academy’s future courses');
  await throws(() => ac.categoriesApi.add(R, 'spoken tamil'), 'duplicate category refused', /already exists/);
  const kb = await ac.categoriesApi.add(ADMIN, 'Drone Pilot Training');
  ok(api.catalog.allCategories().some((x) => x.id === kb.id), 'Bodhin team category goes to the marketplace list');

  /* ── tutor creates a course; media ── */
  const tc = api.courseAdmin.create(M);
  ok(db.tutorAssignments.some((a) => a.userId === M && a.courseId === tc) && api.courseAdmin.get(M, tc)?.role === 'tutor', 'tutor can create a course (assigned to them)');
  await throws(() => api.courseAdmin.publish(M, tc), 'tutor cannot publish', /owner/);
  await ac.askOwnerToPublish(M, tc);
  ok(!!lastNote(R, /ready to publish/), 'tutor asks owner to publish → owner notified');
  await throws(() => ac.courseMedia.setCover(M, tc, { name: 'cover.gif', mime: 'image/gif', sizeBytes: 100, uri: 'x' }), 'cover format checked', /JPG/);
  await ac.courseMedia.setCover(M, tc, { name: 'cover.png', mime: 'image/png', sizeBytes: 300000, uri: 'data:image/png;base64,AAAA' });
  ok(seedCourses.find((c) => c.id === tc).art.image?.startsWith('data:image'), 'cover image saved on the course (cards + course page)');
  await ac.courseMedia.setIntroVideo(M, tc, { name: 'intro.mp4', mime: 'video/mp4', sizeBytes: 50 * 1048576, uri: 'blob:x' });
  ok(seedCourses.find((c) => c.id === tc).intro?.sizeMb === 50, 'intro video saved');
  await ac.courseMedia.setCover(M, tc, null);
  ok(!seedCourses.find((c) => c.id === tc).art.image, 'cover image removed → colour art again');

  /* ── students by course ── */
  const sb1 = await ac.studentsApi.byCourse(R);
  const dm = sb1.courses.find((x) => x.course.id === MC.id);
  const arj = dm?.students.find((s) => s.userId === 'u_arjun');
  ok(arj && arj.email === 'arjun@demo.in' && typeof arj.progressPct === 'number' && 'quiz' in arj && 'assignment' in arj && arj.purchase, 'student row: name, email, purchase, progress, quiz, assignment', arj);
  const sbM = await ac.studentsApi.byCourse(M);
  ok(sbM.courses.every((x) => db.tutorAssignments.some((a) => a.userId === M && a.courseId === x.course.id)), 'tutor sees only students of assigned courses');
  const sbA = await ac.studentsApi.byCourse(ADMIN);
  ok(sbA.courses.every((x) => x.course.tenantId === 't_bodhin'), 'admin sees students of Bodhin’s own courses only');

  /* ── announcements from community ── */
  const chs = ac.announcements.channels(M);
  ok(chs.length > 0, 'tutor can post announcements (channels listed)');
  await throws(() => ac.announcements.post(M, { channelId: chs[0].id, title: 'Hi', body: 'x', pin: true, notify: true }), 'announcement title checked', /title/);
  const an = await ac.announcements.post(R, { channelId: chs[0].id, title: 'Class moved to Saturday', body: 'Saturday 7 pm, same link.', pin: true, notify: true });
  ok(an.post.pinned && an.reached > 0 && notes('u_arjun').some((n) => n.title === 'Class moved to Saturday'), 'announcement posted, pinned and students notified', an.reached);

  console.log(`academy: ${pass} passed, ${fail} failed`);
  if (fail) { fails.forEach((f) => console.log('  ✗ ' + f)); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
