/**
 * Academy workflows (Nov 16 change request). Same contract as api/client.ts: screens call only these functions;
 * today they run on mockDb, live they become Supabase calls (tables + rules in migration 0010_academy_workflows.sql).
 * Nothing here changes existing modules — it adds its own records and listens to progress events from client.ts.
 *
 *  certApprovals   75% + required quiz → request → owner / Bodhin team approves or rejects → certificate issued
 *  mentorship      learner asks a tutor (or the Bodhin team) for a 1:1 → accept with a time / reject with a reason
 *  courseLive      live classes for a whole course (not only a batch) → every learner who bought it is notified
 *  reminders       the educator's own teaching reminders, kept apart from live meetings in the timetable
 *  categoriesApi   "Other" → a new course category (academy-wide; Bodhin team → marketplace-wide)
 *  studentsApi     enrolled students grouped by course with progress, quiz and assignment status
 *  announcements   post an announcement from Community (and notify)
 *  courseMedia     cover image + intro video on a course
 */
import { db, persist, uid } from './mockDb';
import { courses as seedCourses, liveSessions as seedLive, tutors as seedTutors } from './catalogSeed';
import { ASSESSMENTS } from './assessSeed';
import { ApiError, academyHooks, catalog, courseAdmin, educator, newCertId, notifyUser, saveCourse, tenantGate, tenantHas } from './client';
import { communityApi } from './growth';
import { allLessons, progressOf, type Course, type LiveSession } from '@/core/catalog';
import {
  canMentorMove, categoryNameError, categorySlug, certEligibility, mediaError, mentorLabel, mentorRequestErrors, reminderBucket, reminderErrors, rejectReasonError, requiredQuizOf,
  type CertMode, type CertRequest, type MentorRequest, type Reminder, type ReminderKind,
} from '@/core/academy';

const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();
const fmt = (iso: string) => new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export interface AcademyDb {
  v: 1;
  certRequests: CertRequest[];
  certSettings: Record<string, { mode: CertMode; requiredQuiz: Record<string, string> }>;
  certDesigns: { id: string; tenantId: string; name: string; dataUrl: string; at: string }[];
  mentor: MentorRequest[];
  reminders: (Reminder & { notified?: boolean })[];
  categories: { id: string; tenantId: string; name: string; icon: string; createdBy: string; at: string }[];
  courseLive: LiveSession[];
  liveCancelled: Record<string, string>; // session id → reason
}

function A(): AcademyDb {
  const d = db as unknown as { academy?: AcademyDb };
  if (!d.academy || !d.academy.certRequests || !d.academy.liveCancelled) {
    // fresh store, or one saved by an older build → fill in whatever is missing (nothing is dropped)
    d.academy = { v: 1, certRequests: [], certSettings: {}, certDesigns: [], mentor: [], reminders: [], categories: [], courseLive: [], liveCancelled: {}, ...(d.academy ?? {}) } as AcademyDb;
  }
  if (d.academy.mentor.length === 0 && (db as any).mentorshipBookings?.length) {
    d.academy.mentor = (db as any).mentorshipBookings.map((b: any) => ({
      id: b.id,
      userId: b.studentId,
      courseId: b.courseId,
      tenantId: b.tenantId,
      mentorUserId: b.tutorId,
      topic: b.topic,
      preferredAt: new Date(b.requestedDate + 'T10:00:00Z').toISOString(),
      durationMin: 30,
      status: b.status,
      createdAt: b.createdAt,
      viewedBy: []
    }));
  }
  return d.academy;
}

/* Course-wide live classes scheduled here join the shared catalogue (Live tab, home, timetable all read seedLive). */
for (const s of A().courseLive) if (!seedLive.some((x) => x.id === s.id)) seedLive.push(s);

const courseOf = (id: string) => seedCourses.find((c) => c.id === id) ?? null;
const userOf = (id: string) => db.users.find((u) => u.id === id) ?? null;
const nameOf = (id: string) => userOf(id)?.name ?? 'Learner';
const BODHIN = () => db.platformConfig.bodhinTenantId;
const staffIds = () => [...new Set(db.memberships.filter((m) => m.role === 'super_admin' || m.role === 'moderator').map((m) => m.userId))];

/** Who decides for an academy: its owner; for Bodhin's own courses, the Bodhin team (super admins + moderators). */
function approversOf(tenantId: string) {
  if (tenantId === BODHIN()) return staffIds();
  const t = db.tenants.find((x) => x.id === tenantId);
  const owners = db.memberships.filter((m) => m.tenantId === tenantId && m.role === 'owner').map((m) => m.userId);
  return [...new Set([...(t?.ownerUserId ? [t.ownerUserId] : []), ...owners])];
}

/** The signed-in educator's workspace, owner-only where asked. Bodhin staff act as owner of Bodhin's academy. */
function ctxOrThrow(userId: string, ownerOnly = false) {
  const ctx = educator.context(userId);
  if (!ctx) throw new ApiError('forbidden', 'Only educators and the Bodhin team can do this.');
  if (ownerOnly && ctx.role !== 'owner') throw new ApiError('forbidden', 'Only the academy owner can do this.');
  return ctx;
}

/** Courses a staff member works on: owner → every course of the academy; tutor → assigned courses. */
function myCourseIds(userId: string) {
  return new Set(educator.courses(userId).map((c) => c.id));
}

const quizzesOf = (courseId: string) => ASSESSMENTS.filter((a) => a.courseId === courseId && a.kind !== 'assignment' && a.status !== 'draft');
const bestPct = (userId: string, assessmentId: string) => {
  const l = db.attempts.filter((t) => t.userId === userId && t.assessmentId === assessmentId).map((t) => t.scorePct);
  return l.length ? Math.max(...l) : null;
};

/* ───────────────────────── Certificates: eligibility → approval → issue ───────────────────────── */

const settingsOf = (tenantId: string) => (A().certSettings[tenantId] ??= { mode: 'approval', requiredQuiz: {} });

function eligibilityOf(userId: string, c: Course) {
  const e = db.enrollments.find((x) => x.userId === userId && x.courseId === c.id);
  const q = requiredQuizOf(quizzesOf(c.id), settingsOf(c.tenantId).requiredQuiz[c.id]);
  return certEligibility({ progressPct: progressOf(c, e).pct, quiz: q ? { id: q.id, title: q.title, passPct: q.passPct, bestPct: bestPct(userId, q.id) } : null });
}

function issue(userId: string, c: Course, by?: string) {
  const existing = db.certificates.find((x) => x.userId === userId && x.courseId === c.id);
  if (existing) return existing;
  const tutor = seedTutors.find((t) => t.id === c.tutorId);
  const cert = { id: newCertId(c.id), userId, courseId: c.id, title: c.title, program: 'Course Completion', issuedAt: now(), weeks: Math.max(2, Math.round(allLessons(c).length / 4)), tutor: tutor?.name ?? 'Instructor' };
  db.certificates.push(cert);
  void by;
  return cert;
}

/** Runs whenever a learner's progress or quiz score changes (and when they open Certificates). */
function syncLearner(userId: string, onlyCourseId?: string) {
  let changed = false;
  for (const e of db.enrollments.filter((x) => x.userId === userId && (!onlyCourseId || x.courseId === onlyCourseId))) {
    const c = courseOf(e.courseId);
    if (!c || !c.certificate || !tenantHas(c.tenantId, 'certificates')) continue;
    if (db.certificates.some((x) => x.userId === userId && x.courseId === c.id)) continue;
    if (A().certRequests.some((r) => r.userId === userId && r.courseId === c.id && r.status !== 'rejected')) continue;
    if (A().certRequests.some((r) => r.userId === userId && r.courseId === c.id && r.status === 'rejected')) continue; // learner asks again from Certificates
    const el = eligibilityOf(userId, c);
    if (!el.eligible) continue;
    if (settingsOf(c.tenantId).mode === 'auto') {
      const cert = issue(userId, c);
      notifyUser(userId, 'course', 'Your certificate is ready', `“${c.title}” — download it from Certificates.`, { pathname: '/certificate/[id]', params: { id: cert.id } });
    } else {
      queue(userId, c, el.progressPct, el.quiz?.bestPct ?? null);
    }
    changed = true;
  }
  if (changed) persist();
}

function queue(userId: string, c: Course, progressPct: number, quizPct: number | null) {
  const r: CertRequest = { id: uid('cr'), userId, courseId: c.id, tenantId: c.tenantId, status: 'pending', progressPct, quizPct, requestedAt: now() };
  A().certRequests.push(r);
  const who = nameOf(userId);
  const href = c.tenantId === BODHIN() ? { pathname: '/edu/certificates' } : { pathname: '/edu/certificates' };
  approversOf(c.tenantId).forEach((id) => notifyUser(id, 'course', 'Certificate approval needed', `${who} finished ${progressPct}% of “${c.title}”${quizPct != null ? ` and scored ${quizPct}% in the quiz` : ''}. Approve or reject.`, href));
  notifyUser(userId, 'course', 'Certificate sent for approval', `You’re eligible for the “${c.title}” certificate. Your educator will review it soon.`, { pathname: '/certificates' });
  return r;
}

academyHooks.progress.push((userId, courseId) => syncLearner(userId, courseId));
academyHooks.certSync = (userId) => syncLearner(userId);

export const certApprovals = {
  /** Learner view: issued certificates, requests waiting, rejected ones (with the reason) and progress toward each. */
  async mine(userId: string) {
    await wait(200);
    syncLearner(userId);
    const issued = db.certificates.filter((c) => c.userId === userId).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
    const reqs = A().certRequests.filter((r) => r.userId === userId);
    const latest = (courseId: string) => reqs.filter((r) => r.courseId === courseId).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))[0];
    const working = db.enrollments
      .filter((e) => e.userId === userId)
      .map((e) => courseOf(e.courseId))
      .filter((c): c is Course => !!c && c.certificate && tenantHas(c.tenantId, 'certificates') && !issued.some((i) => i.courseId === c.id))
      .map((c) => ({ course: c, eligibility: eligibilityOf(userId, c), request: latest(c.id) ?? null }));
    return {
      issued,
      pending: working.filter((w) => w.request?.status === 'pending'),
      rejected: working.filter((w) => w.request?.status === 'rejected'),
      inProgress: working.filter((w) => !w.request),
    };
  },

  /** After a rejection the learner can ask again (once eligible). */
  async requestAgain(userId: string, courseId: string) {
    await wait(300);
    const c = courseOf(courseId);
    if (!c || !db.enrollments.some((e) => e.userId === userId && e.courseId === courseId)) throw new ApiError('not_enrolled', 'You’re not enrolled in this course.');
    if (A().certRequests.some((r) => r.userId === userId && r.courseId === courseId && r.status === 'pending')) throw new ApiError('pending', 'Your request is already with your educator.');
    if (db.certificates.some((x) => x.userId === userId && x.courseId === courseId)) throw new ApiError('issued', 'Your certificate is already issued.');
    const el = eligibilityOf(userId, c);
    if (!el.eligible) throw new ApiError('not_eligible', el.missing.join(' · '));
    const r = queue(userId, c, el.progressPct, el.quiz?.bestPct ?? null);
    persist();
    return r;
  },

  /** Approver view (academy owner, or Bodhin team for Bodhin's own courses). */
  async overview(userId: string) {
    await wait(220);
    const ctx = ctxOrThrow(userId, true);
    const T = ctx.tenant.id;
    const st = settingsOf(T);
    const rows = A().certRequests.filter((r) => r.tenantId === T).map((r) => ({ r, learner: userOf(r.userId), course: courseOf(r.courseId)! })).filter((x) => x.course);
    const courses = seedCourses.filter((c) => c.tenantId === T && c.status !== 'archived' && c.title).map((c) => {
      const qs = quizzesOf(c.id);
      return { course: c, quizzes: qs.map((q) => ({ id: q.id, title: q.title, passPct: q.passPct })), required: requiredQuizOf(qs, st.requiredQuiz[c.id])?.id ?? 'none', picked: st.requiredQuiz[c.id] ?? null };
    });
    return {
      ctx,
      mode: st.mode,
      pending: rows.filter((x) => x.r.status === 'pending').sort((a, b) => a.r.requestedAt.localeCompare(b.r.requestedAt)),
      decided: rows.filter((x) => x.r.status !== 'pending').sort((a, b) => (b.r.decidedAt ?? '').localeCompare(a.r.decidedAt ?? '')).slice(0, 30),
      issuedCount: db.certificates.filter((x) => courseOf(x.courseId ?? '')?.tenantId === T).length,
      courses,
      designs: A().certDesigns.filter((d) => d.tenantId === T),
    };
  },

  async decide(userId: string, requestId: string, decision: 'approve' | 'reject', reason = '') {
    await wait(400);
    const ctx = ctxOrThrow(userId, true);
    const r = A().certRequests.find((x) => x.id === requestId && x.tenantId === ctx.tenant.id);
    if (!r) throw new ApiError('not_found', 'This request was not found.');
    if (r.status !== 'pending') throw new ApiError('decided', `This request was already ${r.status}.`);
    const c = courseOf(r.courseId)!;
    if (decision === 'reject') {
      const e = rejectReasonError(reason);
      if (e) throw new ApiError('reason', e, 'reason');
      Object.assign(r, { status: 'rejected', decidedAt: now(), decidedBy: userId, reason: reason.trim() });
      notifyUser(r.userId, 'course', 'Certificate not approved yet', `“${c.title}”: ${reason.trim()}`, { pathname: '/certificates' });
    } else {
      const cert = issue(r.userId, c, userId);
      Object.assign(r, { status: 'approved', decidedAt: now(), decidedBy: userId, certId: cert.id });
      notifyUser(r.userId, 'course', 'Certificate approved 🎉', `Your “${c.title}” certificate is ready to view and download.`, { pathname: '/certificate/[id]', params: { id: cert.id } });
    }
    persist();
    return r;
  },

  async setMode(userId: string, mode: CertMode) {
    await wait(200);
    const ctx = ctxOrThrow(userId, true);
    settingsOf(ctx.tenant.id).mode = mode;
    persist();
  },

  async setRequiredQuiz(userId: string, courseId: string, quizId: string) {
    await wait(200);
    const ctx = ctxOrThrow(userId, true);
    const c = courseOf(courseId);
    if (!c || c.tenantId !== ctx.tenant.id) throw new ApiError('forbidden', 'Not your course.');
    if (quizId !== 'none' && !quizzesOf(courseId).some((q) => q.id === quizId)) throw new ApiError('quiz', 'Pick a quiz of this course.');
    settingsOf(ctx.tenant.id).requiredQuiz[courseId] = quizId;
    persist();
  },

  /* Uploaded certificate designs (backgrounds). The design in use is picked in the certificate designer. */
  async addDesign(userId: string, input: { name: string; dataUrl: string; mime?: string; sizeBytes?: number }) {
    await wait(300);
    const ctx = ctxOrThrow(userId, true);
    const err = mediaError('cover', { name: input.name, mime: input.mime, sizeBytes: input.sizeBytes });
    if (err) throw new ApiError('file', err.replace('image', 'design'));
    if (!input.dataUrl) throw new ApiError('file', 'This file could not be read. Try another image.');
    if (A().certDesigns.filter((d) => d.tenantId === ctx.tenant.id).length >= 6) throw new ApiError('limit', 'Up to 6 designs. Remove one first.');
    const d = { id: uid('cd'), tenantId: ctx.tenant.id, name: input.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 40) || 'Design', dataUrl: input.dataUrl, at: now() };
    A().certDesigns.push(d);
    persist();
    return d;
  },
  async removeDesign(userId: string, id: string) {
    await wait(200);
    const ctx = ctxOrThrow(userId, true);
    A().certDesigns = A().certDesigns.filter((d) => !(d.id === id && d.tenantId === ctx.tenant.id));
    persist();
  },
  designs: (tenantId: string) => A().certDesigns.filter((d) => d.tenantId === tenantId),
  design: (id?: string) => (id ? A().certDesigns.find((d) => d.id === id) ?? null : null),
  /** For the learner's certificate page: is this course's certificate pending / rejected? */
  statusFor(userId: string, courseId: string) {
    const r = A().certRequests.filter((x) => x.userId === userId && x.courseId === courseId).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))[0];
    return r ?? null;
  },
};

/* ───────────────────────── 1:1 mentorship ───────────────────────── */

/** People a learner can ask, per course: the course's tutors, else the academy owner; Bodhin courses → the Bodhin team. */
function mentorsFor(c: Course) {
  if (c.tenantId === BODHIN()) return [{ userId: null as string | null, name: 'Bodhin mentors', role: 'Bodhin team' }];
  const tutors = db.tutorAssignments.filter((a) => a.courseId === c.id).map((a) => a.userId);
  const owner = db.tenants.find((t) => t.id === c.tenantId)?.ownerUserId;
  const ids = [...new Set([...tutors, ...(owner ? [owner] : [])])];
  return ids.map((id) => ({ userId: id as string | null, name: nameOf(id), role: id === owner ? 'Academy owner' : 'Tutor' }));
}

function mentorRecipients(r: MentorRequest) {
  if (r.mentorUserId) return [r.mentorUserId];
  return approversOf(r.tenantId);
}

/** Can this staff member see / answer this request? */
function canMentor(userId: string, r: MentorRequest) {
  const ctx = educator.context(userId);
  if (!ctx || ctx.tenant.id !== r.tenantId) return false;
  if (ctx.role === 'owner') return true;
  return r.mentorUserId === userId || db.tutorAssignments.some((a) => a.userId === userId && a.courseId === r.courseId);
}

export const mentorship = {
  /** Learner: courses they bought, who they can ask, and their requests. */
  async mine(userId: string) {
    await wait(220);
    const courses = db.enrollments.filter((e) => e.userId === userId).map((e) => courseOf(e.courseId)).filter((c): c is Course => !!c);
    const t = Date.now();
    const list = A().mentor.filter((r) => r.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return {
      courses: courses.map((c) => ({ course: c, mentors: mentorsFor(c), academyPaused: tenantGate(c.tenantId).locked })),
      requests: list.map((r) => ({ r, course: courseOf(r.courseId)!, mentor: r.mentorUserId ? nameOf(r.mentorUserId) : 'Bodhin mentors', label: mentorLabel(r, t) })),
    };
  },

  async request(userId: string, input: { courseId: string; mentorUserId: string | null; topic: string; preferredAt: string; durationMin: number }) {
    await wait(400);
    const c = courseOf(input.courseId);
    if (!c || !db.enrollments.some((e) => e.userId === userId && e.courseId === input.courseId)) throw new ApiError('not_enrolled', 'You can book mentorship only for courses you have bought.');
    if (tenantGate(c.tenantId).locked) throw new ApiError('academy_paused', 'This academy isn’t taking mentorship bookings right now.');
    const errs = mentorRequestErrors(input);
    if (errs.length) throw new ApiError(errs[0].field, errs[0].msg, errs[0].field);
    const mentors = mentorsFor(c);
    if (!mentors.some((m) => m.userId === input.mentorUserId)) throw new ApiError('mentor', 'Pick a tutor from this course.', 'mentor');
    if (A().mentor.some((r) => r.userId === userId && r.courseId === c.id && r.status === 'pending')) throw new ApiError('pending', 'You already have a request waiting for this course. Wait for the reply or cancel it first.');
    const r: MentorRequest = { id: uid('mr'), userId, courseId: c.id, tenantId: c.tenantId, mentorUserId: input.mentorUserId, topic: input.topic.trim(), preferredAt: new Date(input.preferredAt).toISOString(), durationMin: input.durationMin, status: 'pending', createdAt: now(), viewedBy: [] };
    A().mentor.push(r);
    mentorRecipients(r).forEach((id) => notifyUser(id, 'course', 'New 1:1 mentorship request', `${nameOf(userId)} · “${c.title}” · ${fmt(r.preferredAt)} (${r.durationMin} min): ${r.topic.slice(0, 90)}`, { pathname: '/edu/mentorship' }));
    notifyUser(userId, 'course', 'Mentorship request sent', `We told ${input.mentorUserId ? nameOf(input.mentorUserId) : 'the Bodhin team'}. You’ll get a message when they reply.`, { pathname: '/mentorship' });
    persist();
    return r;
  },

  /** Count of unviewed pending requests for this tutor / educator. */
  unviewedCount(userId: string): number {
    if (!userId) return 0;
    const list = A().mentor.filter((r) => r.status === 'pending' && canMentor(userId, r));
    return list.filter((r) => !r.viewedBy?.includes(userId)).length;
  },

  /** Mark all pending requests as viewed by this staff user (called when viewing /edu/mentorship). */
  markViewed(userId: string) {
    if (!userId) return;
    let changed = false;
    for (const r of A().mentor) {
      if (r.status === 'pending' && canMentor(userId, r)) {
        r.viewedBy = r.viewedBy ?? [];
        if (!r.viewedBy.includes(userId)) {
          r.viewedBy.push(userId);
          changed = true;
        }
      }
    }
    if (changed) persist();
  },

  /** Educator / Bodhin team inbox. */
  async inbox(userId: string) {
    await wait(220);
    const ctx = ctxOrThrow(userId);
    mentorship.markViewed(userId);
    const t = Date.now();
    const rows = A().mentor.filter((r) => canMentor(userId, r)).map((r) => ({ r, course: courseOf(r.courseId)!, learner: userOf(r.userId), mentor: r.mentorUserId ? nameOf(r.mentorUserId) : 'Bodhin team', label: mentorLabel(r, t) })).filter((x) => x.course);
    return {
      ctx,
      pending: rows.filter((x) => x.r.status === 'pending').sort((a, b) => a.r.preferredAt.localeCompare(b.r.preferredAt)),
      upcoming: rows.filter((x) => x.r.status === 'accepted' && new Date(x.r.endsAt!).getTime() > t).sort((a, b) => a.r.startsAt!.localeCompare(b.r.startsAt!)),
      past: rows.filter((x) => x.r.status !== 'pending' && !(x.r.status === 'accepted' && new Date(x.r.endsAt!).getTime() > t)).sort((a, b) => (b.r.decidedAt ?? b.r.createdAt).localeCompare(a.r.decidedAt ?? a.r.createdAt)).slice(0, 30),
    };
  },

  async respond(userId: string, id: string, decision: 'accept' | 'reject', opts: { note?: string; startsAt?: string } = {}) {
    await wait(400);
    const r = A().mentor.find((x) => x.id === id);
    if (!r || !canMentor(userId, r)) throw new ApiError('forbidden', 'You can’t answer this request.');
    const to = decision === 'accept' ? 'accepted' : 'rejected';
    if (!canMentorMove(r.status, to)) throw new ApiError('decided', `This request is already ${r.status}.`);
    const c = courseOf(r.courseId)!;
    if (decision === 'reject') {
      const e = rejectReasonError(opts.note ?? '');
      if (e) throw new ApiError('note', e, 'note');
      Object.assign(r, { status: 'rejected', decidedAt: now(), decidedBy: userId, note: opts.note!.trim() });
      notifyUser(r.userId, 'course', 'Mentorship request not accepted', `“${c.title}”: ${opts.note!.trim()}`, { pathname: '/mentorship' });
    } else {
      const start = new Date(opts.startsAt ?? r.preferredAt).getTime();
      if (!Number.isFinite(start) || start < Date.now() + 5 * 6e4) throw new ApiError('time', 'Pick a time at least 5 minutes from now.', 'time');
      const end = start + r.durationMin * 6e4;
      const busy = A().mentor.find((x) => x.id !== r.id && x.status === 'accepted' && (x.decidedBy === userId || x.mentorUserId === userId) && new Date(x.startsAt!).getTime() < end && start < new Date(x.endsAt!).getTime());
      if (busy) throw new ApiError('time', `You already have a 1:1 with ${nameOf(busy.userId)} at ${fmt(busy.startsAt!)}. Pick another time.`, 'time');
      Object.assign(r, { status: 'accepted', decidedAt: now(), decidedBy: userId, note: opts.note?.trim() || undefined, startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() });
      notifyUser(r.userId, 'course', 'Mentorship confirmed', `${nameOf(userId)} · “${c.title}” · ${fmt(r.startsAt!)} (${r.durationMin} min). Join from Live → 1:1 mentorship.${r.note ? ` Note: ${r.note}` : ''}`, { pathname: '/mentorship' });
    }
    persist();
    return r;
  },

  async cancel(userId: string, id: string, reason = '') {
    await wait(300);
    const r = A().mentor.find((x) => x.id === id);
    if (!r) throw new ApiError('not_found', 'Request not found.');
    const learner = r.userId === userId;
    if (!learner && !canMentor(userId, r)) throw new ApiError('forbidden', 'You can’t cancel this request.');
    if (!canMentorMove(r.status, 'cancelled')) throw new ApiError('decided', `This request is already ${r.status}.`);
    if (r.status === 'accepted' && new Date(r.startsAt!).getTime() <= Date.now()) throw new ApiError('started', 'This session has already started.');
    Object.assign(r, { status: 'cancelled', decidedAt: now(), cancelledBy: learner ? 'learner' : 'mentor', note: reason.trim() || r.note });
    const c = courseOf(r.courseId)!;
    if (learner) mentorRecipients(r).forEach((x) => notifyUser(x, 'course', 'Mentorship cancelled by learner', `${nameOf(r.userId)} cancelled the 1:1 for “${c.title}”.`, { pathname: '/edu/mentorship' }));
    else notifyUser(r.userId, 'course', 'Mentorship cancelled', `${nameOf(userId)} cancelled your 1:1 for “${c.title}”.${reason.trim() ? ` ${reason.trim()}` : ''}`, { pathname: '/mentorship' });
    persist();
    return r;
  },

  /** Room for a confirmed 1:1 (learner or mentor), open 10 minutes before the start until the end. */
  async join(userId: string, id: string) {
    await wait(400);
    const r = A().mentor.find((x) => x.id === id);
    if (!r || (r.userId !== userId && !canMentor(userId, r))) throw new ApiError('forbidden', 'You can’t join this session.');
    if (r.status !== 'accepted') throw new ApiError('status', r.status === 'pending' ? 'This session isn’t confirmed yet.' : `This session was ${r.status}.`);
    const t = Date.now();
    if (t < new Date(r.startsAt!).getTime() - 10 * 6e4) throw new ApiError('too_early', `The room opens 10 minutes before ${fmt(r.startsAt!)}.`);
    if (t > new Date(r.endsAt!).getTime()) throw new ApiError('ended', 'This session has ended.');
    return { r, course: courseOf(r.courseId)!, other: r.userId === userId ? (r.mentorUserId ? nameOf(r.mentorUserId) : 'Bodhin mentor') : nameOf(r.userId), token: uid('room') };
  },
  get: (id: string) => A().mentor.find((x) => x.id === id) ?? null,
  /** Confirmed 1:1s for the timetable (mentor side). */
  sessionsFor(userId: string) {
    return A().mentor.filter((r) => r.status === 'accepted' && canMentor(userId, r)).map((r) => ({ id: r.id, title: `1:1 · ${nameOf(r.userId)}`, sub: courseOf(r.courseId)?.title ?? '', startsAt: r.startsAt!, endsAt: r.endsAt! }));
  },
  /** Confirmed 1:1s for the learner's Live tab. */
  learnerSessions(userId: string) {
    return A().mentor.filter((r) => r.status === 'accepted' && r.userId === userId && new Date(r.endsAt!).getTime() > Date.now()).map((r) => ({ r, course: courseOf(r.courseId)!, mentor: r.mentorUserId ? nameOf(r.mentorUserId) : 'Bodhin mentor', label: mentorLabel(r) }));
  },
};

/* ───────────────────────── Course-wide live classes ───────────────────────── */

export const courseLive = {
  /** Courses this person can schedule for: owner/Bodhin team → all; tutor → assigned. Published or not. */
  courses(userId: string) {
    return educator.courses(userId).filter((c) => c.status !== 'archived' && c.title);
  },

  async schedule(userId: string, input: { courseId: string; title: string; startsAt: string; durationMin: number; notifyNow: boolean }) {
    await wait(400);
    if (!db.flags.liveClasses) throw new ApiError('paused', 'Scheduling live classes is paused by Bodhin right now.');
    const ctx = ctxOrThrow(userId);
    if (ctx.locked) throw new ApiError('locked', `${ctx.gate.title}. ${ctx.gate.message}`);
    if (!ctx.ent.has('live_classes')) throw new ApiError('module', ctx.ent.inPlan('live_classes') ? 'Live classes are switched off for your academy. Turn them on in Workspace → Modules.' : 'Live classes aren’t in your plan. Upgrade in Subscription & usage.');
    const c = courseLive.courses(userId).find((x) => x.id === input.courseId);
    if (!c) throw new ApiError('course', 'Choose one of your courses.', 'course');
    if (input.title.trim().length < 4) throw new ApiError('title', 'Add a class title (4+ characters).', 'title');
    const start = new Date(input.startsAt).getTime();
    if (!Number.isFinite(start) || start < Date.now() + 5 * 6e4) throw new ApiError('time', 'Pick a start time at least 5 minutes from now.', 'time');
    if (!(input.durationMin >= 15 && input.durationMin <= 300)) throw new ApiError('time', 'Classes run 15 minutes to 5 hours.', 'time');
    const end = start + input.durationMin * 6e4;
    const clash = seedLive.find((s) => s.courseId === c.id && !A().liveCancelled[s.id] && db.sessionStatus[s.id] !== 'cancelled' && new Date(s.startsAt).getTime() < end && start < new Date(s.endsAt).getTime());
    if (clash) throw new ApiError('time', `Clashes with “${clash.title}” for this course (${fmt(clash.startsAt)}). Pick another time.`, 'time');
    const s: LiveSession = { id: uid('cl'), courseId: c.id, title: input.title.trim(), startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString(), registeredUserIds: [] };
    A().courseLive.push(s);
    seedLive.push(s);
    if (input.notifyNow) courseLive.buyers(c.id).forEach((id) => notifyUser(id, 'course', 'New live class scheduled', `${c.title}: ${s.title} · ${fmt(s.startsAt)}. It’s in your Live tab.`, { pathname: '/live' }));
    persist();
    return s;
  },

  async cancel(userId: string, id: string, reason: string) {
    await wait(300);
    const s = seedLive.find((x) => x.id === id);
    if (!s || !courseLive.courses(userId).some((c) => c.id === s.courseId)) throw new ApiError('forbidden', 'You can’t cancel this class.');
    if (new Date(s.startsAt).getTime() <= Date.now()) throw new ApiError('started', 'This class has already started.');
    if (reason.trim().length < 5) throw new ApiError('reason', 'Tell students why (5+ characters).', 'reason');
    db.sessionStatus[id] = 'cancelled';
    A().liveCancelled[id] = reason.trim();
    const c = courseOf(s.courseId)!;
    courseLive.buyers(c.id).forEach((u) => notifyUser(u, 'course', 'Live class cancelled', `${c.title}: ${s.title} (${fmt(s.startsAt)}) — ${reason.trim()}`, { pathname: '/live' }));
    persist();
  },

  /** Everyone who bought the course (active enrolment). */
  buyers(courseId: string) {
    return [...new Set(db.enrollments.filter((e) => e.courseId === courseId && (!e.validTill || new Date(e.validTill).getTime() > Date.now())).map((e) => e.userId))];
  },

  /** Admin / educator list of course-wide classes (upcoming, live, past). */
  async list(userId: string) {
    await wait(200);
    ctxOrThrow(userId);
    const ids = new Set(courseLive.courses(userId).map((c) => c.id));
    const t = Date.now();
    const rows = seedLive.filter((s) => ids.has(s.courseId)).map((s) => {
      const cancelled = db.sessionStatus[s.id] === 'cancelled';
      const ended = db.sessionStatus[s.id] === 'conducted' || new Date(s.endsAt).getTime() <= t;
      const state = cancelled ? 'cancelled' : ended ? 'ended' : new Date(s.startsAt).getTime() <= t ? 'live' : 'upcoming';
      return { s, course: courseOf(s.courseId)!, state: state as 'cancelled' | 'ended' | 'live' | 'upcoming', buyers: courseLive.buyers(s.courseId).length };
    });
    return {
      live: rows.filter((r) => r.state === 'live'),
      upcoming: rows.filter((r) => r.state === 'upcoming').sort((a, b) => a.s.startsAt.localeCompare(b.s.startsAt)),
      past: rows.filter((r) => r.state === 'ended' || r.state === 'cancelled').sort((a, b) => b.s.startsAt.localeCompare(a.s.startsAt)).slice(0, 20),
    };
  },
};

/* ───────────────────────── Teaching reminders (timetable) ───────────────────────── */

export const reminders = {
  /** The educator's own reminders + due-soon notification (once per reminder). */
  list(userId: string) {
    const ctx = ctxOrThrow(userId);
    const mine = A().reminders.filter((r) => r.userId === userId && r.tenantId === ctx.tenant.id);
    const t = Date.now();
    let changed = false;
    for (const r of mine) if (!r.done && !r.notified && new Date(r.dueAt).getTime() - t < 864e5) { notifyUser(userId, 'system', `Reminder: ${r.title}`, `Due ${fmt(r.dueAt)}`, { pathname: '/edu/timetable' }); r.notified = true; changed = true; }
    if (changed) persist();
    const nowD = new Date();
    const by = (b: string) => mine.filter((r) => reminderBucket(r, nowD) === b).sort((a, b2) => a.dueAt.localeCompare(b2.dueAt));
    return { overdue: by('overdue'), today: by('today'), upcoming: by('upcoming'), done: by('done').reverse().slice(0, 20), courses: educator.courses(userId).filter((c) => c.title) };
  },
  async add(userId: string, input: { kind: ReminderKind; title: string; note?: string; dueAt: string; courseId?: string }) {
    await wait(250);
    const ctx = ctxOrThrow(userId);
    const e = reminderErrors(input, { isNew: true });
    if (e.length) throw new ApiError(e[0].field, e[0].msg, e[0].field);
    if (A().reminders.filter((r) => r.userId === userId && !r.done).length >= 200) throw new ApiError('limit', 'Up to 200 open reminders. Tick some off first.');
    const r: Reminder = { id: uid('rm'), userId, tenantId: ctx.tenant.id, kind: input.kind, title: input.title.trim(), note: input.note?.trim() || undefined, dueAt: new Date(input.dueAt).toISOString(), courseId: input.courseId || undefined, done: false, createdAt: now(), updatedAt: now() };
    A().reminders.push(r);
    persist();
    return r;
  },
  async update(userId: string, id: string, patch: Partial<Pick<Reminder, 'kind' | 'title' | 'note' | 'dueAt' | 'courseId' | 'done'>>) {
    await wait(200);
    const r = A().reminders.find((x) => x.id === id && x.userId === userId);
    if (!r) throw new ApiError('not_found', 'Reminder not found.');
    const next = { ...r, ...patch };
    const e = reminderErrors(next, { isNew: false });
    if (e.length) throw new ApiError(e[0].field, e[0].msg, e[0].field);
    const moved = patch.dueAt && patch.dueAt !== r.dueAt;
    Object.assign(r, patch, { title: next.title.trim(), dueAt: new Date(next.dueAt).toISOString(), updatedAt: now() }, moved ? { notified: false } : {});
    persist();
    return r;
  },
  async remove(userId: string, id: string) {
    await wait(150);
    A().reminders = A().reminders.filter((x) => !(x.id === id && x.userId === userId));
    persist();
  },
};

/* ───────────────────────── Course categories ("Other") ───────────────────────── */

export const categoriesApi = {
  /** What the course form offers: marketplace categories + this academy's own. */
  forCourse(userId: string) {
    const ctx = educator.context(userId);
    const base = catalog.allCategories().filter((k) => k.id !== 'all' && !(k as { hidden?: boolean }).hidden);
    const own = ctx ? A().categories.filter((k) => k.tenantId === ctx.tenant.id) : [];
    return [...base.map((k) => ({ id: k.id, name: k.name, icon: k.icon, own: false })), ...own.map((k) => ({ id: k.id, name: k.name, icon: k.icon, own: true }))];
  },
  /** Saves a new category. Bodhin team → added to the marketplace list; academies → their own list. */
  async add(userId: string, name: string) {
    await wait(250);
    const ctx = ctxOrThrow(userId);
    const n = name.trim().replace(/\s+/g, ' ');
    const err = categoryNameError(n, categoriesApi.forCourse(userId).map((k) => k.name));
    if (err) throw new ApiError('category', err, 'category');
    if (ctx.tenant.id === BODHIN()) {
      const cats = db.curation.categories ?? catalog.allCategories().map((k) => ({ ...k, hidden: false }));
      const id = `cat_${categorySlug(n)}_${Math.random().toString(36).slice(2, 5)}`;
      cats.push({ id, name: n, icon: 'apps', hidden: false } as (typeof cats)[number]);
      db.curation.categories = cats;
      persist();
      return { id, name: n, icon: 'apps', own: false };
    }
    if (A().categories.filter((k) => k.tenantId === ctx.tenant.id).length >= 30) throw new ApiError('limit', 'Up to 30 custom categories.');
    const k = { id: `own_${categorySlug(n)}_${Math.random().toString(36).slice(2, 5)}`, tenantId: ctx.tenant.id, name: n, icon: 'pricetag', createdBy: userId, at: now() };
    A().categories.push(k);
    persist();
    return { id: k.id, name: k.name, icon: k.icon, own: true };
  },
  nameOf(id: string) {
    return catalog.allCategories().find((k) => k.id === id)?.name ?? A().categories.find((k) => k.id === id)?.name ?? null;
  },
};

/* ───────────────────────── Course media (cover image, intro video) ───────────────────────── */

export const courseMedia = {
  /** Cover: an uploaded image replaces the colour + icon art on cards and the course page. */
  async setCover(userId: string, courseId: string, file: { name: string; mime?: string | null; sizeBytes?: number | null; uri: string } | null) {
    await wait(250);
    const r = courseAdmin.get(userId, courseId);
    if (!r) throw new ApiError('forbidden', 'You can’t edit this course.');
    if (file) {
      const e = mediaError('cover', file);
      if (e) throw new ApiError('cover', e, 'cover');
    }
    const art = { ...r.course.art, image: file ? file.uri : undefined } as Course['art'];
    await courseAdmin.update(userId, courseId, { art });
    return art;
  },
  /** Intro video: shown on the course page. Real: uploaded to media storage → HLS; here the picked file is kept. */
  async setIntroVideo(userId: string, courseId: string, file: { name: string; mime?: string | null; sizeBytes?: number | null; uri: string } | null) {
    await wait(file ? 900 : 200);
    const r = courseAdmin.get(userId, courseId);
    if (!r) throw new ApiError('forbidden', 'You can’t edit this course.');
    if (file) {
      const e = mediaError('video', file);
      if (e) throw new ApiError('video', e, 'video');
    }
    const intro = file ? { name: file.name, sizeMb: Math.round(((file.sizeBytes ?? 0) / 1048576) * 10) / 10, uri: file.uri, mime: file.mime ?? undefined, at: now() } : undefined;
    await courseAdmin.update(userId, courseId, { intro } as Partial<Course>);
    return intro;
  },
};

/* ───────────────────────── Students by course ───────────────────────── */

export const studentsApi = {
  /** Every course this person manages → its students with purchase, progress, quiz and assignment status. */
  async byCourse(userId: string) {
    await wait(250);
    const ctx = ctxOrThrow(userId);
    const courses = educator.courses(userId).filter((c) => c.title);
    return {
      ctx,
      courses: courses.map((c) => {
        const quizzes = ASSESSMENTS.filter((a) => a.courseId === c.id && a.kind !== 'assignment' && a.status !== 'draft');
        const assigns = ASSESSMENTS.filter((a) => a.courseId === c.id && a.kind === 'assignment' && a.status !== 'draft');
        const rows = db.enrollments.filter((e) => e.courseId === c.id).map((e) => {
          const u = userOf(e.userId);
          const order = db.orders.filter((o) => o.userId === e.userId && o.courseId === c.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
          const qDone = quizzes.filter((q) => bestPct(e.userId, q.id) != null);
          const qPassed = quizzes.filter((q) => (bestPct(e.userId, q.id) ?? -1) >= q.passPct);
          const subs = assigns.map((a) => db.submissions.find((s) => s.userId === e.userId && s.assessmentId === a.id));
          const expired = !!e.validTill && new Date(e.validTill).getTime() < Date.now();
          return {
            userId: e.userId,
            name: u?.name ?? 'Learner',
            email: u?.email ?? '',
            purchase: order ? (order.status === 'refunded' ? 'Refunded' : order.status === 'paid' ? (expired ? 'Access expired' : 'Paid') : order.status === 'failed' ? 'Payment failed' : 'Pending') : expired ? 'Access expired' : 'Enrolled (free or invited)',
            amountInr: order?.amountInr ?? 0,
            progressPct: progressOf(c, e).pct,
            quiz: { total: quizzes.length, attempted: qDone.length, passed: qPassed.length },
            assignment: { total: assigns.length, submitted: subs.filter((s) => s && (s.status === 'submitted' || s.status === 'graded')).length, graded: subs.filter((s) => s?.status === 'graded').length },
            certificate: db.certificates.some((x) => x.userId === e.userId && x.courseId === c.id) ? 'Issued' : A().certRequests.some((r) => r.userId === e.userId && r.courseId === c.id && r.status === 'pending') ? 'Waiting approval' : null,
            lastActiveAt: e.lastActiveAt ?? null,
          };
        }).sort((a, b) => a.name.localeCompare(b.name));
        return { course: c, students: rows, avgProgress: rows.length ? Math.round(rows.reduce((s, r) => s + r.progressPct, 0) / rows.length) : 0 };
      }),
    };
  },
};

/* ───────────────────────── Announcements from Community ───────────────────────── */

export const announcements = {
  /** Channels where this staff member can post an announcement. */
  channels(userId: string) {
    const ctx = ctxOrThrow(userId);
    return communityApi.admin(userId).channels.filter(({ c }) => c.tenantId === ctx.tenant.id).map(({ c }) => c).sort((a, b) => Number(b.announce) - Number(a.announce));
  },
  /** Posts to the channel (pinned) and notifies everyone who can read it. */
  async post(userId: string, input: { channelId: string; title: string; body: string; pin: boolean; notify: boolean }) {
    await wait(300);
    if (input.title.trim().length < 3) throw new ApiError('title', 'Add a short title (3+ characters).', 'title');
    if (input.body.trim().length < 5) throw new ApiError('body', 'Write the announcement (5+ characters).', 'body');
    const ch = announcements.channels(userId).find((c) => c.id === input.channelId);
    if (!ch) throw new ApiError('channel', 'Pick a channel.', 'channel');
    const p = communityApi.post(userId, ch.id, `📣 ${input.title.trim()}\n${input.body.trim()}`);
    if (input.pin) communityApi.moderate(userId, p.id, 'pin');
    let reached = 0;
    if (input.notify) {
      const readers = ch.courseId ? courseLive.buyers(ch.courseId) : [...new Set(db.enrollments.filter((e) => courseOf(e.courseId)?.tenantId === ch.tenantId).map((e) => e.userId))];
      readers.filter((u) => u !== userId).forEach((u) => { notifyUser(u, 'course', input.title.trim(), input.body.trim().slice(0, 140), { pathname: '/community/[id]', params: { id: ch.id } }); reached++; });
      persist();
    }
    return { post: p, reached };
  },
};

/* ───────────────────────── Tutor → owner: ask to publish & review ───────────────────────── */

export async function askOwnerToPublish(userId: string, courseId: string, notes?: string) {
  await wait(300);
  const r = courseAdmin.get(userId, courseId);
  if (!r) throw new ApiError('forbidden', 'You can’t edit this course.');
  if (r.role === 'owner') throw new ApiError('owner', 'You can publish this course yourself.');
  const tutorName = nameOf(userId);
  const course = r.course;
  course.tutorReview = {
    status: 'pending',
    requestedAt: new Date().toISOString(),
    requestedByTutorId: userId,
    tutorName,
    notes: notes?.trim() || undefined,
  };
  saveCourse(course);
  approversOf(r.ctx.tenant.id).forEach((id) =>
    notifyUser(
      id,
      'course',
      `Tutor created course: ${course.title || 'Untitled'}`,
      `${tutorName} created "${course.title || 'Untitled'}" and requested review. Click to preview videos, set pricing, and publish.`,
      { pathname: '/edu/course/[id]', params: { id: courseId, review: '1' } }
    )
  );
  persist();
  return course;
}

export async function respondToTutorReview(
  ownerUserId: string,
  courseId: string,
  action: 'approve' | 'request_changes',
  feedback?: string,
  pricingPatch?: { priceInr?: number; compareAtInr?: number; offerEndsAt?: string; visibility?: Course['visibility'] }
) {
  await wait(300);
  const r = courseAdmin.get(ownerUserId, courseId);
  if (!r) throw new ApiError('forbidden', 'You can’t manage this course.');
  if (r.role !== 'owner') throw new ApiError('forbidden', 'Only the workspace owner can approve courses.');

  const course = r.course;
  const ownerName = nameOf(ownerUserId);
  const tutorUserId = course.tutorReview?.requestedByTutorId;

  if (action === 'approve') {
    if (pricingPatch) {
      if (pricingPatch.priceInr !== undefined) course.priceInr = pricingPatch.priceInr;
      if (pricingPatch.compareAtInr !== undefined) course.compareAtInr = pricingPatch.compareAtInr;
      if (pricingPatch.offerEndsAt !== undefined) course.offerEndsAt = pricingPatch.offerEndsAt;
      if (pricingPatch.visibility !== undefined) course.visibility = pricingPatch.visibility;
    }
    course.tutorReview = {
      ...course.tutorReview,
      status: 'approved',
      reviewedAt: new Date().toISOString(),
      reviewedByOwnerId: ownerUserId,
      ownerFeedback: feedback,
    };
    saveCourse(course);
    await courseAdmin.publish(ownerUserId, courseId);

    if (tutorUserId) {
      notifyUser(
        tutorUserId,
        'course',
        'Course approved & live! 🎉',
        `${ownerName} reviewed "${course.title}", set price to ${course.priceInr ? `₹${course.priceInr}` : 'Free'}, and published it.`,
        { pathname: '/edu/course/[id]', params: { id: courseId } }
      );
    }
  } else {
    course.tutorReview = {
      ...course.tutorReview,
      status: 'changes_requested',
      reviewedAt: new Date().toISOString(),
      reviewedByOwnerId: ownerUserId,
      ownerFeedback: feedback,
    };
    saveCourse(course);
    if (tutorUserId) {
      notifyUser(
        tutorUserId,
        'course',
        'Changes requested on course',
        `${ownerName} reviewed "${course.title}": ${feedback || 'Please update the lessons and resubmit.'}`,
        { pathname: '/edu/course/[id]', params: { id: courseId } }
      );
    }
  }
  persist();
  return course;
}
