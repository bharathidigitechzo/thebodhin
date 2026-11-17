/**
 * Round 2 growth rules (pure): bundles, upsells, affiliates, certificate templates, analytics, international pricing, embed.
 * Same pattern as core/growth.ts — no storage, shared by the API, the tests and (later) the server.
 */

/* ───────────── Bundles ───────────── */
export interface Bundle {
  id: string;
  tenantId: string;
  title: string;
  courseIds: string[];
  priceInr: number;
  status: 'draft' | 'published' | 'archived';
  sales: number;
  createdAt: string;
}
export const BUNDLE_LIMITS = { minCourses: 2, maxCourses: 10, maxDiscountPct: 80 };
/** Split a bundle price across its courses in proportion to list price (whole rupees, exact total). Used for per-course orders and commission. */
export function bundleSplit(priceInr: number, courses: { id: string; priceInr: number }[]) {
  const list = courses.reduce((s, c) => s + c.priceInr, 0);
  const parts = courses.map((c) => ({ courseId: c.id, amountInr: list ? Math.floor((priceInr * c.priceInr) / list) : 0 }));
  const diff = priceInr - parts.reduce((s, p) => s + p.amountInr, 0);
  if (parts.length) parts[0].amountInr += diff;
  return parts;
}
export function bundleSavings(priceInr: number, listInr: number) {
  return { saveInr: Math.max(0, listInr - priceInr), pct: listInr ? Math.round(((listInr - priceInr) / listInr) * 100) : 0 };
}

/* ───────────── Upsell (order bump at checkout) ───────────── */
export interface Upsell {
  courseId: string; // shown on this course's checkout
  tenantId: string;
  offerCourseId: string;
  discountPct: number; // 5–50
  headline: string;
  enabled: boolean;
  shown: number;
  taken: number;
}
export const upsellPrice = (priceInr: number, pct: number) => Math.round(priceInr * (1 - pct / 100));

/* ───────────── Affiliates ───────────── */
export interface AffiliateProgram {
  tenantId: string;
  enabled: boolean;
  commissionPct: number; // 5–40, of the amount the academy receives directly
  windowDays: number; // attribution window
  /** Who can join: any learner of the academy, or only people the owner approves. */
  open: boolean;
  terms: string;
}
export interface Affiliate {
  id: string;
  tenantId: string;
  userId: string;
  name: string;
  code: string;
  status: 'pending' | 'active' | 'blocked';
  clicks: number;
  joinedAt: string;
}
export interface AffiliateClick { code: string; tenantId: string; visitorId: string; at: string }
export interface Commission {
  id: string;
  tenantId: string;
  affiliateId: string;
  orderId: string;
  courseId: string;
  buyerName: string;
  orderInr: number;
  amountInr: number;
  status: 'pending' | 'approved' | 'paid' | 'reversed';
  /** Held through the refund window before it can be approved. */
  payableAt: string;
  at: string;
}
export const AFFILIATE_LIMITS = { minPct: 5, maxPct: 40, minPayoutInr: 500 };
export const affiliateCode = (name: string, salt: string) => `${name.replace(/[^a-z]/gi, '').slice(0, 6).toUpperCase() || 'REF'}${salt.replace(/[^a-z0-9]/gi, '').slice(-4).toUpperCase()}`;
/** Last click inside the window wins; never on marketplace orders (Bodhin's 20% already applies) and never on your own purchase. */
export function attribute(clicks: AffiliateClick[], visitorId: string, tenantId: string, windowDays: number, now = Date.now()) {
  const c = clicks.filter((x) => x.visitorId === visitorId && x.tenantId === tenantId && now - new Date(x.at).getTime() <= windowDays * 864e5).sort((a, b) => b.at.localeCompare(a.at))[0];
  return c?.code ?? null;
}

/* ───────────── Certificate designer ───────────── */
export interface CertTemplate {
  tenantId: string;
  layout: 'classic' | 'modern' | 'minimal';
  title: string; // "Certificate of Completion"
  line: string; // "has successfully completed"
  signName: string;
  signTitle: string;
  showLogo: boolean;
  showQr: boolean;
  accent?: string;
  /** Uploaded background design (id from certificate management; the image itself is resolved by the API). */
  bgId?: string;
  /** Resolved background image for rendering (filled by the API, never stored). */
  bg?: string;
  updatedAt: string;
}
export const defaultCert = (tenantId: string, signName: string, now: string): CertTemplate => ({ tenantId, layout: 'classic', title: 'Certificate of Completion', line: 'has successfully completed', signName, signTitle: 'Founder & Lead Educator', showLogo: true, showQr: true, updatedAt: now });
export function certErrors(t: CertTemplate) {
  const e: { field: string; msg: string }[] = [];
  if (t.title.trim().length < 5 || t.title.length > 40) e.push({ field: 'title', msg: 'Title: 5–40 characters.' });
  if (t.line.length > 60) e.push({ field: 'line', msg: 'Line: up to 60 characters.' });
  if (t.signName.trim().length < 2 || t.signName.length > 40) e.push({ field: 'signName', msg: 'Signer name: 2–40 characters.' });
  if (t.signTitle.length > 40) e.push({ field: 'signTitle', msg: 'Signer title: up to 40 characters.' });
  if (t.accent && !/^#[0-9a-f]{6}$/i.test(t.accent)) e.push({ field: 'accent', msg: 'Colour like #0B3B73.' });
  return e;
}
/** Public verify URL printed on the certificate (the QR encodes this). */
export const verifyUrl = (certId: string) => `https://thebodhin.com/cert/${encodeURIComponent(certId)}`;

/* ───────────── Analytics ───────────── */
export type EventKind = 'course_view' | 'checkout_start' | 'paid' | 'site_view';
export interface AEvent { tenantId: string; kind: EventKind; courseId?: string; visitorId: string; country: string; at: string }
export function funnel(ev: AEvent[]) {
  const uniq = (k: EventKind) => new Set(ev.filter((e) => e.kind === k).map((e) => `${e.visitorId}:${e.courseId ?? ''}`)).size;
  const v = uniq('course_view'), c = uniq('checkout_start'), p = uniq('paid');
  return { views: v, checkouts: c, paid: p, viewToCheckout: v ? Math.round((c / v) * 100) : 0, checkoutToPaid: c ? Math.round((p / c) * 100) : 0, overall: v ? Math.round((p / v) * 1000) / 10 : 0 };
}
/** Country from an E.164 phone (good enough for the dashboard; real: billing country). */
export function countryOfPhone(phone?: string) {
  const p = (phone ?? '').replace(/\s/g, '');
  const map: [string, string][] = [['+91', 'India'], ['+971', 'UAE'], ['+966', 'Saudi Arabia'], ['+974', 'Qatar'], ['+65', 'Singapore'], ['+60', 'Malaysia'], ['+94', 'Sri Lanka'], ['+44', 'United Kingdom'], ['+61', 'Australia'], ['+1', 'USA / Canada']];
  return map.find(([k]) => p.startsWith(k))?.[1] ?? (p ? 'Other' : 'Unknown');
}
/** Daily buckets for the last N days (oldest first). */
export function daily(values: { at: string; v: number }[], days: number, now = new Date()) {
  const out = Array.from({ length: days }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1 - i)); return { day: d.toISOString().slice(0, 10), label: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), v: 0 }; });
  for (const x of values) { const k = new Date(x.at); const key = new Date(k.getFullYear(), k.getMonth(), k.getDate()).toISOString().slice(0, 10); const b = out.find((o) => o.day === key); if (b) b.v += x.v; }
  return out;
}

/* ───────────── International pricing ───────────── */
export type Currency = 'INR' | 'USD' | 'AED' | 'GBP' | 'EUR';
export const CURRENCIES: { id: Currency; symbol: string; label: string }[] = [
  { id: 'INR', symbol: '₹', label: 'Indian Rupee' },
  { id: 'USD', symbol: '$', label: 'US Dollar' },
  { id: 'AED', symbol: 'AED ', label: 'UAE Dirham' },
  { id: 'GBP', symbol: '£', label: 'British Pound' },
  { id: 'EUR', symbol: '€', label: 'Euro' },
];
/** Reference rates (₹ per unit) used only to show the INR equivalent in statements. Real: rate locked by the gateway at payment. */
export const REF_RATE: Record<Currency, number> = { INR: 1, USD: 84, AED: 22.9, GBP: 107, EUR: 91 };
export interface IntlPrice { courseId: string; tenantId: string; prices: Partial<Record<Exclude<Currency, 'INR'>, number>> }
export const fmtMoney = (cur: Currency, n: number) => `${CURRENCIES.find((c) => c.id === cur)!.symbol}${cur === 'INR' ? Math.round(n).toLocaleString('en-IN') : n.toFixed(n % 1 ? 2 : 0)}`;
export function intlErrors(p: IntlPrice['prices']) {
  for (const [k, v] of Object.entries(p)) if (v != null && (v < 1 || v > 5000)) return `${k} price must be between 1 and 5,000.`;
  return null;
}

/* ───────────── Embed ───────────── */
export function embedSnippets(host: string, slug: string, courseId?: string) {
  const q = courseId ? `?course=${courseId}` : '';
  return {
    script: `<div data-bodhin-academy="${slug}"${courseId ? ` data-bodhin-course="${courseId}"` : ''}></div>\n<script async src="https://embed.thebodhin.com/v1.js"></script>`,
    iframe: `<iframe src="https://${host}/embed/${slug}${q}" width="100%" height="520" style="border:0;border-radius:16px" loading="lazy" title="Courses"></iframe>`,
    wordpress: `[bodhin academy="${slug}"${courseId ? ` course="${courseId}"` : ''}]`,
    button: `<a href="https://${host}/course/${courseId ?? ''}?ref=embed" style="background:#0B3B73;color:#fff;padding:12px 20px;border-radius:12px;text-decoration:none">Enrol now</a>`,
  };
}

/* ───────────── Showcase videos (public marketing pages) ───────────── */
/** A free video the educator allows Bodhin to show on its public pages. Only for courses on "Listing + promotion". */
export interface ShowClip {
  id: string;
  tenantId: string;
  courseId: string;
  /** Set when the clip is an existing lesson opened up as a free sample; empty for a separate promo video. */
  lessonId?: string;
  title: string;
  durationSec: number;
  active: boolean;
  /** Removed from Bodhin's pages by Bodhin staff (audited, educator notified). */
  blocked?: boolean;
  blockReason?: string;
  plays: number;
  createdAt: string;
}
export const SHOWCASE_LIMITS = { perCourse: 8, titleMin: 5, titleMax: 70, minSec: 20, maxSec: 20 * 60 };
export const clipLength = (sec: number) => (sec < 60 ? `${sec} sec` : `${Math.round(sec / 60)} min`);

/* ───────────── Storage shape ───────────── */
export interface R2Db {
  v: 1;
  bundles: Bundle[];
  upsells: Upsell[];
  programs: AffiliateProgram[];
  affiliates: Affiliate[];
  clicks: AffiliateClick[];
  commissions: Commission[];
  certTemplates: CertTemplate[];
  events: AEvent[];
  intl: IntlPrice[];
  intlGateway: Record<string, 'not_connected' | 'active'>;
  clips?: ShowClip[];
  clipsSeeded?: boolean;
  seeded: string[];
}
