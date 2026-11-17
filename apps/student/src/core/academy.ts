/**
 * Academy rules added in the Nov 16 change request (team feedback). Pure functions only, so the same rules can be
 * unit-tested and mirrored in the database (supabase/migrations/0010_academy_workflows.sql).
 *
 *  - Certificates: a learner becomes eligible at 75% of the course AND the required quiz passed; an approver
 *    (academy owner, or Bodhin staff for Bodhin's own courses) approves or rejects before it is issued.
 *  - 1:1 mentorship requests: pending → accepted | rejected | cancelled.
 *  - Teaching reminders (timetable): kept apart from live meetings.
 *  - Course media: cover image and intro video validation.
 *  - Course categories: "Other" → a new category name.
 */

/* ───────────── Certificates ───────────── */
export const CERT_MIN_PCT = 75;

export type CertMode = 'approval' | 'auto';
export type CertReqStatus = 'pending' | 'approved' | 'rejected';

export interface CertRequest {
  id: string;
  userId: string;
  courseId: string;
  tenantId: string;
  status: CertReqStatus;
  progressPct: number;
  quizPct: number | null; // best score on the required quiz (null = course has no quiz)
  requestedAt: string;
  decidedAt?: string;
  decidedBy?: string;
  reason?: string; // rejection reason, shown to the learner
  certId?: string;
}

export interface Eligibility {
  eligible: boolean;
  progressPct: number;
  needPct: number;
  quiz: { id: string; title: string; passPct: number; bestPct: number | null; passed: boolean } | null;
  /** What is still missing, in the learner's words. Empty when eligible. */
  missing: string[];
}

export function certEligibility(input: {
  progressPct: number;
  quiz: { id: string; title: string; passPct: number; bestPct: number | null } | null;
  minPct?: number;
}): Eligibility {
  const need = input.minPct ?? CERT_MIN_PCT;
  const pct = Math.max(0, Math.min(100, Math.round(input.progressPct)));
  const quiz = input.quiz ? { ...input.quiz, passed: input.quiz.bestPct != null && input.quiz.bestPct >= input.quiz.passPct } : null;
  const missing: string[] = [];
  if (pct < need) missing.push(`Complete ${need}% of the course (you are at ${pct}%)`);
  if (quiz && !quiz.passed) missing.push(quiz.bestPct == null ? `Pass the quiz “${quiz.title}” (${quiz.passPct}% to pass)` : `Score ${quiz.passPct}% in “${quiz.title}” (best so far ${quiz.bestPct}%)`);
  return { eligible: missing.length === 0, progressPct: pct, needPct: need, quiz, missing };
}

/** Which quiz decides the certificate: the one the educator picked, else the last quiz of the course. */
export function requiredQuizOf<T extends { id: string; kind: string; status?: string }>(quizzes: T[], pickedId?: string | null): T | null {
  const list = quizzes.filter((q) => q.kind !== 'assignment' && q.status !== 'draft');
  if (pickedId === 'none') return null;
  if (pickedId) return list.find((q) => q.id === pickedId) ?? list[list.length - 1] ?? null;
  return list[list.length - 1] ?? null;
}

export function rejectReasonError(reason: string) {
  const r = reason.trim();
  if (r.length < 10) return 'Tell the learner why in at least 10 characters, so they know what to do next.';
  if (r.length > 300) return 'Keep the reason under 300 characters.';
  return null;
}

/* ───────────── 1:1 mentorship ───────────── */
export type MentorStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';
export interface MentorRequest {
  id: string;
  userId: string; // learner
  courseId: string;
  tenantId: string;
  mentorUserId: string | null; // the tutor asked for (null = the academy / Bodhin team)
  topic: string;
  preferredAt: string;
  durationMin: number;
  status: MentorStatus;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
  note?: string; // tutor's message (accept: what to prepare; reject: why)
  startsAt?: string; // confirmed time
  endsAt?: string;
  cancelledBy?: 'learner' | 'mentor';
  viewedBy?: string[]; // IDs of tutors/educators who have viewed this request
}

export const MENTOR_DURATIONS = [15, 30, 45, 60] as const;

export function mentorRequestErrors(input: { topic: string; preferredAt: string; durationMin: number }, now = Date.now()) {
  const e: { field: string; msg: string }[] = [];
  const t = input.topic.trim();
  if (t.length < 10) e.push({ field: 'topic', msg: 'Say what you want help with (10+ characters).' });
  if (t.length > 500) e.push({ field: 'topic', msg: 'Keep it under 500 characters.' });
  const at = new Date(input.preferredAt).getTime();
  if (!Number.isFinite(at)) e.push({ field: 'time', msg: 'Pick a date and time.' });
  else if (at < now + 60 * 6e4) e.push({ field: 'time', msg: 'Pick a time at least 1 hour from now.' });
  else if (at > now + 60 * 864e5) e.push({ field: 'time', msg: 'Pick a time within the next 60 days.' });
  if (!(MENTOR_DURATIONS as readonly number[]).includes(input.durationMin)) e.push({ field: 'duration', msg: 'Pick 15, 30, 45 or 60 minutes.' });
  return e;
}

/** Allowed moves. A decision is final; only a pending or accepted request can be cancelled. */
export function canMentorMove(from: MentorStatus, to: MentorStatus) {
  if (from === 'pending') return to === 'accepted' || to === 'rejected' || to === 'cancelled';
  if (from === 'accepted') return to === 'cancelled';
  return false;
}

/** What the learner sees: Requested, Confirmed, Live now, Done, Not accepted, Cancelled. */
export function mentorLabel(r: Pick<MentorRequest, 'status' | 'startsAt' | 'endsAt'>, now = Date.now()) {
  if (r.status === 'pending') return 'Waiting for reply';
  if (r.status === 'rejected') return 'Not accepted';
  if (r.status === 'cancelled') return 'Cancelled';
  const s = r.startsAt ? new Date(r.startsAt).getTime() : 0;
  const e = r.endsAt ? new Date(r.endsAt).getTime() : 0;
  if (now >= e) return 'Done';
  if (now >= s - 10 * 6e4) return 'Live now';
  return 'Confirmed';
}

/* ───────────── Timetable reminders ───────────── */
export type ReminderKind = 'course_update' | 'quiz' | 'assignment' | 'deadline' | 'other';
export const REMINDER_KINDS: { id: ReminderKind; label: string; icon: string }[] = [
  { id: 'course_update', label: 'Course update', icon: 'layers-outline' },
  { id: 'quiz', label: 'Quiz', icon: 'help-circle-outline' },
  { id: 'assignment', label: 'Assignment', icon: 'document-text-outline' },
  { id: 'deadline', label: 'Deadline', icon: 'alarm-outline' },
  { id: 'other', label: 'Other task', icon: 'checkbox-outline' },
];
export interface Reminder {
  id: string;
  userId: string;
  tenantId: string;
  kind: ReminderKind;
  title: string;
  note?: string;
  dueAt: string;
  courseId?: string;
  done: boolean;
  createdAt: string;
  updatedAt: string;
}
export function reminderErrors(input: { title: string; dueAt: string; kind: string }, opts: { isNew: boolean; now?: number }) {
  const e: { field: string; msg: string }[] = [];
  if (input.title.trim().length < 3) e.push({ field: 'title', msg: 'Add a short title (3+ characters).' });
  if (input.title.length > 80) e.push({ field: 'title', msg: 'Keep the title under 80 characters.' });
  if (!REMINDER_KINDS.some((k) => k.id === input.kind)) e.push({ field: 'kind', msg: 'Pick a type.' });
  const at = new Date(input.dueAt).getTime();
  if (!Number.isFinite(at)) e.push({ field: 'dueAt', msg: 'Pick a date and time.' });
  else if (opts.isNew && at < (opts.now ?? Date.now()) - 6e4) e.push({ field: 'dueAt', msg: 'Pick a time from now on.' });
  return e;
}
/** Reminder buckets for the timetable: overdue, today, upcoming, done. */
export function reminderBucket(r: Pick<Reminder, 'dueAt' | 'done'>, now = new Date()) {
  if (r.done) return 'done' as const;
  const t = new Date(r.dueAt);
  if (t.getTime() < now.getTime()) return 'overdue' as const;
  if (t.toDateString() === now.toDateString()) return 'today' as const;
  return 'upcoming' as const;
}

/* ───────────── Course media ───────────── */
export const COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska'];
export const COVER_MAX_MB = 5;
export const VIDEO_MAX_MB = 2048;

const extType = (name: string) => {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska' } as Record<string, string>)[ext] ?? '';
};

export function mediaError(kind: 'cover' | 'video', f: { name: string; mime?: string | null; sizeBytes?: number | null }) {
  const mime = (f.mime || extType(f.name)).toLowerCase();
  const mb = (f.sizeBytes ?? 0) / (1024 * 1024);
  if (kind === 'cover') {
    if (!COVER_TYPES.includes(mime)) return 'Use a JPG, PNG or WebP image.';
    if (mb > COVER_MAX_MB) return `This image is ${mb.toFixed(1)} MB. Use one under ${COVER_MAX_MB} MB.`;
    return null;
  }
  if (!VIDEO_TYPES.includes(mime)) return 'Use an MP4, MOV, WebM or MKV video.';
  if (mb > VIDEO_MAX_MB) return `This video is ${(mb / 1024).toFixed(1)} GB. Use one under 2 GB.`;
  return null;
}

/* ───────────── Categories ───────────── */
export function categoryNameError(name: string, existing: string[]) {
  const n = name.trim().replace(/\s+/g, ' ');
  if (n.length < 3) return 'Category name: at least 3 characters.';
  if (n.length > 40) return 'Category name: up to 40 characters.';
  if (!/^[\p{L}\p{N} &+\-/.,()']+$/u.test(n)) return 'Use letters, numbers and simple punctuation only.';
  if (existing.some((x) => x.trim().toLowerCase() === n.toLowerCase())) return 'This category already exists. Pick it from the list.';
  return null;
}
export const categorySlug = (name: string) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'category';
