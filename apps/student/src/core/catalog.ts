/** Learning domain types + pure helpers (progress, pricing display, filtering). No React imports. */

export type Level = 'beginner' | 'intermediate' | 'advanced' | 'all';
export type Format = 'live' | 'recorded' | 'hybrid';
/** Pricing doc: private by default; public listing and promotion need separate consent. */
export type Visibility = 'private' | 'public' | 'public_promoted';

export interface Tutor {
  id: string;
  tenantId: string;
  name: string;
  headline: string;
  yearsExperience: number;
  verified: boolean;
  color: string; // avatar background until real photos exist
}

export interface Category {
  id: string;
  name: string;
  icon: string; // Ionicons name
}

export interface Lesson {
  id: string;
  title: string;
  type: 'video' | 'pdf' | 'quiz';
  durationSec?: number;
  sizeMb?: number;
  videoUri?: string;
  questions?: number;
  preview?: boolean; // free preview before enrolling
  description?: string;
  resources?: { name: string; sizeMb: number }[];
  completion?: 'watch_90' | 'manual';
  videoUrl?: string;
}

export interface Module {
  id: string;
  title: string;
  lessons: Lesson[];
}

export interface Course {
  id: string;
  tenantId: string;
  tutorId: string;
  title: string;
  subtitle: string;
  description: string;
  categoryId: string;
  collections: string[]; // 'career' | 'job-ready' | 'certification' | 'short'
  level: Level;
  format: Format;
  priceInr: number; // 0 = free
  compareAtInr?: number; // only a real, time-bound offer may show a strike price
  offerEndsAt?: string;
  rating: number;
  ratingCount: number;
  students: number;
  badge?: 'bestseller' | 'new' | 'trending';
  visibility: Visibility;
  moderation: 'approved' | 'pending' | 'rejected';
  outcomes: string[];
  projects: number;
  certificate: boolean;
  /** Cover: gradient + icon, or an uploaded image (image wins when set). */
  art: { from: string; to: string; icon: string; image?: string };
  /** Intro video shown on the course page (uploaded by the educator). */
  intro?: { name: string; sizeMb: number; uri: string; mime?: string; at: string };
  modules: Module[];
  publishedAt: string;
  /** Lifecycle. Undefined = published (seed data). Draft courses are visible only in the builder. */
  status?: 'draft' | 'published' | 'archived';
  language?: string;
  accessMonths?: number | null; // null = lifetime
  drip?: { enabled: boolean; everyDays: number };
  /** Bodhin's note when a listing is rejected or needs changes. */
  moderationNote?: string;
  updatedAt?: string;
  /** Internal review state between staff tutor and workspace educator/owner. */
  tutorReview?: {
    status: 'draft' | 'pending' | 'approved' | 'changes_requested';
    requestedAt?: string;
    requestedByTutorId?: string;
    tutorName?: string;
    notes?: string;
    reviewedAt?: string;
    reviewedByOwnerId?: string;
    ownerFeedback?: string;
  };
}

/** Listing review: 'changes' = Bodhin asked for edits before listing. */
export type Moderation = Course['moderation'];

export const isPublished = (c: Course) => (c.status ?? 'published') === 'published';
/** Visible on the tutor's own site/app (private or public). */
export const onWorkspace = (c: Course) => isPublished(c);
/** Visible on the Bodhin marketplace: published + listing requested + approved by Bodhin. */
export const onMarketplace = (c: Course) => isPublished(c) && c.visibility !== 'private' && c.moderation === 'approved';

export interface Enrollment {
  userId: string;
  courseId: string;
  enrolledAt: string;
  validTill?: string;
  completedLessonIds: string[];
  lastLessonId?: string;
  lastActiveAt?: string;
  /** Attribution for the 20% marketplace commission. */
  source: 'direct' | 'tutor_marketing' | 'bodhin_referral' | 'bodhin_campaign';
}

export interface LiveSession {
  id: string;
  courseId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  registeredUserIds: string[];
}

export const LEVEL_LABEL: Record<Level, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced', all: 'Beginner to Advanced' };
export const FORMAT_LABEL: Record<Format, string> = { live: 'Live', recorded: 'Recorded', hybrid: 'Live + Recorded' };

export const COLLECTIONS = [
  { id: 'career', name: 'Career Programs', icon: 'rocket-outline', tint: '#E9F0FD' },
  { id: 'job-ready', name: 'Job Ready Skills', icon: 'briefcase-outline', tint: '#FDF0E4' },
  { id: 'certification', name: 'Certification Courses', icon: 'ribbon-outline', tint: '#FBF3DC' },
  { id: 'short', name: 'Short Courses', icon: 'flash-outline', tint: '#F1ECFC' },
] as const;

export const allLessons = (c: Course) => c.modules.flatMap((m) => m.lessons);
export const lessonCount = (c: Course) => allLessons(c).length;
/**
 * What the player has seen, filled in by api/client: where each learner stopped (`userId:lessonId` → sec)
 * and the real length of videos whose duration the educator didn't enter.
 */
let watchSource: { position: (key: string) => number; seconds: (lessonId: string) => number } = { position: () => 0, seconds: () => 0 };
export function setWatchSource(s: typeof watchSource) {
  watchSource = s;
}
/** A lesson's length in seconds: the entered duration, else the length measured when it was played. */
export const lessonSec = (l: Lesson) => l.durationSec || watchSource.seconds(l.id) || 0;
export const totalSec = (c: Course) => allLessons(c).reduce((s, l) => s + lessonSec(l), 0);
export const totalHours = (c: Course) => Math.round(totalSec(c) / 3600);
/** "2h 15m", "45m", or "" when no lesson has a known length. */
export function contentLength(c: Course) {
  const m = Math.round(totalSec(c) / 60);
  if (!m) return '';
  const h = Math.floor(m / 60);
  return h ? (m % 60 ? `${h}h ${m % 60}m` : `${h}h`) : `${m}m`;
}
/** Seconds this learner has watched of a lesson (their saved position). */
export const watchedSec = (userId: string, lessonId: string) => watchSource.position(`${userId}:${lessonId}`);

export function progressOf(c: Course, e?: Enrollment) {
  const lessons = allLessons(c);
  const total = lessons.length;
  const doneIds = new Set(e?.completedLessonIds ?? []);
  const done = e ? lessons.filter((l) => doneIds.has(l.id)).length : 0;
  const modulesDone = c.modules.filter((m) => e && m.lessons.every((l) => doneIds.has(l.id))).length;
  // Part-watched videos count too, so the % moves while the learner watches (not only when a lesson completes).
  let partial = 0;
  if (e) {
    for (const l of lessons) {
      if (doneIds.has(l.id) || l.type !== 'video') continue;
      const len = lessonSec(l);
      const at = watchedSec(e.userId, l.id);
      if (len > 0 && at > 0) partial += Math.min(at / len, 0.95);
    }
  }
  let pct = total ? Math.round(((done + partial) / total) * 100) : 0;
  if (partial > 0 && pct === 0) pct = 1; // a few seconds in a long course still shows it has started
  if (done < total) pct = Math.min(pct, 99); // 100% only once every lesson is complete (certificates rely on it)
  return { done, total, pct, modulesDone, started: done > 0 || partial > 0 };
}

/** Where "Continue" should take the learner: the lesson they were last watching (if not finished), else the next one. */
export function resumeLesson(c: Course, e?: Enrollment) {
  if (e?.lastLessonId && !e.completedLessonIds.includes(e.lastLessonId)) {
    for (const m of c.modules) for (const l of m.lessons) if (l.id === e.lastLessonId) return { module: m, lesson: l };
  }
  return nextLesson(c, e);
}

/** The lesson a learner should open next, with its module. */
export function nextLesson(c: Course, e?: Enrollment) {
  const done = new Set(e?.completedLessonIds ?? []);
  for (const m of c.modules) for (const l of m.lessons) if (!done.has(l.id)) return { module: m, lesson: l };
  const m = c.modules[c.modules.length - 1];
  return { module: m, lesson: m.lessons[m.lessons.length - 1] };
}

export const inr = (n: number) => (n === 0 ? 'Free' : '₹' + n.toLocaleString('en-IN'));

/** Strike price is shown only for a live, dated offer (pricing doc: no misleading crossed-out prices). */
export function priceDisplay(c: Course, now = Date.now()) {
  const offer = c.compareAtInr && c.offerEndsAt && new Date(c.offerEndsAt).getTime() > now && c.compareAtInr > c.priceInr;
  return {
    price: inr(c.priceInr),
    compareAt: offer ? inr(c.compareAtInr!) : null,
    pctOff: offer ? Math.round((1 - c.priceInr / c.compareAtInr!) * 100) : null,
    offerEndsAt: offer ? c.offerEndsAt! : null,
  };
}

export const compact = (n: number) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'K' : String(n));

export interface CourseQuery {
  text?: string;
  categoryId?: string;
  collection?: string;
  levels?: Level[];
  formats?: Format[];
  price?: 'any' | 'free' | 'under5k' | '5to15k' | 'over15k';
  minRating?: number;
  sort?: 'relevance' | 'popular' | 'rating' | 'newest' | 'price_low' | 'price_high';
}

export function matchesQuery(c: Course, q: CourseQuery, tutorName = '') {
  const t = q.text?.trim().toLowerCase();
  if (t && ![c.title, c.subtitle, tutorName, ...c.outcomes].some((s) => s.toLowerCase().includes(t))) return false;
  if (q.categoryId && q.categoryId !== 'all' && c.categoryId !== q.categoryId) return false;
  if (q.collection && !c.collections.includes(q.collection)) return false;
  if (q.levels?.length && !q.levels.includes(c.level)) return false;
  if (q.formats?.length && !q.formats.includes(c.format)) return false;
  if (q.minRating && c.rating < q.minRating) return false;
  const p = c.priceInr;
  if (q.price === 'free' && p !== 0) return false;
  if (q.price === 'under5k' && !(p > 0 && p < 5000)) return false;
  if (q.price === '5to15k' && !(p >= 5000 && p <= 15000)) return false;
  if (q.price === 'over15k' && !(p > 15000)) return false;
  return true;
}

export function sortCourses(list: Course[], sort: CourseQuery['sort'] = 'relevance') {
  const s = [...list];
  const by: Record<string, (a: Course, b: Course) => number> = {
    popular: (a, b) => b.students - a.students,
    rating: (a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount,
    newest: (a, b) => b.publishedAt.localeCompare(a.publishedAt),
    price_low: (a, b) => a.priceInr - b.priceInr,
    price_high: (a, b) => b.priceInr - a.priceInr,
    relevance: (a, b) => b.rating * Math.log10(b.ratingCount + 10) - a.rating * Math.log10(a.ratingCount + 10),
  };
  return s.sort(by[sort] ?? by.relevance);
}

export interface Review {
  id: string;
  courseId: string;
  userId: string;
  userName: string;
  rating: 1 | 2 | 3 | 4 | 5;
  text: string;
  tags: string[];
  createdAt: string;
}

export const REVIEW_TAGS = ['Course Content', 'Instructor Support', 'Practical Projects', 'Learning Resources', 'Course Structure', 'Value for Money'];
export const RATING_WORD = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'] as const;

/** Star distribution for the summary bars. Real API returns counts; demo derives a plausible split. */
export function ratingSplit(avg: number, count: number, extra: Review[] = []) {
  const five = Math.max(0, Math.min(1, (avg - 3.6) / 1.4));
  const base = [0.01, 0.01, 0.04, Math.max(0, 0.94 - five * 0.94), five * 0.94]; // 1★..5★
  const counts = base.map((p) => Math.round(p * count));
  extra.forEach((r) => (counts[r.rating - 1] += 1));
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  return counts.map((n, i) => ({ stars: i + 1, n, pct: Math.round((n / total) * 100) })).reverse();
}

export type PaymentMethod = 'upi' | 'card' | 'netbanking';

export interface Order {
  id: string;
  userId: string;
  courseId: string;
  amountInr: number; // charged, GST-inclusive
  discountInr: number;
  coupon?: string;
  method: PaymentMethod;
  status: 'paid' | 'failed' | 'refunded';
  createdAt: string;
  invoiceNo: string;
  /** Marketplace accounting — recorded per order so the tutor statement can show it. */
  source: Enrollment['source'];
  commissionInr: number;
  educatorShareInr: number;
  /** Payment routing (core/business.ts). Optional on legacy demo rows. */
  channel?: 'bodhin_own' | 'tutor_direct' | 'bodhin_marketplace';
  collector?: 'bodhin' | 'educator';
  sellerTenantId?: string;
  gatewayFeeInr?: number;
  payoutStatus?: 'not_applicable' | 'on_hold' | 'scheduled' | 'paid';
  payoutDate?: string;
  buyerName?: string; // shown on the educator statement
  /** Round 2: bundle sale, upsell add-on, affiliate attribution, international currency. */
  bundleId?: string;
  upsellOf?: string;
  affiliateCode?: string;
  currency?: 'INR' | 'USD' | 'AED' | 'GBP' | 'EUR';
  amountForeign?: number;
}

/** Demo coupons. Real: validated server-side per tenant. */
export const COUPONS: Record<string, { pct: number; label: string }> = {
  BODHIN10: { pct: 10, label: '10% off' },
  WELCOME5: { pct: 5, label: '5% off for new learners' },
};
