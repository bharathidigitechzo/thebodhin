/**
 * Round 2 growth API: bundles, upsells, affiliates, certificate designer, analytics, international pricing, embed.
 * Same contract as api/client.ts — screens call only these; live, each body becomes a Supabase call.
 */
import { db, persist, uid } from './mockDb';
import { categories as seedCategories, courses as seedCourses, tutors as seedTutors } from './catalogSeed';
import { onMarketplace, allLessons, isPublished } from '@/core/catalog';
import { PLANS } from '@/core/plans';
import { PLAN_FEATURES, splitOrder } from '@/core/business';
import { FEATURE_LABEL } from './client';
import { ApiError, adminGuard, afterPaidHooks, audit, certificates, commerce, educator, learning, notifyUser } from './client';
import { __growthTest, siteApi } from './growth';
import type { Feature } from '@/core/business';
import type { Order, PaymentMethod } from '@/core/catalog';
import {
  AFFILIATE_LIMITS, BUNDLE_LIMITS, CURRENCIES, REF_RATE, affiliateCode, attribute, bundleSavings, bundleSplit, certErrors, countryOfPhone, daily, defaultCert, embedSnippets, funnel, intlErrors, upsellPrice, verifyUrl,
  SHOWCASE_LIMITS, type ShowClip,
  type AEvent, type Affiliate, type Bundle, type CertTemplate, type Currency, type EventKind, type IntlPrice, type R2Db, type Upsell,
} from '@/core/growth2';

const now = () => new Date().toISOString();
const ago = (d: number, h = 0) => new Date(Date.now() - d * 864e5 - h * 3600e3).toISOString();
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const tenantById = (id: string) => db.tenants.find((t) => t.id === id);
const courseOf = (id: string) => seedCourses.find((c) => c.id === id);
const userName = (id: string) => db.users.find((u) => u.id === id)?.name ?? 'Learner';
const tenantHas = (tenantId: string, f: Feature) => { const o = tenantById(tenantId)?.ownerUserId; return !!(o && educator.context(o)?.ent.has(f)); };
const NEED: Partial<Record<Feature, string>> = { bundles: 'Bundles need the Creator plan', certificate_designer: 'The certificate designer needs the Creator plan', affiliates: 'The affiliate program needs the Growth plan', analytics_pro: 'Advanced analytics need the Institute plan', multi_currency: 'International pricing needs the Institute plan', embed: 'The embed widget needs the Institute plan' };
function ctxOf(userId: string, f?: Feature, ownerOnly = false) {
  const ctx = educator.context(userId);
  if (!ctx) throw new ApiError('forbidden', 'Only educators can use this.');
  if (ctx.locked) throw new ApiError('locked', `${ctx.gate.title}. ${ctx.gate.message}`);
  if (ownerOnly && ctx.role !== 'owner') throw new ApiError('forbidden', 'Only the workspace owner can see or change this.');
  if (f && !ctx.ent.has(f)) throw new ApiError('plan', `${NEED[f]} — upgrade in Subscription & usage.`);
  return ctx;
}

/* ───────────── store + seed ───────────── */
function r(): R2Db {
  db.r2 ??= { v: 1, bundles: [], upsells: [], programs: [], affiliates: [], clicks: [], commissions: [], certTemplates: [], events: [], intl: [], intlGateway: {}, seeded: [] };
  const R = db.r2;
  let changed = false;
  for (const t of db.tenants) if (!R.seeded.includes(t.id)) { seed(R, t.id); changed = true; }
  if (changed) persist();
  return R;
}
function seed(R: R2Db, tenantId: string) {
  R.seeded.push(tenantId);
  const owner = tenantById(tenantId)?.ownerUserId;
  R.certTemplates.push(defaultCert(tenantId, owner ? userName(owner) : 'Academy', now()));
  R.programs.push({ tenantId, enabled: false, commissionPct: 10, windowDays: 30, open: true, terms: 'Share your link with friends. You earn when they join a course within 30 days. Paid monthly after the refund window.' });
  if (tenantId !== 't_rajesh') return;
  R.bundles.push({ id: 'bd_growth_pack', tenantId, title: 'Digital Growth Pack (SEO + Meta Ads)', courseIds: ['c_seo_growth', 'c_meta_ads'], priceInr: 11999, status: 'published', sales: 14, createdAt: ago(20) });
  R.upsells.push({ courseId: 'c_seo_growth', tenantId, offerCourseId: 'c_ga4', discountPct: 30, headline: 'Track your SEO results — add Google Analytics 4', enabled: true, shown: 120, taken: 18 });
  R.programs[R.programs.length - 1] = { ...R.programs[R.programs.length - 1], enabled: true, commissionPct: 15 };
  R.affiliates.push({ id: 'af_karthik', tenantId, userId: 'u_karthik_demo', name: 'Karthik M', code: 'KARTHI7Q2X', status: 'active', clicks: 46, joinedAt: ago(25) });
  R.commissions.push({ id: uid('cm'), tenantId, affiliateId: 'af_karthik', orderId: 'ord_seed_aff', courseId: 'c_seo_growth', buyerName: 'Sathya M', orderInr: 8999, amountInr: 1350, status: 'approved', payableAt: ago(2), at: ago(12) });
  R.intl.push({ courseId: 'c_dm_ai', tenantId, prices: { USD: 199, AED: 729, GBP: 159 } });
  R.intlGateway[tenantId] = 'active';
  // 30 days of funnel events so analytics isn't empty in the demo
  const countries = ['India', 'India', 'India', 'India', 'UAE', 'Singapore', 'USA / Canada', 'United Kingdom'];
  const cids = ['c_seo_growth', 'c_dm_ai', 'c_meta_ads', 'c_ga4'];
  let n = 0;
  for (let d = 29; d >= 0; d--) for (let i = 0; i < 6 + (d % 5); i++) {
    const v = `v${n++}`, country = countries[n % countries.length], courseId = cids[n % cids.length];
    R.events.push({ tenantId, kind: 'course_view', courseId, visitorId: v, country, at: ago(d, i) });
    if (n % 3 === 0) R.events.push({ tenantId, kind: 'checkout_start', courseId, visitorId: v, country, at: ago(d, i) });
    if (n % 7 === 0) R.events.push({ tenantId, kind: 'paid', courseId, visitorId: v, country, at: ago(d, i) });
  }
}

/* ───────────── analytics tracking (called from course page, checkout, and the paid hook) ───────────── */
export function track(kind: EventKind, courseId: string | undefined, visitorId: string) {
  const co = courseId ? courseOf(courseId) : undefined;
  const tenantId = co?.tenantId;
  if (!tenantId) return;
  const u = db.users.find((x) => x.id === visitorId);
  r().events.push({ tenantId, kind, courseId, visitorId, country: countryOfPhone(u?.phone), at: now() });
  if (r().events.length > 20000) r().events.splice(0, 5000);
  persist();
}

/* ───────────── paid-order hook: affiliates + analytics ───────────── */
afterPaidHooks.push((o: Order) => {
  const co = courseOf(o.courseId);
  if (!co) return;
  r().events.push({ tenantId: co.tenantId, kind: 'paid', courseId: o.courseId, visitorId: o.userId, country: countryOfPhone(db.users.find((u) => u.id === o.userId)?.phone), at: o.createdAt });
  const R = r();
  const prog = R.programs.find((p) => p.tenantId === co.tenantId);
  if (!prog?.enabled || !tenantHas(co.tenantId, 'affiliates')) return;
  if (o.channel === 'bodhin_marketplace') return; // Bodhin's 20% already applies — no double commission
  const code = o.affiliateCode ?? attribute(R.clicks, o.userId, co.tenantId, prog.windowDays);
  const aff = code ? R.affiliates.find((a) => a.code === code && a.tenantId === co.tenantId && a.status === 'active') : undefined;
  if (!aff || aff.userId === o.userId || !o.amountInr) return; // never on your own purchase
  o.affiliateCode = aff.code;
  const amt = Math.round((o.amountInr * prog.commissionPct) / 100);
  R.commissions.push({ id: uid('cm'), tenantId: co.tenantId, affiliateId: aff.id, orderId: o.id, courseId: o.courseId, buyerName: o.buyerName ?? 'Learner', orderInr: o.amountInr, amountInr: amt, status: 'pending', payableAt: new Date(Date.now() + 7 * 864e5).toISOString(), at: now() });
  notifyUser(aff.userId, 'system', 'You earned a referral 🎉', `${inr(amt)} for “${co.title}”. It becomes payable after the 7-day refund window.`, { pathname: '/refer' });
});

/* ───────────── Bundles ───────────── */
export const bundlesApi = {
  list(userId: string) {
    const ctx = ctxOf(userId, 'bundles');
    const courses = seedCourses.filter((c) => c.tenantId === ctx.tenant.id && c.priceInr > 0);
    return { ctx, courses, rows: r().bundles.filter((b) => b.tenantId === ctx.tenant.id && b.status !== 'archived').map((b) => ({ b, list: b.courseIds.reduce((s, id) => s + (courseOf(id)?.priceInr ?? 0), 0) })) };
  },
  save(userId: string, input: { id?: string; title: string; courseIds: string[]; priceInr: number; publish: boolean }) {
    const ctx = ctxOf(userId, 'bundles', true);
    if (input.title.trim().length < 5 || input.title.length > 80) throw new ApiError('title', 'Title: 5–80 characters.', 'title');
    const cs = input.courseIds.map(courseOf).filter((c) => c && c.tenantId === ctx.tenant.id && c.priceInr > 0);
    if (cs.length < BUNDLE_LIMITS.minCourses || cs.length > BUNDLE_LIMITS.maxCourses) throw new ApiError('courses', `Pick ${BUNDLE_LIMITS.minCourses}–${BUNDLE_LIMITS.maxCourses} paid courses.`, 'courses');
    const list = cs.reduce((s, c) => s + c!.priceInr, 0);
    if (input.priceInr >= list) throw new ApiError('price', `Bundle price must be less than buying separately (${inr(list)}).`, 'price');
    if (input.priceInr < list * (1 - BUNDLE_LIMITS.maxDiscountPct / 100)) throw new ApiError('price', `Max ${BUNDLE_LIMITS.maxDiscountPct}% off — keep it believable.`, 'price');
    const R = r();
    const ex = input.id ? R.bundles.find((b) => b.id === input.id && b.tenantId === ctx.tenant.id) : undefined;
    const base = { title: input.title.trim(), courseIds: cs.map((c) => c!.id), priceInr: Math.round(input.priceInr), status: input.publish ? ('published' as const) : ('draft' as const) };
    if (ex) Object.assign(ex, base); else R.bundles.push({ ...base, id: uid('bd'), tenantId: ctx.tenant.id, sales: 0, createdAt: now() });
    persist();
  },
  archive(userId: string, id: string) {
    const ctx = ctxOf(userId, 'bundles', true);
    const b = r().bundles.find((x) => x.id === id && x.tenantId === ctx.tenant.id);
    if (b) b.status = 'archived';
    persist();
  },
  /** Learner view: price after removing courses they already own. */
  publicGet(id: string, userId?: string) {
    const b = r().bundles.find((x) => x.id === id && x.status === 'published');
    if (!b || !tenantHas(b.tenantId, 'bundles')) throw new ApiError('not_found', 'This bundle is not available.');
    const cs = b.courseIds.map(courseOf).filter(Boolean) as NonNullable<ReturnType<typeof courseOf>>[];
    const list = cs.reduce((s, c) => s + c.priceInr, 0);
    const split = bundleSplit(b.priceInr, cs);
    const owned = userId ? cs.filter((c) => learning.isEnrolled(userId, c.id)).map((c) => c.id) : [];
    const pay = split.filter((p) => !owned.includes(p.courseId)).reduce((s, p) => s + p.amountInr, 0);
    return { b, courses: cs, list, owned, payInr: pay, save: bundleSavings(b.priceInr, list), academy: tenantById(b.tenantId)!.branding.displayName };
  },
  async buy(id: string, userId: string, method: PaymentMethod, checkoutTenantId: string | null, failDemo = false) {
    const x = bundlesApi.publicGet(id, userId);
    if (x.owned.length === x.courses.length) throw new ApiError('already', 'You already own every course in this bundle.');
    const parts = bundleSplit(x.b.priceInr, x.courses).filter((p) => !x.owned.includes(p.courseId));
    const orders: Order[] = [];
    for (const p of parts) orders.push(await commerce.pay({ userId, courseId: p.courseId, method, source: 'direct', checkoutTenantId: checkoutTenantId ?? x.b.tenantId, chargeInr: p.amountInr, extra: { bundleId: x.b.id }, failDemo: failDemo && orders.length === 0 }));
    x.b.sales += 1;
    persist();
    return orders;
  },
  forCourse(courseId: string) {
    const co = courseOf(courseId);
    if (!co || !tenantHas(co.tenantId, 'bundles')) return [];
    return r().bundles.filter((b) => b.status === 'published' && b.courseIds.includes(courseId)).map((b) => ({ b, list: b.courseIds.reduce((s, id) => s + (courseOf(id)?.priceInr ?? 0), 0) }));
  },
};

/* ───────────── Upsells ───────────── */
export const upsellApi = {
  list(userId: string) {
    const ctx = ctxOf(userId, 'bundles');
    const courses = seedCourses.filter((c) => c.tenantId === ctx.tenant.id && c.priceInr > 0);
    return { ctx, courses, rows: r().upsells.filter((u) => u.tenantId === ctx.tenant.id) };
  },
  save(userId: string, input: Omit<Upsell, 'tenantId' | 'shown' | 'taken'>) {
    const ctx = ctxOf(userId, 'bundles', true);
    const a = courseOf(input.courseId), b = courseOf(input.offerCourseId);
    if (!a || !b || a.tenantId !== ctx.tenant.id || b.tenantId !== ctx.tenant.id) throw new ApiError('course', 'Pick two of your courses.');
    if (a.id === b.id) throw new ApiError('course', 'Offer a different course.', 'course');
    if (input.discountPct < 5 || input.discountPct > 50) throw new ApiError('discount', 'Add-on discount: 5–50%.', 'discount');
    if (input.headline.trim().length < 5 || input.headline.length > 80) throw new ApiError('headline', 'Headline: 5–80 characters.', 'headline');
    const R = r();
    const i = R.upsells.findIndex((u) => u.courseId === input.courseId && u.tenantId === ctx.tenant.id);
    const row = { ...input, headline: input.headline.trim(), tenantId: ctx.tenant.id, shown: i >= 0 ? R.upsells[i].shown : 0, taken: i >= 0 ? R.upsells[i].taken : 0 };
    i >= 0 ? (R.upsells[i] = row) : R.upsells.push(row);
    persist();
  },
  /** Checkout: the add-on offer for this course, if the learner doesn't already own it. */
  offer(courseId: string, userId: string) {
    const u = r().upsells.find((x) => x.courseId === courseId && x.enabled);
    if (!u || !tenantHas(u.tenantId, 'bundles')) return null;
    const oc = courseOf(u.offerCourseId);
    if (!oc || learning.isEnrolled(userId, oc.id)) return null;
    return { u, course: oc, priceInr: upsellPrice(oc.priceInr, u.discountPct) };
  },
  markShown(courseId: string) { const u = r().upsells.find((x) => x.courseId === courseId); if (u) { u.shown += 1; persist(); } },
  async take(courseId: string, userId: string, method: PaymentMethod, checkoutTenantId: string | null) {
    const off = upsellApi.offer(courseId, userId);
    if (!off) throw new ApiError('gone', 'This add-on is no longer available.');
    const o = await commerce.pay({ userId, courseId: off.course.id, method, source: 'direct', checkoutTenantId: checkoutTenantId ?? off.u.tenantId, chargeInr: off.priceInr, extra: { upsellOf: courseId } });
    off.u.taken += 1;
    persist();
    return o;
  },
};

/* ───────────── Affiliates ───────────── */
export const affiliatesApi = {
  admin(userId: string) {
    const ctx = ctxOf(userId, 'affiliates');
    const R = r();
    const T = ctx.tenant.id;
    const comm = R.commissions.filter((c) => c.tenantId === T);
    comm.forEach((c) => { if (c.status === 'pending' && new Date(c.payableAt).getTime() <= Date.now()) c.status = 'approved'; });
    return {
      ctx, program: R.programs.find((p) => p.tenantId === T)!,
      affiliates: R.affiliates.filter((a) => a.tenantId === T).map((a) => { const mine = comm.filter((c) => c.affiliateId === a.id && c.status !== 'reversed'); return { a, sales: mine.length, earned: mine.reduce((s, c) => s + c.amountInr, 0), due: mine.filter((c) => c.status === 'approved').reduce((s, c) => s + c.amountInr, 0) }; }),
      commissions: comm.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40),
      totals: { due: comm.filter((c) => c.status === 'approved').reduce((s, c) => s + c.amountInr, 0), pending: comm.filter((c) => c.status === 'pending').reduce((s, c) => s + c.amountInr, 0), paid: comm.filter((c) => c.status === 'paid').reduce((s, c) => s + c.amountInr, 0) },
    };
  },
  saveProgram(userId: string, input: { enabled: boolean; commissionPct: number; windowDays: number; open: boolean; terms: string }) {
    const ctx = ctxOf(userId, 'affiliates', true);
    if (input.commissionPct < AFFILIATE_LIMITS.minPct || input.commissionPct > AFFILIATE_LIMITS.maxPct) throw new ApiError('pct', `Commission: ${AFFILIATE_LIMITS.minPct}–${AFFILIATE_LIMITS.maxPct}%.`, 'pct');
    if (![7, 30, 60, 90].includes(input.windowDays)) throw new ApiError('window', 'Window: 7, 30, 60 or 90 days.', 'window');
    const p = r().programs.find((x) => x.tenantId === ctx.tenant.id)!;
    Object.assign(p, { ...input, terms: input.terms.trim().slice(0, 600) });
    persist();
  },
  setStatus(userId: string, id: string, status: Affiliate['status']) {
    const ctx = ctxOf(userId, 'affiliates', true);
    const a = r().affiliates.find((x) => x.id === id && x.tenantId === ctx.tenant.id);
    if (a) a.status = status;
    persist();
  },
  /** Mark all approved commissions of one affiliate as paid (real: via payout / UPI with UTR). */
  payOut(userId: string, affiliateId: string) {
    const ctx = ctxOf(userId, 'affiliates', true);
    const due = r().commissions.filter((c) => c.tenantId === ctx.tenant.id && c.affiliateId === affiliateId && c.status === 'approved');
    const sum = due.reduce((s, c) => s + c.amountInr, 0);
    if (sum < AFFILIATE_LIMITS.minPayoutInr) throw new ApiError('min', `Payouts start at ${inr(AFFILIATE_LIMITS.minPayoutInr)}.`);
    due.forEach((c) => (c.status = 'paid'));
    const a = r().affiliates.find((x) => x.id === affiliateId)!;
    notifyUser(a.userId, 'system', 'Referral payout sent 💸', `${inr(sum)} from ${ctx.tenant.branding.displayName}.`, { pathname: '/refer' });
    persist();
    return sum;
  },
  /** Learner: programs they can join (academies they learn with) + their links and earnings. */
  mine(userId: string) {
    const R = r();
    const tenants = [...new Set(db.enrollments.filter((e) => e.userId === userId).map((e) => courseOf(e.courseId)?.tenantId).filter(Boolean))] as string[];
    return tenants.filter((t) => tenantHas(t, 'affiliates')).map((t) => {
      const prog = R.programs.find((p) => p.tenantId === t)!;
      const a = R.affiliates.find((x) => x.tenantId === t && x.userId === userId) ?? null;
      const comm = a ? R.commissions.filter((c) => c.affiliateId === a.id && c.status !== 'reversed') : [];
      const host = tenantById(t)!.customDomain ?? `${tenantById(t)!.slug}.thebodhin.com`;
      return { tenantId: t, academy: tenantById(t)!.branding.displayName, prog, a, link: a ? `https://${host}/?aff=${a.code}` : null, earned: comm.reduce((s, c) => s + c.amountInr, 0), pending: comm.filter((c) => c.status === 'pending').reduce((s, c) => s + c.amountInr, 0), paid: comm.filter((c) => c.status === 'paid').reduce((s, c) => s + c.amountInr, 0), sales: comm.length };
    }).filter((x) => x.prog.enabled);
  },
  join(userId: string, tenantId: string) {
    const R = r();
    const prog = R.programs.find((p) => p.tenantId === tenantId);
    if (!prog?.enabled || !tenantHas(tenantId, 'affiliates')) throw new ApiError('closed', 'This academy has no referral program.');
    if (!db.enrollments.some((e) => e.userId === userId && courseOf(e.courseId)?.tenantId === tenantId)) throw new ApiError('forbidden', 'Join a course first to refer friends.');
    if (R.affiliates.some((a) => a.tenantId === tenantId && a.userId === userId)) throw new ApiError('already', 'You already have a link.');
    const a: Affiliate = { id: uid('af'), tenantId, userId, name: userName(userId), code: affiliateCode(userName(userId), uid('x')), status: prog.open ? 'active' : 'pending', clicks: 0, joinedAt: now() };
    R.affiliates.push(a);
    persist();
    return a;
  },
  /** A visitor opened a referral link. visitorId = signed-in user id (real: first-party cookie). */
  click(code: string, visitorId: string) {
    const R = r();
    const a = R.affiliates.find((x) => x.code === code.toUpperCase() && x.status === 'active');
    if (!a || a.userId === visitorId) return false;
    a.clicks += 1;
    R.clicks.push({ code: a.code, tenantId: a.tenantId, visitorId, at: now() });
    persist();
    return true;
  },
};

/* ───────────── Certificate designer ───────────── */
export const certDesignApi = {
  get(userId: string) {
    const ctx = ctxOf(userId, 'certificate_designer');
    return { ctx, t: { ...r().certTemplates.find((x) => x.tenantId === ctx.tenant.id)! }, branding: ctx.tenant.branding };
  },
  save(userId: string, t: CertTemplate) {
    const ctx = ctxOf(userId, 'certificate_designer', true);
    const e = certErrors(t);
    if (e.length) throw new ApiError(e[0].field, e[0].msg, e[0].field);
    const R = r();
    const i = R.certTemplates.findIndex((x) => x.tenantId === ctx.tenant.id);
    R.certTemplates[i] = { ...t, tenantId: ctx.tenant.id, updatedAt: now() };
    persist();
  },
  /** Everything the certificate page needs: learner, course, academy template (Bodhin default if the academy has no designer). */
  render(userId: string, certId: string) {
    const cert = certificates.get(userId, certId);
    if (!cert) throw new ApiError('not_found', 'Certificate not found.');
    const co = cert.courseId ? courseOf(cert.courseId) : undefined;
    const tenant = co ? tenantById(co.tenantId) : undefined;
    const custom = tenant && tenantHas(tenant.id, 'certificate_designer') ? r().certTemplates.find((x) => x.tenantId === tenant.id) : undefined;
    const t: CertTemplate = custom ?? defaultCert(tenant?.id ?? 'bodhin', cert.tutor, cert.issuedAt);
    return { cert, t, learner: userName(userId), academy: tenant?.branding.displayName ?? 'Bodhin', branding: tenant?.branding ?? null, verify: verifyUrl(cert.id) };
  },
};

/** Public verification (no login): anyone with the ID or QR can confirm a certificate is real. Shows only what is printed on it. */
export function verifyCertificate(certId: string) {
  const id = certId.trim();
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(id)) return { valid: false as const, reason: 'That doesn’t look like a certificate ID. Check the letters and numbers on the certificate.' };
  const cert = db.certificates.find((x) => x.id === id);
  if (!cert) return { valid: false as const, reason: 'No certificate with this ID was issued on Bodhin.' };
  const co = cert.courseId ? courseOf(cert.courseId) : undefined;
  const tenant = co ? tenantById(co.tenantId) : undefined;
  return { valid: true as const, id: cert.id, learner: userName(cert.userId), course: cert.title, academy: tenant?.branding.displayName ?? 'Bodhin', tutor: cert.tutor, issuedAt: cert.issuedAt, weeks: cert.weeks };
}

/* ───────────── Analytics ───────────── */
export const analyticsApi = {
  get(userId: string, days: 7 | 30 | 90) {
    const ctx = ctxOf(userId, 'courses');
    if (ctx.role !== 'owner') throw new ApiError('forbidden', 'Analytics are for the workspace owner.');
    const T = ctx.tenant.id;
    const since = Date.now() - days * 864e5;
    const orders = db.orders.filter((o) => o.sellerTenantId === T && o.status === 'paid' && new Date(o.createdAt).getTime() >= since);
    const sales = __growthTest.store().sales.filter((s) => s.tenantId === T && new Date(s.at).getTime() >= since);
    const revenue = orders.reduce((s, o) => s + o.educatorShareInr, 0) + sales.reduce((s, x) => s + x.amountInr, 0);
    const byChannel = [
      { label: 'Your direct sales', v: orders.filter((o) => o.channel !== 'bodhin_marketplace').reduce((s, o) => s + o.educatorShareInr, 0) },
      { label: 'Bodhin marketplace (after 20%)', v: orders.filter((o) => o.channel === 'bodhin_marketplace').reduce((s, o) => s + o.educatorShareInr, 0) },
      { label: 'Webinars, 1:1, products', v: sales.reduce((s, x) => s + x.amountInr, 0) },
      { label: 'Bundles & add-ons (in direct)', v: orders.filter((o) => o.bundleId || o.upsellOf).reduce((s, o) => s + o.educatorShareInr, 0) },
    ];
    const topMap = new Map<string, { title: string; orders: number; v: number }>();
    orders.forEach((o) => { const t = topMap.get(o.courseId) ?? { title: courseOf(o.courseId)?.title ?? o.courseId, orders: 0, v: 0 }; t.orders += 1; t.v += o.educatorShareInr; topMap.set(o.courseId, t); });
    const enr = db.enrollments.filter((e) => courseOf(e.courseId)?.tenantId === T);
    const active = enr.filter((e) => e.lastActiveAt && new Date(e.lastActiveAt).getTime() >= Date.now() - 7 * 864e5).length;
    const pro = ctx.ent.has('analytics_pro');
    const ev = r().events.filter((e) => e.tenantId === T && new Date(e.at).getTime() >= since);
    const countries = pro ? Object.entries(ev.filter((e) => e.kind === 'paid' || e.kind === 'course_view').reduce<Record<string, number>>((m, e) => ((m[e.country] = (m[e.country] ?? 0) + 1), m), {})).map(([k, v]) => ({ label: k, v })).sort((a, b) => b.v - a.v).slice(0, 8) : [];
    return {
      ctx, days, pro,
      kpi: { revenue, orders: orders.length + sales.length, aov: orders.length ? Math.round(orders.reduce((s, o) => s + o.amountInr, 0) / orders.length) : 0, learners: enr.length, active7: active, refunds: db.orders.filter((o) => o.sellerTenantId === T && o.status === 'refunded' && new Date(o.createdAt).getTime() >= since).length },
      series: daily([...orders.map((o) => ({ at: o.createdAt, v: o.educatorShareInr })), ...sales.map((s) => ({ at: s.at, v: s.amountInr }))], Math.min(days, 30)),
      byChannel,
      top: [...topMap.values()].sort((a, b) => b.v - a.v).slice(0, 5),
      funnel: pro ? funnel(ev) : null,
      countries,
    };
  },
  csv(userId: string, days: 7 | 30 | 90) {
    const a = analyticsApi.get(userId, days);
    return ['Day,Revenue (INR)', ...a.series.map((s) => `${s.day},${s.v}`)].join('\n');
  },
};

/* ───────────── International pricing ───────────── */
export const intlApi = {
  admin(userId: string) {
    const ctx = ctxOf(userId, 'multi_currency');
    const R = r();
    return { ctx, gateway: R.intlGateway[ctx.tenant.id] ?? 'not_connected', rows: seedCourses.filter((c) => c.tenantId === ctx.tenant.id && c.priceInr > 0).map((co) => ({ co, prices: R.intl.find((x) => x.courseId === co.id)?.prices ?? {} })) };
  },
  connect(userId: string, provider: 'stripe' | 'paypal', key: string) {
    const ctx = ctxOf(userId, 'multi_currency', true);
    if (provider === 'stripe' && !/^(pk|rk)_(test|live)_[A-Za-z0-9]{8,}$/.test(key.trim())) throw new ApiError('key', 'Paste your Stripe publishable key (pk_test_… or pk_live_…). Never paste the secret key here.', 'key');
    if (provider === 'paypal' && key.trim().length < 10) throw new ApiError('key', 'Paste your PayPal client ID.', 'key');
    r().intlGateway[ctx.tenant.id] = 'active';
    persist();
  },
  setPrices(userId: string, courseId: string, prices: IntlPrice['prices']) {
    const ctx = ctxOf(userId, 'multi_currency', true);
    if (courseOf(courseId)?.tenantId !== ctx.tenant.id) throw new ApiError('not_found', 'Course not found.');
    const e = intlErrors(prices);
    if (e) throw new ApiError('price', e, 'price');
    const R = r();
    const clean = Object.fromEntries(Object.entries(prices).filter(([, v]) => v != null && v > 0)) as IntlPrice['prices'];
    const i = R.intl.findIndex((x) => x.courseId === courseId);
    i >= 0 ? (R.intl[i].prices = clean) : R.intl.push({ courseId, tenantId: ctx.tenant.id, prices: clean });
    persist();
  },
  /** Checkout: currencies a learner can pay in for this course. INR is always first. */
  options(courseId: string) {
    const co = courseOf(courseId);
    if (!co || !tenantHas(co.tenantId, 'multi_currency') || r().intlGateway[co.tenantId] !== 'active') return [];
    const p = r().intl.find((x) => x.courseId === courseId)?.prices ?? {};
    return CURRENCIES.filter((c) => c.id !== 'INR' && p[c.id as Exclude<Currency, 'INR'>]).map((c) => ({ ...c, amount: p[c.id as Exclude<Currency, 'INR'>]!, inrEq: Math.round(p[c.id as Exclude<Currency, 'INR'>]! * REF_RATE[c.id]) }));
  },
  async pay(input: { userId: string; courseId: string; currency: Exclude<Currency, 'INR'>; checkoutTenantId: string | null; source: Order['source'] }) {
    const opt = intlApi.options(input.courseId).find((o) => o.id === input.currency);
    if (!opt) throw new ApiError('currency', 'This currency is not available for this course.');
    return commerce.pay({ userId: input.userId, courseId: input.courseId, method: 'card', source: input.source, checkoutTenantId: input.checkoutTenantId, chargeInr: opt.inrEq, extra: { currency: input.currency, amountForeign: opt.amount } });
  },
};

/* ───────────── Embed widget ───────────── */
export const embedApi = {
  get(userId: string) {
    const ctx = ctxOf(userId, 'embed');
    const courses = seedCourses.filter((c) => c.tenantId === ctx.tenant.id && isPublished(c));
    return { ctx, courses, all: embedSnippets(ctx.host, ctx.tenant.slug), per: (courseId?: string) => embedSnippets(ctx.host, ctx.tenant.slug, courseId) };
  },
  /** Public, framed by other sites: compact course cards with a buy button. */
  render(slug: string, courseId?: string) {
    const t = db.tenants.find((x) => x.slug === slug || x.customDomain === slug);
    if (!t || t.status !== 'active' || !tenantHas(t.id, 'embed')) throw new ApiError('not_found', 'This widget is not available.');
    const cs = seedCourses.filter((c) => c.tenantId === t.id && isPublished(c) && (!courseId || c.id === courseId)).slice(0, 6);
    return { t, courses: cs };
  },
};

/* ───────────── Showcase videos: educator opts in → Bodhin shows them on its public pages ───────────── */
/** Pricing document rule: only "Listing + promotion" courses, approved by Bodhin, may be used in Bodhin's own marketing. */
const promotable = (courseId: string) => { const co = courseOf(courseId); return !!co && onMarketplace(co) && co.visibility === 'public_promoted'; };
function clips() {
  const R = r();
  R.clips ??= [];
  if (!R.clipsSeeded) {
    R.clipsSeeded = true;
    // Demo: each promoted course shares its first few video lessons as free samples.
    for (const co of seedCourses.filter((c) => promotable(c.id))) {
      allLessons(co).filter((l) => l.type === 'video').slice(0, 4).forEach((l, i) => R.clips!.push({ id: uid('cl'), tenantId: co.tenantId, courseId: co.id, lessonId: l.id, title: l.title, durationSec: Math.min(l.durationSec ?? 300, SHOWCASE_LIMITS.maxSec), active: true, plays: 40 + ((co.students + i * 37) % 900), createdAt: ago(20 - i) }));
    }
    persist();
  }
  return R.clips;
}
export const showcaseApi = {
  /** Educator: which videos Bodhin may show publicly, per course. */
  admin(userId: string) {
    const ctx = ctxOf(userId, 'marketplace');
    const T = ctx.tenant.id;
    const all = clips().filter((c) => c.tenantId === T);
    return {
      ctx,
      courses: seedCourses.filter((c) => c.tenantId === T && isPublished(c)).map((co) => ({ co, eligible: promotable(co.id), why: co.visibility === 'private' ? 'Private course' : co.visibility === 'public' ? 'Listed, but promotion is off' : co.moderation !== 'approved' ? 'Waiting for Bodhin review' : '', clips: all.filter((c) => c.courseId === co.id), lessons: allLessons(co).filter((l) => l.type === 'video') })),
      plays: all.reduce((s, c) => s + c.plays, 0), live: all.filter((c) => c.active && !c.blocked && promotable(c.courseId)).length,
    };
  },
  add(userId: string, input: { courseId: string; lessonId?: string; title?: string; durationSec?: number }) {
    const ctx = ctxOf(userId, 'marketplace', true);
    const co = courseOf(input.courseId);
    if (!co || co.tenantId !== ctx.tenant.id) throw new ApiError('not_found', 'Course not found.');
    if (!promotable(co.id)) throw new ApiError('consent', 'Turn on “Listing + promotion” for this course first (Course → Visibility). Bodhin shows videos only with that consent.');
    const mine = clips().filter((c) => c.courseId === co.id);
    if (mine.length >= SHOWCASE_LIMITS.perCourse) throw new ApiError('limit', `Up to ${SHOWCASE_LIMITS.perCourse} showcase videos per course.`);
    const lesson = input.lessonId ? allLessons(co).find((l) => l.id === input.lessonId && l.type === 'video') : undefined;
    if (input.lessonId && !lesson) throw new ApiError('lesson', 'Pick a video lesson.', 'lesson');
    if (lesson && mine.some((c) => c.lessonId === lesson.id)) throw new ApiError('lesson', 'This lesson is already in your showcase.', 'lesson');
    const title = (lesson?.title ?? input.title ?? '').trim();
    const sec = lesson?.durationSec ?? input.durationSec ?? 0;
    if (title.length < SHOWCASE_LIMITS.titleMin || title.length > SHOWCASE_LIMITS.titleMax) throw new ApiError('title', `Title: ${SHOWCASE_LIMITS.titleMin}–${SHOWCASE_LIMITS.titleMax} characters.`, 'title');
    if (!lesson && (sec < SHOWCASE_LIMITS.minSec || sec > SHOWCASE_LIMITS.maxSec)) throw new ApiError('duration', 'Promo videos: 20 seconds to 20 minutes.', 'duration');
    const c: ShowClip = { id: uid('cl'), tenantId: ctx.tenant.id, courseId: co.id, lessonId: lesson?.id, title, durationSec: Math.min(sec, SHOWCASE_LIMITS.maxSec), active: true, plays: 0, createdAt: now() };
    clips().push(c);
    persist();
    return c;
  },
  setActive(userId: string, id: string, active: boolean) {
    const ctx = ctxOf(userId, 'marketplace', true);
    const c = clips().find((x) => x.id === id && x.tenantId === ctx.tenant.id);
    if (c) c.active = active;
    persist();
  },
  remove(userId: string, id: string) {
    const ctx = ctxOf(userId, 'marketplace', true);
    const R = r();
    R.clips = clips().filter((x) => !(x.id === id && x.tenantId === ctx.tenant.id));
    persist();
  },
  /** Public: every video an educator has allowed, newest and most-played mixed. Consent is re-checked on every read. */
  wall(categoryId?: string) {
    const rows = clips().filter((c) => c.active && !c.blocked && promotable(c.courseId)).map((c) => { const co = courseOf(c.courseId)!; return { c, course: co, tutor: seedTutors.find((t) => t.id === co.tutorId) ?? null, category: seedCategories.find((k) => k.id === co.categoryId)?.name ?? 'Other' }; })
      .filter((x) => !categoryId || categoryId === 'all' || x.course.categoryId === categoryId);
    const cats = [...new Map(clips().filter((c) => c.active && !c.blocked && promotable(c.courseId)).map((c) => { const co = courseOf(c.courseId)!; return [co.categoryId, seedCategories.find((k) => k.id === co.categoryId)?.name ?? 'Other'] as [string, string]; })).entries()].map(([id, name]) => ({ id, name }));
    // interleave educators so one academy never fills a whole row
    const by = new Map<string, typeof rows>();
    rows.forEach((x) => by.set(x.course.id, [...(by.get(x.course.id) ?? []), x]));
    const mixed: typeof rows = [];
    for (let i = 0; mixed.length < rows.length; i++) for (const list of by.values()) if (list[i]) mixed.push(list[i]);
    return { rows: mixed, cats, minutes: Math.round(rows.reduce((s, x) => s + x.c.durationSec, 0) / 60), educators: new Set(rows.map((x) => x.course.tutorId)).size };
  },
  played(id: string) {
    const c = clips().find((x) => x.id === id);
    if (c) { c.plays += 1; persist(); }
  },
};

/* ───────────── Public marketing pages (thebodhin.com) ───────────── */
export const marketing = {
  home() {
    const listed = seedCourses.filter(onMarketplace).sort((a, b) => b.students - a.students);
    const showcase = listed.slice(0, 6).map((c) => ({ c, tutor: seedTutors.find((t) => t.id === c.tutorId) ?? null, preview: allLessons(c).find((l) => l.preview) ?? null }));
    const tutors = seedTutors.filter((t) => listed.some((c) => c.tutorId === t.id)).slice(0, 6).map((t) => ({ t, courses: listed.filter((c) => c.tutorId === t.id).length, learners: listed.filter((c) => c.tutorId === t.id).reduce((s, c) => s + c.students, 0) }));
    return { showcase, tutors, stats: { courses: listed.length, learners: listed.reduce((s, c) => s + c.students, 0), academies: db.tenants.filter((t) => t.status === 'active').length } };
  },
  /** Pricing page: always read from the plan catalogue (Super Admin edits flow through) — never hardcoded. */
  pricing() {
    const keys = Object.keys(FEATURE_LABEL);
    return {
      plans: PLANS.map((p) => ({ p, features: PLAN_FEATURES[p.id] as string[] })),
      rows: keys.map((k) => ({ key: k, label: FEATURE_LABEL[k], on: Object.fromEntries(PLANS.map((p) => [p.id, (PLAN_FEATURES[p.id] as string[]).includes(k)])) as Record<string, boolean> })),
      commissionPct: Math.round(db.platformConfig.commissionRate * 100),
      trialDays: db.platformConfig.trialDays,
      trialPlan: PLANS.find((p) => p.id === db.platformConfig.trialPlan)?.name ?? 'Growth',
    };
  },
};

/** Free-trial length shown on public pages; always the Super Admin setting (never typed into copy). */
export const trialDays = () => db.platformConfig.trialDays;

/** What each tool does, in the visitor's words. Plan availability is computed from PLAN_FEATURES, never typed here. */
export type ToolGroup = 'Teach' | 'Sell' | 'Grow' | 'Brand' | 'Run';
const TOOL_META: Record<string, { group: ToolGroup; icon: string; blurb: string }> = {
  courses: { group: 'Teach', icon: 'layers-outline', blurb: 'Modules, lessons, drip schedule, free previews.' },
  recorded_video: { group: 'Teach', icon: 'videocam-outline', blurb: 'Upload once, stream smoothly, offline download in the app.' },
  live_classes: { group: 'Teach', icon: 'radio-outline', blurb: 'Chat, polls, whiteboard, Q&A, hand raise — in your brand.' },
  assessments: { group: 'Teach', icon: 'help-circle-outline', blurb: 'Quizzes, exams and assignments with rubric grading.' },
  certificates: { group: 'Teach', icon: 'ribbon-outline', blurb: 'Auto-issued on completion, verifiable online.' },
  batches: { group: 'Teach', icon: 'people-outline', blurb: 'Cohorts with timetable, attendance and announcements.' },
  community: { group: 'Teach', icon: 'chatbubbles-outline', blurb: 'Channels for your learners, with moderation built in.' },
  certificate_designer: { group: 'Brand', icon: 'color-wand-outline', blurb: 'Your logo, signature and QR on every certificate.' },
  website: { group: 'Brand', icon: 'globe-outline', blurb: 'A ready academy site on your Bodhin address.' },
  website_pro: { group: 'Brand', icon: 'construct-outline', blurb: 'Reorder sections, FAQ, stories, Analytics & Pixel.' },
  custom_domain: { group: 'Brand', icon: 'link-outline', blurb: 'Run on your own domain with SSL.' },
  white_label: { group: 'Brand', icon: 'eye-off-outline', blurb: 'Remove “Powered by Bodhin”.' },
  embed: { group: 'Brand', icon: 'code-outline', blurb: 'Sell from your existing website or WordPress.' },
  coupons: { group: 'Sell', icon: 'pricetags-outline', blurb: 'Dated offers with usage limits. No fake countdowns.' },
  bundles: { group: 'Sell', icon: 'albums-outline', blurb: 'Combo prices and a one-tap add-on at checkout.' },
  emi: { group: 'Sell', icon: 'calendar-number-outline', blurb: 'Instalments with reminders and grace days.' },
  digital_products: { group: 'Sell', icon: 'download-outline', blurb: 'Sell notes, eBooks and templates.' },
  bookings: { group: 'Sell', icon: 'calendar-outline', blurb: 'Paid or free 1:1 sessions with no double booking.' },
  webinars: { group: 'Sell', icon: 'easel-outline', blurb: 'Free or paid webinars that fill your pipeline.' },
  multi_currency: { group: 'Sell', icon: 'earth-outline', blurb: 'USD, AED, GBP, EUR prices for learners abroad.' },
  marketplace: { group: 'Grow', icon: 'storefront-outline', blurb: 'Optional listing on Bodhin — you choose per course.' },
  crm: { group: 'Grow', icon: 'funnel-outline', blurb: 'Every enquiry, follow-up and demo in one pipeline.' },
  automations: { group: 'Grow', icon: 'flash-outline', blurb: 'Welcome, class and fee messages that send themselves.' },
  broadcast: { group: 'Grow', icon: 'megaphone-outline', blurb: 'Email and app push to any group of learners.' },
  affiliates: { group: 'Grow', icon: 'gift-outline', blurb: 'Learners earn for bringing friends.' },
  multi_tutor: { group: 'Run', icon: 'people-circle-outline', blurb: 'Add tutors with limited access to their own courses.' },
  advanced_reports: { group: 'Run', icon: 'stats-chart-outline', blurb: 'Batch, attendance and score reports.' },
  analytics_pro: { group: 'Run', icon: 'analytics-outline', blurb: 'Funnel and country-wise analytics.' },
};

Object.assign(marketing, {
  /** Features page: every tool with the first plan that includes it. */
  tools() {
    const rows = Object.keys(FEATURE_LABEL).map((k) => {
      const from = PLANS.find((p) => (PLAN_FEATURES[p.id] as string[]).includes(k));
      const m = TOOL_META[k] ?? { group: 'Run' as ToolGroup, icon: 'ellipse-outline', blurb: '' };
      return { key: k, label: FEATURE_LABEL[k], ...m, plan: from?.name ?? 'Enterprise', planId: from?.id ?? 'enterprise' };
    });
    return { rows, groups: ['Teach', 'Sell', 'Grow', 'Brand', 'Run'] as ToolGroup[] };
  },
  /** Plan finder: smallest plan that fits the student count and has every tool the visitor ticked. */
  findPlan(students: number, needs: string[]) {
    const fit = PLANS.find((p) => (p.activeStudents == null || p.activeStudents >= students) && needs.every((n) => (PLAN_FEATURES[p.id] as string[]).includes(n)));
    return fit ?? PLANS[PLANS.length - 1];
  },
  /** Contact form → Bodhin's own lead pipeline (same rules as an academy enquiry form). */
  contact(input: { name: string; phone: string; email?: string; message?: string; hp?: string }) {
    const bod = tenantById(db.platformConfig.bodhinTenantId);
    if (!bod) throw new ApiError('closed', 'Please try again later.');
    if (input.hp) return { id: 'bot', duplicate: false };
    if (input.name.trim().length < 2) throw new ApiError('name', 'Enter your name.', 'name');
    if (!/^[6-9]\d{9}$/.test(input.phone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, ''))) throw new ApiError('phone', 'Enter a valid 10-digit mobile number.', 'phone');
    if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.email.trim())) throw new ApiError('email', 'Enter a valid email or leave it empty.', 'email');
    try {
      return siteApi.submitLead(bod.slug, { name: input.name, phone: input.phone, email: input.email });
    } catch {
      // Bodhin's own CRM not switched on → keep the enquiry as a support ticket so it is never lost.
      const id = uid('tk');
      db.tickets.push({ id, userId: 'guest', category: 'Sales enquiry', subject: `Call back: ${input.name.trim()} (+91 ${input.phone})`, body: (input.message ?? '').slice(0, 500), status: 'open', createdAt: now(), replies: [] });
      persist();
      return { id, duplicate: false };
    }
  },
  /** Money-flow example with the platform's real rates (direct sale vs Bodhin marketplace sale). */
  split(priceInr: number) {
    const cfg = db.platformConfig;
    const m = splitOrder(priceInr, { channel: 'bodhin_marketplace', collector: 'bodhin', sellerTenantId: 'x', commissionRate: cfg.commissionRate }, cfg);
    return { price: priceInr, direct: { you: priceInr, bodhin: 0, gateway: 0 }, marketplace: { you: m.educatorNet, bodhin: m.commission, gateway: m.gatewayFee }, commissionPct: Math.round(cfg.commissionRate * 100), gatewayPct: Math.round(cfg.gatewayFeeRate * 1000) / 10 };
  },
});
export const marketingX = marketing as typeof marketing & {
  tools(): { rows: { key: string; label: string; group: ToolGroup; icon: string; blurb: string; plan: string; planId: string }[]; groups: ToolGroup[] };
  findPlan(students: number, needs: string[]): (typeof PLANS)[number];
  contact(input: { name: string; phone: string; email?: string; message?: string; hp?: string }): { id: string; duplicate: boolean };
  split(priceInr: number): { price: number; direct: { you: number; bodhin: number; gateway: number }; marketplace: { you: number; bodhin: number; gateway: number }; commissionPct: number; gatewayPct: number };
};

/* ───────────── Super Admin: growth overview + showcase moderation ───────────── */
export const adminGrowth = {
  get(userId: string) {
    adminGuard(userId, 'tenants.view');
    const G = __growthTest.store();
    const R = r();
    const tenants = db.tenants.filter((t) => t.status === 'active' || t.status === 'suspended');
    const KEYS: [Feature, string, (tid: string) => number][] = [
      ['crm', 'Leads', (t) => G.leads.filter((x) => x.tenantId === t).length],
      ['webinars', 'Webinars', (t) => G.webinars.filter((x) => x.tenantId === t).length],
      ['bookings', '1:1 offers', (t) => G.offers.filter((x) => x.tenantId === t).length],
      ['digital_products', 'Products', (t) => G.products.filter((x) => x.tenantId === t && x.status !== 'archived').length],
      ['bundles', 'Bundles', (t) => R.bundles.filter((x) => x.tenantId === t && x.status !== 'archived').length],
      ['affiliates', 'Affiliates', (t) => R.affiliates.filter((x) => x.tenantId === t).length],
      ['emi', 'EMI plans', (t) => G.emiContracts.filter((x) => x.tenantId === t).length],
    ];
    const rows = tenants.map((t) => {
      const sales = G.sales.filter((x) => x.tenantId === t.id);
      return { t, sales: sales.reduce((s, x) => s + x.amountInr, 0), count: sales.length, use: KEYS.map(([f, label, n]) => ({ label, on: tenantHas(t.id, f), n: n(t.id) })) };
    }).sort((a, b) => b.sales - a.sales);
    const adoption = KEYS.map(([, label], i) => ({ label, using: rows.filter((r0) => r0.use[i].n > 0).length, allowed: rows.filter((r0) => r0.use[i].on).length }));
    return { rows, adoption, totals: { sales: rows.reduce((s, x) => s + x.sales, 0), orders: rows.reduce((s, x) => s + x.count, 0), affiliateDue: R.commissions.filter((c) => c.status === 'approved').reduce((s, c) => s + c.amountInr, 0) } };
  },
  /** All showcase videos across academies, with the reason a video is (not) live. */
  clips(userId: string) {
    adminGuard(userId, 'content.bodhin');
    return clips().map((c) => { const co = courseOf(c.courseId)!; return { c, course: co, academy: tenantById(c.tenantId)?.branding.displayName ?? '', live: c.active && !c.blocked && promotable(c.courseId), why: c.blocked ? 'Blocked by Bodhin' : !c.active ? 'Hidden by educator' : !promotable(c.courseId) ? 'Promotion consent off' : '' }; }).sort((a, b) => b.c.plays - a.c.plays);
  },
  /** Bodhin can pull a video from its own pages (quality, wrong content). Audited; the educator is told why. */
  block(userId: string, id: string, blocked: boolean, reason?: string) {
    adminGuard(userId, 'content.bodhin');
    const c = clips().find((x) => x.id === id);
    if (!c) throw new ApiError('not_found', 'Video not found.');
    if (blocked && (reason ?? '').trim().length < 5) throw new ApiError('reason', 'Write a short reason — the educator sees it.', 'reason');
    c.blocked = blocked;
    c.blockReason = blocked ? reason!.trim() : undefined;
    audit(userId, blocked ? 'showcase.block' : 'showcase.unblock', { kind: 'tenant', id: c.tenantId, label: tenantById(c.tenantId)?.branding.displayName ?? c.tenantId }, `${blocked ? 'Removed' : 'Restored'} showcase video “${c.title}”${blocked ? ` — ${reason}` : ''}`);
    const owner = tenantById(c.tenantId)?.ownerUserId;
    if (owner) notifyUser(owner, 'system', blocked ? 'A showcase video was removed' : 'Showcase video restored', blocked ? `“${c.title}” no longer shows on Bodhin’s pages: ${reason}` : `“${c.title}” is back on Bodhin’s pages.`, { pathname: '/edu/showcase' });
    persist();
  },
};

export const __r2Test = { store: () => r(), reset() { delete db.r2; } };
