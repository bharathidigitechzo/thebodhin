/**
 * Growth tools — pure business rules (no storage, no UI) so tests and the real backend share them.
 * Round 1 of Nrich / Graphy parity: Leads CRM, Automations, Broadcasts, EMI, Webinars, 1:1 bookings,
 * Digital products, Website builder, Community. Every record carries tenantId (same isolation as courses).
 */
import type { Feature } from './business';

/* ───────────── Leads CRM ───────────── */
export type LeadStage = 'new' | 'contacted' | 'demo' | 'won' | 'lost';
export type LeadSource = 'website' | 'webinar' | 'referral' | 'ads' | 'walk_in' | 'phone' | 'other';
export const LEAD_STAGES: { id: LeadStage; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'contacted', label: 'Contacted' },
  { id: 'demo', label: 'Demo' },
  { id: 'won', label: 'Joined' },
  { id: 'lost', label: 'Lost' },
];
export const LEAD_SOURCES: { id: LeadSource; label: string }[] = [
  { id: 'website', label: 'Website form' },
  { id: 'webinar', label: 'Webinar' },
  { id: 'referral', label: 'Referral' },
  { id: 'ads', label: 'Ads' },
  { id: 'walk_in', label: 'Walk-in' },
  { id: 'phone', label: 'Phone call' },
  { id: 'other', label: 'Other' },
];
export const LOST_REASONS = ['Price too high', 'Timing not right', 'Joined elsewhere', 'Not reachable', 'Not interested'];

export interface Lead {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  email?: string;
  courseId?: string;
  source: LeadSource;
  stage: LeadStage;
  notes: { at: string; text: string; by: string }[];
  nextFollowUpAt?: string;
  demoAt?: string;
  lostReason?: string;
  wonUserId?: string;
  createdAt: string;
  updatedAt: string;
}

/** Indian mobile (10 digits starting 6–9), optional +91. Returns the 10 digits or null. */
export function normPhone(p: string): string | null {
  const d = p.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '').replace(/^0(?=\d{10}$)/, '');
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}
export const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());

/** A follow-up is due when its time has passed and the lead is still open. */
export const isOpen = (l: Lead) => l.stage !== 'won' && l.stage !== 'lost';
export function followUpState(l: Lead, now = Date.now()): 'overdue' | 'today' | 'later' | 'none' {
  if (!isOpen(l) || !l.nextFollowUpAt) return 'none';
  const t = new Date(l.nextFollowUpAt).getTime();
  if (t < now - 60 * 60e3 && new Date(t).toDateString() !== new Date(now).toDateString()) return 'overdue';
  if (new Date(t).toDateString() === new Date(now).toDateString() || t < now) return 'today';
  return 'later';
}

export function pipelineStats(leads: Lead[], now = Date.now()) {
  const by = Object.fromEntries(LEAD_STAGES.map((s) => [s.id, 0])) as Record<LeadStage, number>;
  leads.forEach((l) => (by[l.stage] += 1));
  const closed = by.won + by.lost;
  const src: Record<string, { total: number; won: number }> = {};
  leads.forEach((l) => {
    src[l.source] ??= { total: 0, won: 0 };
    src[l.source].total += 1;
    if (l.stage === 'won') src[l.source].won += 1;
  });
  return {
    by,
    total: leads.length,
    open: leads.filter(isOpen).length,
    due: leads.filter((l) => ['overdue', 'today'].includes(followUpState(l, now))).length,
    overdue: leads.filter((l) => followUpState(l, now) === 'overdue').length,
    /** Joined ÷ closed leads (open leads don't count against you). */
    winRate: closed ? Math.round((by.won / closed) * 100) : 0,
    sources: Object.entries(src).map(([id, v]) => ({ id, label: LEAD_SOURCES.find((s) => s.id === id)?.label ?? id, ...v })).sort((a, b) => b.total - a.total),
  };
}

/** Allowed stage moves. Won/Lost can be re-opened (people come back), but never skip straight from Lost to Won without contact. */
export function canMove(from: LeadStage, to: LeadStage) {
  if (from === to) return false;
  if (from === 'lost' && to === 'won') return false;
  return true;
}

/* ───────────── Messaging: templates, automations, broadcasts ───────────── */
export type Channel = 'email' | 'push' | 'both';
export const TEMPLATE_VARS = ['name', 'course', 'academy', 'date', 'time', 'amount', 'link'] as const;
export type TemplateVars = Partial<Record<(typeof TEMPLATE_VARS)[number], string>>;

/** Fill {{name}}-style variables. Unknown variables are left visible so the tutor spots typos in the preview. */
export function renderTemplate(t: string, v: TemplateVars) {
  return t.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => ((v as Record<string, string>)[k] ?? m));
}
export function unknownVars(t: string) {
  return [...t.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).filter((k) => !(TEMPLATE_VARS as readonly string[]).includes(k));
}

export type Trigger = 'enrolled' | 'class_tomorrow' | 'fee_due' | 'fee_overdue' | 'checkout_abandoned' | 'course_completed' | 'lead_created' | 'inactive_7d' | 'webinar_registered' | 'booking_confirmed';
export const TRIGGERS: { id: Trigger; label: string; sub: string; transactional: boolean }[] = [
  { id: 'enrolled', label: 'Student enrolls', sub: 'Welcome message right after payment', transactional: true },
  { id: 'class_tomorrow', label: 'Live class tomorrow', sub: 'Reminder 24 h before each class', transactional: true },
  { id: 'fee_due', label: 'Instalment due in 3 days', sub: 'EMI students only', transactional: true },
  { id: 'fee_overdue', label: 'Instalment overdue', sub: 'Day after the due date', transactional: true },
  { id: 'checkout_abandoned', label: 'Checkout left unfinished', sub: '1 h after someone leaves the payment page', transactional: false },
  { id: 'course_completed', label: 'Course completed', sub: 'Congratulate + certificate link', transactional: true },
  { id: 'lead_created', label: 'New enquiry', sub: 'Thank the lead, share your number', transactional: true },
  { id: 'inactive_7d', label: 'Inactive for 7 days', sub: 'Nudge learners who stopped watching', transactional: false },
  { id: 'webinar_registered', label: 'Webinar registration', sub: 'Confirmation with the join link', transactional: true },
  { id: 'booking_confirmed', label: '1:1 booking confirmed', sub: 'Slot details + reschedule link', transactional: true },
];

export interface Automation {
  id: string;
  tenantId: string;
  trigger: Trigger;
  channel: Channel;
  subject: string;
  body: string;
  enabled: boolean;
  sent: number;
  updatedAt: string;
}

/** Starter recipes every workspace gets (switched off until the owner turns them on). */
export function defaultAutomations(tenantId: string, now: string): Omit<Automation, 'id'>[] {
  const r = (trigger: Trigger, subject: string, body: string, enabled = false, channel: Channel = 'both') => ({ tenantId, trigger, channel, subject, body, enabled, sent: 0, updatedAt: now });
  return [
    r('enrolled', 'Welcome to {{course}} 🎉', 'Hi {{name}}, you are in! Start your first lesson here: {{link}}. — {{academy}}', true),
    r('class_tomorrow', 'Live class tomorrow at {{time}}', 'Hi {{name}}, reminder: {{course}} live class is on {{date}} at {{time}}. Join: {{link}}', true),
    r('fee_due', 'Instalment of {{amount}} due on {{date}}', 'Hi {{name}}, your next instalment for {{course}} ({{amount}}) is due on {{date}}. Pay here: {{link}}'),
    r('fee_overdue', 'Instalment overdue', 'Hi {{name}}, your instalment of {{amount}} for {{course}} was due on {{date}}. Please pay to keep your access: {{link}}'),
    r('checkout_abandoned', 'Still thinking about {{course}}?', 'Hi {{name}}, your seat in {{course}} is waiting. Questions? Just reply. {{link}}', false, 'email'),
    r('course_completed', 'You finished {{course}}! 🏆', 'Congrats {{name}}! Download your certificate: {{link}}'),
    r('lead_created', 'Thanks for your enquiry', 'Hi {{name}}, thanks for asking about {{course}}. We will call you soon. — {{academy}}', false, 'email'),
    r('inactive_7d', 'We miss you in {{course}}', 'Hi {{name}}, pick up where you left off: {{link}}', false, 'push'),
    r('webinar_registered', 'You are registered: {{course}}', 'Hi {{name}}, see you on {{date}} at {{time}}. Join link: {{link}}', true),
    r('booking_confirmed', 'Your 1:1 session is confirmed', 'Hi {{name}}, your session is on {{date}} at {{time}}. Join: {{link}}', true),
  ];
}

export type Audience = { kind: 'all_students' } | { kind: 'course'; courseId: string } | { kind: 'batch'; batchId: string } | { kind: 'leads'; stage?: LeadStage } | { kind: 'webinar'; webinarId: string };
export interface Broadcast {
  id: string;
  tenantId: string;
  title: string;
  body: string;
  channel: Channel;
  audience: Audience;
  /** Marketing messages skip people who opted out; transactional (class changes, fee) always go. */
  marketing: boolean;
  status: 'scheduled' | 'sent' | 'cancelled';
  scheduledAt: string;
  sentAt?: string;
  recipients: number;
  skippedOptOut: number;
  opens: number;
  createdAt: string;
}

/** One queued message. Real backend: a worker drains this table into the email provider and Expo push. */
export interface OutboxMsg {
  id: string;
  tenantId: string;
  to: { userId?: string; email?: string; name: string };
  channel: 'email' | 'push';
  subject: string;
  body: string;
  source: { kind: 'automation' | 'broadcast'; id: string };
  status: 'queued' | 'sent_test';
  at: string;
}

/** Daily caps protect sender reputation and keep cost predictable (pricing doc: usage add-ons, no "unlimited"). */
export const MSG_LIMITS = { broadcastsPerDay: 5, recipientsPerBroadcast: 5000, bodyMax: 1000, titleMax: 120 };

/* ───────────── EMI / instalments ───────────── */
export interface EmiPlan {
  courseId: string;
  tenantId: string;
  parts: 2 | 3 | 4 | 6;
  everyDays: number;
  /** Extra charge on the EMI total, % of price (0 = no-cost EMI). Shown before checkout. */
  feePct: number;
  /** Access pauses after this many days overdue (never deletes progress). */
  graceDays: number;
  enabled: boolean;
}
export interface Instalment { n: number; amountInr: number; dueAt: string; paidAt?: string; orderId?: string }
export interface EmiContract {
  id: string;
  tenantId: string;
  userId: string;
  courseId: string;
  totalInr: number;
  instalments: Instalment[];
  createdAt: string;
  status: 'active' | 'completed' | 'cancelled';
}

/** Split a price into N parts in whole rupees; the first part absorbs the rounding so the total is exact. */
export function emiSchedule(priceInr: number, plan: Pick<EmiPlan, 'parts' | 'everyDays' | 'feePct'>, start = new Date()): Instalment[] {
  const total = Math.round(priceInr * (1 + plan.feePct / 100));
  const base = Math.floor(total / plan.parts);
  const first = total - base * (plan.parts - 1);
  return Array.from({ length: plan.parts }, (_, i) => ({ n: i + 1, amountInr: i === 0 ? first : base, dueAt: new Date(start.getTime() + i * plan.everyDays * 864e5).toISOString() }));
}
export const EMI_MIN_PRICE = 2000;
export function emiState(c: EmiContract, graceDays: number, now = Date.now()) {
  const next = c.instalments.find((i) => !i.paidAt);
  const paid = c.instalments.filter((i) => i.paidAt).reduce((s, i) => s + i.amountInr, 0);
  if (!next) return { state: 'completed' as const, next: null, paid, due: 0, daysOverdue: 0, accessPaused: false };
  const daysOverdue = Math.max(0, Math.floor((now - new Date(next.dueAt).getTime()) / 864e5));
  const state = daysOverdue > 0 ? ('overdue' as const) : new Date(next.dueAt).getTime() - now < 3 * 864e5 ? ('due_soon' as const) : ('on_track' as const);
  return { state, next, paid, due: c.totalInr - paid, daysOverdue, accessPaused: daysOverdue > graceDays };
}

/* ───────────── Webinars ───────────── */
export interface Webinar {
  id: string;
  tenantId: string;
  title: string;
  description: string;
  startsAt: string;
  durationMin: number;
  priceInr: number;
  capacity: number;
  /** Course to pitch at the end (shown on the replay page). */
  pitchCourseId?: string;
  status: 'draft' | 'published' | 'ended' | 'cancelled';
  registrations: { userId?: string; name: string; email: string; phone?: string; at: string; attended?: boolean; orderId?: string }[];
  replay: boolean;
  createdAt: string;
}
export function webinarState(w: Webinar, now = Date.now()) {
  if (w.status === 'cancelled') return 'cancelled' as const;
  if (w.status === 'draft') return 'draft' as const;
  const s = new Date(w.startsAt).getTime();
  const e = s + w.durationMin * 60e3;
  if (now >= s - 10 * 60e3 && now <= e) return 'live' as const;
  if (now > e || w.status === 'ended') return 'ended' as const;
  return 'upcoming' as const;
}

/* ───────────── 1:1 bookings ───────────── */
export interface BookingOffer {
  id: string;
  tenantId: string;
  title: string;
  durationMin: 15 | 30 | 45 | 60;
  priceInr: number;
  /** Weekly hours, 0 = Sunday. Times are local "HH:MM". */
  weekly: { day: number; from: string; to: string }[];
  bufferMin: number;
  noticeHours: number;
  horizonDays: number;
  active: boolean;
}
export interface Booking {
  id: string;
  tenantId: string;
  offerId: string;
  userId: string;
  name: string;
  startsAt: string;
  endsAt: string;
  status: 'confirmed' | 'cancelled' | 'done';
  orderId?: string;
  createdAt: string;
}

const hm = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
/** Free slots for an offer, honouring weekly hours, buffer, minimum notice and existing bookings. */
export function freeSlots(o: BookingOffer, taken: Pick<Booking, 'startsAt' | 'endsAt' | 'status'>[], now = new Date()) {
  const out: string[] = [];
  const busy = taken.filter((b) => b.status !== 'cancelled').map((b) => [new Date(b.startsAt).getTime(), new Date(b.endsAt).getTime()]);
  const earliest = now.getTime() + o.noticeHours * 3600e3;
  for (let d = 0; d < o.horizonDays; d++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d);
    for (const w of o.weekly.filter((x) => x.day === day.getDay())) {
      for (let m = hm(w.from); m + o.durationMin <= hm(w.to); m += o.durationMin + o.bufferMin) {
        const s = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(m / 60), m % 60).getTime();
        const e = s + o.durationMin * 60e3;
        if (s < earliest) continue;
        if (busy.some(([bs, be]) => s < be + o.bufferMin * 60e3 && e + o.bufferMin * 60e3 > bs)) continue;
        out.push(new Date(s).toISOString());
      }
    }
  }
  return out;
}
export function validWeekly(w: BookingOffer['weekly']) {
  return w.every((x) => /^\d\d:\d\d$/.test(x.from) && /^\d\d:\d\d$/.test(x.to) && hm(x.to) > hm(x.from));
}

/* ───────────── Digital products ───────────── */
export type ProductKind = 'ebook' | 'notes' | 'template' | 'question_bank' | 'recording' | 'other';
export const PRODUCT_KINDS: { id: ProductKind; label: string; icon: string }[] = [
  { id: 'ebook', label: 'eBook', icon: 'book-outline' },
  { id: 'notes', label: 'Notes / PDF', icon: 'document-text-outline' },
  { id: 'template', label: 'Template', icon: 'grid-outline' },
  { id: 'question_bank', label: 'Question bank', icon: 'help-circle-outline' },
  { id: 'recording', label: 'Recording', icon: 'videocam-outline' },
  { id: 'other', label: 'Other file', icon: 'folder-open-outline' },
];
export interface DigitalProduct {
  id: string;
  tenantId: string;
  title: string;
  description: string;
  kind: ProductKind;
  priceInr: number;
  files: { name: string; sizeMb: number }[];
  /** Downloads per buyer; links are signed and short-lived in production. */
  downloadLimit: number;
  status: 'draft' | 'published' | 'archived';
  sales: number;
  createdAt: string;
}
export interface ProductPurchase { id: string; productId: string; tenantId: string; userId: string; orderId: string; downloads: number; at: string }
export const PRODUCT_LIMITS = { files: 10, fileMb: 200, titleMax: 80 };

/* ───────────── Website builder ───────────── */
export type SectionKind = 'hero' | 'courses' | 'about' | 'testimonials' | 'stats' | 'faq' | 'lead_form' | 'webinars' | 'products' | 'bookings' | 'contact';
export const SECTION_META: { kind: SectionKind; label: string; icon: string; pro?: boolean; needs?: Feature }[] = [
  { kind: 'hero', label: 'Hero banner', icon: 'image-outline' },
  { kind: 'courses', label: 'Courses', icon: 'school-outline' },
  { kind: 'about', label: 'About the educator', icon: 'person-outline' },
  { kind: 'stats', label: 'Numbers', icon: 'stats-chart-outline' },
  { kind: 'testimonials', label: 'Student stories', icon: 'chatbox-ellipses-outline', pro: true },
  { kind: 'webinars', label: 'Upcoming webinars', icon: 'easel-outline', needs: 'webinars' },
  { kind: 'products', label: 'Digital products', icon: 'download-outline', needs: 'digital_products' },
  { kind: 'bookings', label: 'Book a 1:1', icon: 'calendar-outline', needs: 'bookings' },
  { kind: 'faq', label: 'FAQ', icon: 'help-buoy-outline', pro: true },
  { kind: 'lead_form', label: 'Enquiry form', icon: 'create-outline', pro: true, needs: 'crm' },
  { kind: 'contact', label: 'Contact', icon: 'call-outline' },
];
export interface SiteSection {
  id: string;
  kind: SectionKind;
  visible: boolean;
  heading?: string;
  text?: string;
  cta?: string;
  items?: { q: string; a: string }[];
}
export interface Site {
  tenantId: string;
  template: 'classic' | 'bold' | 'minimal';
  sections: SiteSection[];
  seo: { title: string; description: string };
  tracking: { ga4?: string; metaPixel?: string };
  contact: { phone?: string; email?: string; whatsapp?: string; address?: string };
  published: boolean;
  updatedAt: string;
}
export function defaultSite(tenantId: string, name: string, now: string): Site {
  const s = (kind: SectionKind, extra: Partial<SiteSection> = {}, visible = true): SiteSection => ({ id: kind, kind, visible, ...extra });
  return {
    tenantId,
    template: 'classic',
    sections: [
      s('hero', { heading: `Learn with ${name}`, text: 'Practical courses, live classes and real projects.', cta: 'Explore courses' }),
      s('courses', { heading: 'Courses' }),
      s('about', { heading: 'About', text: 'Tell students who you are and why they should learn with you.' }),
      s('stats', { heading: 'Our learners' }),
      s('testimonials', { heading: 'What students say' }, false),
      s('webinars', { heading: 'Free & paid webinars' }, false),
      s('products', { heading: 'Notes & eBooks' }, false),
      s('bookings', { heading: 'Book a 1:1 session' }, false),
      s('faq', { heading: 'FAQ', items: [{ q: 'Do I get a certificate?', a: 'Yes, every course with a certificate shows it on the course page.' }] }, false),
      s('lead_form', { heading: 'Not sure which course? Ask us', cta: 'Request a call back' }, false),
      s('contact', { heading: 'Contact' }),
    ],
    seo: { title: `${name} — online courses`, description: `Courses, live classes and notes by ${name}.` },
    tracking: {},
    contact: {},
    published: true,
    updatedAt: now,
  };
}
/** Validation used by both the editor and the real save endpoint. */
export function siteErrors(site: Site, pro: boolean): { field: string; msg: string }[] {
  const e: { field: string; msg: string }[] = [];
  if (site.seo.title.trim().length < 5 || site.seo.title.length > 60) e.push({ field: 'seo.title', msg: 'Page title: 5–60 characters (Google cuts longer titles).' });
  if (site.seo.description.length > 160) e.push({ field: 'seo.description', msg: 'Description: up to 160 characters.' });
  if (site.tracking.ga4 && !/^G-[A-Z0-9]{6,12}$/.test(site.tracking.ga4)) e.push({ field: 'tracking.ga4', msg: 'Google Analytics ID looks like G-XXXXXXXXXX.' });
  if (site.tracking.metaPixel && !/^\d{15,16}$/.test(site.tracking.metaPixel)) e.push({ field: 'tracking.metaPixel', msg: 'Meta Pixel ID is 15–16 digits.' });
  if (!pro && (site.tracking.ga4 || site.tracking.metaPixel)) e.push({ field: 'tracking', msg: 'Analytics & pixel tracking need the Growth plan.' });
  if (!pro && site.sections.some((s) => s.visible && SECTION_META.find((m) => m.kind === s.kind)?.pro)) e.push({ field: 'sections', msg: 'Testimonials, FAQ and the enquiry form need the Growth plan.' });
  if (!site.sections.some((s) => s.kind === 'hero' && s.visible)) e.push({ field: 'sections', msg: 'Keep the hero banner visible — it is the first thing visitors see.' });
  if (site.contact.phone && !normPhone(site.contact.phone)) e.push({ field: 'contact.phone', msg: 'Enter a valid 10-digit mobile number.' });
  if (site.contact.email && !validEmail(site.contact.email)) e.push({ field: 'contact.email', msg: 'Enter a valid email.' });
  return e;
}

/* ───────────── Community ───────────── */
export interface Channel_ {
  id: string;
  tenantId: string;
  name: string;
  /** Who can read: everyone enrolled in any course of the workspace, or one course only. */
  courseId?: string;
  /** Announcement channels: only owner/tutors post, students react and reply. */
  announce: boolean;
  createdAt: string;
}
export const REACTION_SET = ['👍', '❤️', '🎉', '🙏', '💡'] as const;
export interface Post {
  id: string;
  tenantId: string;
  channelId: string;
  authorId: string;
  authorName: string;
  authorRole: 'owner' | 'tutor' | 'student';
  text: string;
  parentId?: string;
  pinned?: boolean;
  hidden?: boolean;
  reactions: Record<string, string[]>;
  reports: string[];
  at: string;
}
export const COMMUNITY_LIMITS = { postMax: 2000, postsPerMinute: 5, channels: 20, reportsToHide: 3 };
/** Light link/phone spam guard for student posts (owners can still share links). */
export function spamReason(text: string, role: Post['authorRole']) {
  if (role !== 'student') return null;
  if ((text.match(/https?:\/\//g) ?? []).length > 1) return 'Only one link per post, please.';
  if (/(\d[\s-]?){10,}/.test(text)) return 'Please don’t post phone numbers in the community. Message the academy instead.';
  return null;
}

/* ───────────── Storage shape (real: one table per key, all with tenant_id + RLS) ───────────── */
export interface Sale { id: string; tenantId: string; userId: string; kind: 'webinar' | 'booking' | 'product'; refId: string; title: string; amountInr: number; invoiceNo: string; method: string; at: string }
export interface GrowthDb {
  v: 1;
  leads: Lead[];
  automations: Automation[];
  broadcasts: Broadcast[];
  outbox: OutboxMsg[];
  emiPlans: EmiPlan[];
  emiContracts: EmiContract[];
  webinars: Webinar[];
  offers: BookingOffer[];
  bookings: Booking[];
  products: DigitalProduct[];
  purchases: ProductPurchase[];
  sites: Site[];
  channels: Channel_[];
  posts: Post[];
  sales: Sale[];
  seededTenants: string[];
}
