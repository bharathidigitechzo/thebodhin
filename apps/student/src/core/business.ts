/**
 * Bodhin commercial rules — payment routing, payouts, plan entitlements, usage.
 * Pure TypeScript (no React). Every number here is a DEFAULT that Super Admin can change
 * (PlatformConfig); screens and the backend must read the live config, never these literals.
 */
import { PLANS, usageLevel, type PlanId, type UsageLevel } from './plans';

/* ─────────────── Platform config (Super Admin editable) ─────────────── */

export interface PlatformConfig {
  commissionRate: number; // share Bodhin keeps on marketplace sales (0.2 = 20%)
  attributionDays: number; // proposed qualifying referral window
  gatewayFeeRate: number; // payment gateway fee on Bodhin-collected sales, passed to the payout statement
  refundHoldDays: number; // payout released only after the refund window
  payoutWeekday: number; // 1 = Monday
  trialDays: number; // free trial for new workspaces
  trialPlan: PlanId;
  bodhinTenantId: string; // the tenant that owns Bodhin's own courses
  liveInteractiveSeats: number; // interactive seats per live class; overflow watches the broadcast (live/scale.ts)
  recordingRetentionDays: number; // how long class recordings stay viewable (0 = forever); learners stream only
}

export const DEFAULT_PLATFORM_CONFIG: PlatformConfig = {
  commissionRate: 0.2,
  attributionDays: 30,
  liveInteractiveSeats: 1000,
  recordingRetentionDays: 180,
  gatewayFeeRate: 0.02,
  refundHoldDays: 7,
  payoutWeekday: 1,
  trialDays: 14,
  trialPlan: 'growth',
  bodhinTenantId: 't_bodhin',
};

/* ─────────────── Payment routing: who collects the money ─────────────── */

/**
 * The three sales channels agreed with the client:
 *  bodhin_own         Bodhin's own course                         → Bodhin collects, keeps 100%
 *  tutor_direct       sold on the tutor's subdomain / custom domain / private link / manual enroll
 *                                                                → tutor's own gateway collects, Bodhin 0%
 *  bodhin_marketplace tutor's course bought on thebodhin.com     → Bodhin collects, pays tutor minus commission
 * Rule: whoever hosts the checkout page collects the payment.
 */
export type SalesChannel = 'bodhin_own' | 'tutor_direct' | 'bodhin_marketplace';

export interface PaymentRoute {
  channel: SalesChannel;
  collector: 'bodhin' | 'educator';
  sellerTenantId: string;
  commissionRate: number;
}

export function paymentRoute(courseTenantId: string, checkoutTenantId: string | null, cfg: PlatformConfig = DEFAULT_PLATFORM_CONFIG): PaymentRoute {
  if (courseTenantId === cfg.bodhinTenantId) return { channel: 'bodhin_own', collector: 'bodhin', sellerTenantId: courseTenantId, commissionRate: 1 };
  if (checkoutTenantId === courseTenantId) return { channel: 'tutor_direct', collector: 'educator', sellerTenantId: courseTenantId, commissionRate: 0 };
  return { channel: 'bodhin_marketplace', collector: 'bodhin', sellerTenantId: courseTenantId, commissionRate: cfg.commissionRate };
}

/** Money split for one paid order (all INR, GST-inclusive gross). */
export function splitOrder(gross: number, route: PaymentRoute, cfg: PlatformConfig = DEFAULT_PLATFORM_CONFIG) {
  if (route.channel === 'bodhin_own') return { gross, commission: gross, gatewayFee: 0, educatorNet: 0, bodhinRevenue: gross };
  if (route.channel === 'tutor_direct') return { gross, commission: 0, gatewayFee: 0, educatorNet: gross, bodhinRevenue: 0 }; // tutor's own gateway charges them directly
  const commission = Math.round(gross * route.commissionRate);
  const gatewayFee = Math.round(gross * cfg.gatewayFeeRate);
  return { gross, commission, gatewayFee, educatorNet: gross - commission - gatewayFee, bodhinRevenue: commission };
}

/** When a marketplace sale becomes payable: after the refund hold, on the next payout weekday. */
export function payoutDateFor(paidAt: string, cfg: PlatformConfig = DEFAULT_PLATFORM_CONFIG) {
  const d = new Date(paidAt);
  d.setDate(d.getDate() + cfg.refundHoldDays);
  while (d.getDay() !== cfg.payoutWeekday) d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return d.toISOString();
}

export const CHANNEL_LABEL: Record<SalesChannel, string> = {
  bodhin_own: 'Bodhin course',
  tutor_direct: 'Direct sale',
  bodhin_marketplace: 'Bodhin marketplace',
};

/* ─────────────── Plan entitlements (feature gating) ─────────────── */

export type Feature =
  | 'courses'
  | 'recorded_video'
  | 'live_classes'
  | 'assessments'
  | 'certificates'
  | 'batches'
  | 'multi_tutor'
  | 'marketplace'
  | 'coupons'
  | 'advanced_reports'
  | 'custom_domain'
  | 'white_label'
  // Growth tools (Nrich/Graphy parity round 1)
  | 'digital_products'
  | 'bookings'
  | 'website'
  | 'webinars'
  | 'community'
  | 'broadcast'
  | 'crm'
  | 'automations'
  | 'emi'
  | 'website_pro'
  // Round 2
  | 'bundles'
  | 'certificate_designer'
  | 'affiliates'
  | 'analytics_pro'
  | 'multi_currency'
  | 'embed';

/** Default feature map per plan (from the plan positioning in the pricing proposal). Super Admin can override per plan or tenant. */
export const PLAN_FEATURES: Record<PlanId, Feature[]> = {
  starter: ['courses', 'recorded_video', 'live_classes', 'assessments', 'certificates', 'marketplace', 'digital_products', 'bookings', 'website'],
  creator: ['courses', 'recorded_video', 'live_classes', 'assessments', 'certificates', 'marketplace', 'batches', 'coupons', 'digital_products', 'bookings', 'website', 'webinars', 'community', 'broadcast', 'bundles', 'certificate_designer'],
  growth: ['courses', 'recorded_video', 'live_classes', 'assessments', 'certificates', 'marketplace', 'batches', 'coupons', 'multi_tutor', 'advanced_reports', 'digital_products', 'bookings', 'website', 'webinars', 'community', 'broadcast', 'crm', 'automations', 'emi', 'website_pro', 'bundles', 'certificate_designer', 'affiliates'],
  institute: ['courses', 'recorded_video', 'live_classes', 'assessments', 'certificates', 'marketplace', 'batches', 'coupons', 'multi_tutor', 'advanced_reports', 'custom_domain', 'white_label', 'digital_products', 'bookings', 'website', 'webinars', 'community', 'broadcast', 'crm', 'automations', 'emi', 'website_pro', 'bundles', 'certificate_designer', 'affiliates', 'analytics_pro', 'multi_currency', 'embed'],
  enterprise: ['courses', 'recorded_video', 'live_classes', 'assessments', 'certificates', 'marketplace', 'batches', 'coupons', 'multi_tutor', 'advanced_reports', 'custom_domain', 'white_label', 'digital_products', 'bookings', 'website', 'webinars', 'community', 'broadcast', 'crm', 'automations', 'emi', 'website_pro', 'bundles', 'certificate_designer', 'affiliates', 'analytics_pro', 'multi_currency', 'embed'],
};

export interface TenantSubscription {
  plan: PlanId;
  status: 'trialing' | 'active' | 'past_due' | 'cancelled';
  billing: 'monthly' | 'annual';
  periodEnd: string;
  pending?: { plan: PlanId; billing: 'monthly' | 'annual'; at: string } | null; // downgrade scheduled for period end
  /** Old price kept after a price rise (notice period). Applies only while on `plan`; the lower of lock and catalogue wins. */
  priceLock?: { plan?: PlanId; monthlyInr: number | null; annualInr: number | null; until: string } | null;
  addons: { kind: 'students' | 'storage' | 'live_hours' | 'seats' | 'custom_domain'; qty: number }[];
  /** Super Admin overrides (feature on/off, limit changes) — applied on top of the plan. */
  overrides?: { features?: Partial<Record<Feature, boolean>>; limits?: Partial<Limits> };
}

/** Optional modules an owner can switch off (blueprint: "Enable pre-built modules"). Courses and video are always on. */
export const MODULES: { key: Feature; label: string; sub: string }[] = [
  { key: 'live_classes', label: 'Live classes', sub: 'Schedule and host live classes' },
  { key: 'batches', label: 'Batches & timetable', sub: 'Cohorts, weekly slots, attendance' },
  { key: 'assessments', label: 'Quizzes & assignments', sub: 'Tests, grading, results' },
  { key: 'certificates', label: 'Certificates', sub: 'Auto-issued on completion, verifiable' },
  { key: 'coupons', label: 'Coupons', sub: 'Discount codes at checkout' },
  { key: 'marketplace', label: 'Bodhin marketplace', sub: 'List courses on thebodhin.com' },
  { key: 'community', label: 'Community', sub: 'Channels for your learners' },
  { key: 'webinars', label: 'Webinars', sub: 'Free / paid webinars with registration' },
  { key: 'bookings', label: '1:1 bookings', sub: 'Paid mentoring slots' },
  { key: 'digital_products', label: 'Digital products', sub: 'Notes, PDFs, templates' },
  { key: 'website', label: 'Website', sub: 'Your academy website' },
  { key: 'broadcast', label: 'Broadcasts', sub: 'Email and push to learners' },
  { key: 'crm', label: 'Leads CRM', sub: 'Enquiries and follow-ups' },
  { key: 'automations', label: 'Automations', sub: 'Welcome, reminders, nudges' },
  { key: 'emi', label: 'EMI & fee collection', sub: 'Instalments and invoices' },
  { key: 'bundles', label: 'Bundles & add-ons', sub: 'Combo prices, checkout add-on' },
  { key: 'affiliates', label: 'Affiliate program', sub: 'Learners earn for referrals' },
];

/** Days a paid workspace keeps working after a failed renewal (banner shown), before it locks. */
export const RENEWAL_GRACE_DAYS = 7;

export type GateState = 'trial' | 'active' | 'grace' | 'trial_ended' | 'locked';
export interface SubGate {
  state: GateState;
  locked: boolean;
  /** Days until the trial ends / the grace period ends (null when not counting down). */
  daysLeft: number | null;
  title: string;
  message: string;
}

/**
 * Can this workspace be used right now? Pure: `now` is passed in so the same rule runs in tests, the app and the
 * nightly server job. Nothing is ever deleted by a lock; enrolled learners keep what they bought.
 */
export function subGate(sub: TenantSubscription | null | undefined, now = Date.now()): SubGate {
  if (!sub) return { state: 'active', locked: false, daysLeft: null, title: 'Active', message: '' };
  const end = new Date(sub.periodEnd).getTime();
  const left = Math.ceil((end - now) / 864e5);
  const ended = now >= end;
  const dateText = new Date(end).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const keep = 'Your courses, students and videos are safe. Learners keep access to what they bought.';
  if (sub.status === 'trialing') {
    if (!ended) return { state: 'trial', locked: false, daysLeft: Math.max(0, left), title: `Free trial · ${Math.max(0, left)} day${left === 1 ? '' : 's'} left`, message: sub.pending ? 'Your chosen plan starts automatically when the trial ends.' : 'Choose a plan before the trial ends to keep teaching without a break.' };
    return { state: 'trial_ended', locked: true, daysLeft: 0, title: 'Your free trial has ended', message: `The trial ended on ${dateText}. Choose a plan to keep teaching. ${keep}` };
  }
  if (sub.status === 'cancelled') {
    if (!ended) return { state: 'active', locked: false, daysLeft: Math.max(0, left), title: `Cancelled · works until ${dateText}`, message: 'Your plan stays active until the end of the paid period.' };
    return { state: 'locked', locked: true, daysLeft: 0, title: 'Your plan has ended', message: `It ended on ${dateText}. Choose a plan to start teaching again. ${keep}` };
  }
  if (sub.status === 'past_due' || (sub.status === 'active' && ended)) {
    const graceEnd = end + RENEWAL_GRACE_DAYS * 864e5;
    const g = Math.ceil((graceEnd - now) / 864e5);
    if (now < graceEnd) return { state: 'grace', locked: false, daysLeft: Math.max(0, g), title: `Payment due · ${Math.max(0, g)} day${g === 1 ? '' : 's'} to pay`, message: 'Your renewal payment didn’t go through. Update your payment to avoid a pause.' };
    return { state: 'locked', locked: true, daysLeft: 0, title: 'Workspace paused: payment overdue', message: `Renewal was due on ${dateText}. Pay to unlock. ${keep}` };
  }
  return { state: 'active', locked: false, daysLeft: null, title: 'Active', message: '' };
}

export interface Limits {
  activeStudents: number | null;
  storageGb: number | null;
  liveHours: number | null;
  tutorSeats: number | null;
}

export const ADDON_SIZES = { students: 250, storage: 25, live_hours: 20, seats: 5 } as const;

/** Monthly add-on prices (₹, GST extra) — launch hypothesis, Super Admin editable. */
export const ADDON_CATALOG: { kind: 'students' | 'storage' | 'live_hours' | 'seats' | 'custom_domain'; label: string; unit: string; monthlyInr: number; icon: string }[] = [
  { kind: 'students', label: 'Student block', unit: '+250 active students', monthlyInr: 999, icon: 'people' },
  { kind: 'storage', label: 'Video storage', unit: '+25 GB', monthlyInr: 499, icon: 'server' },
  { kind: 'live_hours', label: 'Live room-hours', unit: '+20 hours / month', monthlyInr: 699, icon: 'radio' },
  { kind: 'seats', label: 'Tutor seats', unit: '+5 seats', monthlyInr: 1499, icon: 'person-add' },
  { kind: 'custom_domain', label: 'Custom domain', unit: 'your own domain + SSL', monthlyInr: 499, icon: 'globe' },
];

/** Which usage would exceed a plan's limits (blocks a downgrade until reduced). Add-ons the tenant keeps count toward the new plan. */
export function planBlockers(usage: UsageSnapshot, plan: PlanId, addons: TenantSubscription['addons'] = []) {
  const { limits } = entitlements({ plan, status: 'active', billing: 'monthly', periodEnd: '', addons });
  const checks: [string, number, number | null][] = [
    ['active students', usage.activeStudents, limits.activeStudents],
    ['GB of video', usage.storageGb, limits.storageGb],
    ['tutor seats', usage.tutorSeats, limits.tutorSeats],
  ];
  return checks.filter(([, used, limit]) => limit != null && used > limit).map(([l, used, limit]) => `${used} ${l} (plan allows ${limit})`);
}

export function entitlements(sub: TenantSubscription) {
  const plan = PLANS.find((p) => p.id === sub.plan)!;
  const add = (k: keyof typeof ADDON_SIZES) => sub.addons.filter((a) => a.kind === k).reduce((s, a) => s + a.qty * ADDON_SIZES[k], 0);
  const base: Limits = {
    activeStudents: plan.activeStudents == null ? null : plan.activeStudents + add('students'),
    storageGb: plan.videoStorageGb == null ? null : plan.videoStorageGb + add('storage'),
    liveHours: plan.liveRoomHoursPerMonth == null ? null : plan.liveRoomHoursPerMonth + add('live_hours'),
    tutorSeats: plan.tutorSeats == null ? null : plan.tutorSeats + add('seats'),
  };
  const limits = { ...base, ...(sub.overrides?.limits ?? {}) };
  const features = new Set<Feature>(PLAN_FEATURES[sub.plan]);
  if (sub.addons.some((a) => a.kind === 'custom_domain')) features.add('custom_domain');
  Object.entries(sub.overrides?.features ?? {}).forEach(([f, on]) => (on ? features.add(f as Feature) : features.delete(f as Feature)));
  return { plan, limits, has: (f: Feature) => features.has(f), features: [...features] };
}

export interface UsageSnapshot {
  activeStudents: number;
  storageGb: number;
  liveHours: number;
  tutorSeats: number;
}

export const USAGE_META: { key: keyof UsageSnapshot; limit: keyof Limits; label: string; unit: string; icon: string; atLimit: string }[] = [
  { key: 'activeStudents', limit: 'activeStudents', label: 'Active students', unit: '', icon: 'people', atLimit: 'New enrolments are paused until you upgrade or add a student block. Existing students keep full access.' },
  { key: 'storageGb', limit: 'storageGb', label: 'Video storage', unit: 'GB', icon: 'server', atLimit: 'New uploads are paused. Nothing is deleted; existing videos keep playing.' },
  { key: 'liveHours', limit: 'liveHours', label: 'Live room-hours', unit: 'h', icon: 'radio', atLimit: 'New live classes can’t be scheduled this month. Classes already running are never cut off.' },
  { key: 'tutorSeats', limit: 'tutorSeats', label: 'Tutor seats', unit: '', icon: 'person-add', atLimit: 'You can’t invite more tutors until you add seats.' },
];

/** Usage with the 70 / 85 / 100% policy applied. */
export function usageReport(usage: UsageSnapshot, sub: TenantSubscription) {
  const { limits } = entitlements(sub);
  const rows = USAGE_META.map((m) => {
    const used = usage[m.key];
    const limit = limits[m.limit];
    const level: UsageLevel = usageLevel(used, limit);
    return { ...m, used, limit, pct: limit ? Math.min(100, Math.round((used / limit) * 100)) : 0, level };
  });
  const order: UsageLevel[] = ['limit', 'critical', 'warn', 'ok'];
  const worst = rows.slice().sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level))[0];
  return { rows, worst: worst.level === 'ok' ? null : worst };
}

export const daysLeft = (iso: string, now = Date.now()) => Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 864e5));
