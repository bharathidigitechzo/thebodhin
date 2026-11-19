/**
 * Growth tools API (Nrich / Graphy parity, round 1). Same contract as api/client.ts: screens call only these
 * functions; today they run on mockDb, live they become calls to Supabase (tables in migration 0007, same rules).
 * Nothing here changes existing modules — it reads courses, people, batches and orders, and adds its own records.
 */
import { db, persist, uid } from './mockDb';
import { courses as seedCourses } from './catalogSeed';
import { ApiError, commerce, educator, learning, notifyUser } from './client';
import type { Feature } from '@/core/business';
import {
  COMMUNITY_LIMITS, EMI_MIN_PRICE, LEAD_STAGES, MSG_LIMITS, PRODUCT_LIMITS, SECTION_META, TRIGGERS,
  canMove, defaultAutomations, defaultSite, emiSchedule, emiState, freeSlots, normPhone, pipelineStats, renderTemplate, siteErrors, spamReason, unknownVars, validEmail, validWeekly, webinarState,
  type Audience, type Automation, type Booking, type BookingOffer, type Broadcast, type Channel, type Channel_, type DigitalProduct, type EmiPlan, type GrowthDb, type Lead, type LeadSource, type LeadStage,
  type Post, type ProductKind, type Sale, type Site, type TemplateVars, type Trigger, type Webinar,
} from '@/core/growth';
import { isPublished, type PaymentMethod } from '@/core/catalog';

const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();
const ago = (d: number, h = 0) => new Date(Date.now() - d * 864e5 - h * 3600e3).toISOString();
const ahead = (d: number, h = 0) => new Date(Date.now() + d * 864e5 + h * 3600e3).toISOString();
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/* ───────────── storage + seed ───────────── */
function g(): GrowthDb {
  db.growth ??= { v: 1, leads: [], automations: [], broadcasts: [], outbox: [], emiPlans: [], emiContracts: [], webinars: [], offers: [], bookings: [], products: [], purchases: [], sites: [], channels: [], posts: [], sales: [], seededTenants: [] };
  const G = db.growth;
  let seeded = false;
  for (const t of db.tenants) if (!G.seededTenants.includes(t.id)) { seedTenant(G, t.id); seeded = true; }
  if (seeded) persist(); // keep seeded ids stable across reloads (links to leads, webinars, channels)
  return G;
}
function seedTenant(G: GrowthDb, tenantId: string) {
  G.seededTenants.push(tenantId);
  const t = db.tenants.find((x) => x.id === tenantId)!;
  defaultAutomations(tenantId, now()).forEach((a) => G.automations.push({ ...a, id: uid('au') }));
  G.sites.push(defaultSite(tenantId, t.branding.displayName, now()));
  G.channels.push({ id: uid('ch'), tenantId, name: 'Announcements', announce: true, createdAt: now() }, { id: uid('ch'), tenantId, name: 'General', announce: false, createdAt: now() });
  if (tenantId !== 't_rajesh') return;
  // Demo data for Rajesh Kumar Academy so every screen has something real to show.
  const L = (name: string, phone: string, source: LeadSource, stage: LeadStage, d: number, extra: Partial<Lead> = {}): Lead => ({ id: uid('ld'), tenantId, name, phone, source, stage, notes: [], createdAt: ago(d), updatedAt: ago(d), courseId: 'c_seo_growth', ...extra });
  G.leads.push(
    L('Priya Shankar', '9876501234', 'website', 'new', 0, { email: 'priya.s@email.com', nextFollowUpAt: ahead(0, 2) }),
    L('Vignesh R', '9840012345', 'webinar', 'new', 1, { courseId: 'c_dm_ai', nextFollowUpAt: ago(1) }),
    L('Sathya Moorthy', '9003456789', 'ads', 'contacted', 2, { notes: [{ at: ago(1), text: 'Asked about weekend batch. Call after 6 pm.', by: 'Rajesh Kumar' }], nextFollowUpAt: ahead(1) }),
    L('Anitha J', '9789012345', 'referral', 'demo', 3, { demoAt: ahead(1, 3), courseId: 'c_dm_ai' }),
    L('Karthik M', '9361234567', 'walk_in', 'won', 9, { notes: [{ at: ago(8), text: 'Paid full fee at office.', by: 'Rajesh Kumar' }] }),
    L('Deepa Lakshmi', '9445566778', 'website', 'lost', 12, { lostReason: 'Price too high' }),
    L('Ramesh Babu', '9150099887', 'phone', 'contacted', 4, { courseId: 'c_meta_ads', nextFollowUpAt: ago(2) }),
  );
  G.emiPlans.push({ courseId: 'c_dm_ai', tenantId, parts: 3, everyDays: 30, feePct: 0, graceDays: 7, enabled: true });
  const w: Webinar = { id: 'wb_seo_free', tenantId, title: 'Free masterclass: Rank on Google in 2027', description: 'A 60-minute live session on the SEO steps that still work with AI search. Live Q&A at the end.', startsAt: ahead(3, 2), durationMin: 60, priceInr: 0, capacity: 300, pitchCourseId: 'c_seo_growth', status: 'published', registrations: [{ name: 'Vignesh R', email: 'vignesh@email.com', at: ago(1) }, { name: 'Lavanya K', email: 'lavanya@email.com', at: ago(0, 5) }], replay: true, createdAt: ago(5) };
  G.webinars.push(w, { ...w, id: 'wb_ads_paid', title: 'Meta Ads teardown (paid workshop)', description: 'We audit 5 real ad accounts live and fix them on screen.', priceInr: 299, capacity: 100, startsAt: ahead(8, 4), pitchCourseId: 'c_meta_ads', registrations: [], createdAt: ago(2) });
  G.offers.push({ id: 'of_career', tenantId, title: 'Career guidance call', durationMin: 30, priceInr: 499, weekly: [1, 3, 5].map((day) => ({ day, from: '18:00', to: '20:00' })).concat([{ day: 6, from: '10:00', to: '13:00' }]), bufferMin: 10, noticeHours: 4, horizonDays: 14, active: true });
  G.products.push(
    { id: 'pr_seo_notes', tenantId, title: 'SEO checklist 2027 (PDF)', description: '42-point on-page + technical checklist we use for client sites.', kind: 'notes', priceInr: 199, files: [{ name: 'seo-checklist-2027.pdf', sizeMb: 2.1 }], downloadLimit: 5, status: 'published', sales: 38, createdAt: ago(20) },
    { id: 'pr_ads_templates', tenantId, title: 'Meta Ads copy templates', description: '60 ad copy templates for local businesses, in English and Tamil.', kind: 'template', priceInr: 349, files: [{ name: 'ad-templates.xlsx', sizeMb: 0.4 }, { name: 'how-to-use.pdf', sizeMb: 0.8 }], downloadLimit: 5, status: 'published', sales: 12, createdAt: ago(9) },
  );
  const site = G.sites.find((s) => s.tenantId === tenantId)!;
  site.sections.forEach((s) => { if (['testimonials', 'webinars', 'products', 'bookings', 'faq', 'lead_form'].includes(s.kind)) s.visible = true; });
  site.sections.find((s) => s.kind === 'testimonials')!.items = [{ q: 'Arjun Kumar', a: 'Got my first freelance SEO client in week 6.' }, { q: 'Nisha P', a: 'The live classes and doubt sessions made it easy.' }];
  site.contact = { phone: '9876543210', email: 'hello@rajeshacademy.in', address: 'Anna Nagar, Madurai' };
  site.tracking = { ga4: 'G-BODHIN123' };
  const [ann, gen] = G.channels.filter((c) => c.tenantId === tenantId);
  G.posts.push(
    { id: uid('po'), tenantId, channelId: ann.id, authorId: 'u_rajesh', authorName: 'Rajesh Kumar', authorRole: 'owner', text: 'Saturday live class moves to 11 AM this week. Recording will be up the same evening.', pinned: true, reactions: { '👍': ['u_arjun'] }, reports: [], at: ago(1) },
    { id: uid('po'), tenantId, channelId: gen.id, authorId: 'u_arjun', authorName: 'Arjun Kumar', authorRole: 'student', text: 'Anyone tried the new GA4 exploration report? Sharing my notes after class.', reactions: { '💡': ['u_meera'] }, reports: [], at: ago(0, 6) },
  );
}

/* ───────────── guards ───────────── */
function ctxOf(userId: string, feature?: Feature, ownerOnly = false) {
  const ctx = educator.context(userId);
  if (!ctx) throw new ApiError('forbidden', 'Only educators can use this.');
  if (ctx.locked) throw new ApiError('locked', `${ctx.gate.title}. ${ctx.gate.message}`);
  if (ownerOnly && ctx.role !== 'owner') throw new ApiError('forbidden', 'Only the workspace owner can see or change this.');
  if (feature && !ctx.ent.has(feature)) throw new ApiError('plan', `${FEATURE_PLAN[feature] ?? 'This feature'} — upgrade in Subscription & usage.`);
  return ctx;
}
const FEATURE_PLAN: Partial<Record<Feature, string>> = {
  digital_products: 'Digital products', bookings: '1:1 bookings', website: 'Website',
  webinars: 'Webinars need the Creator plan', community: 'Community needs the Creator plan', broadcast: 'Broadcasts need the Creator plan',
  crm: 'Leads CRM needs the Growth plan', automations: 'Automations need the Growth plan', emi: 'EMI needs the Growth plan', website_pro: 'This website option needs the Growth plan',
};
const tenantById = (id: string) => db.tenants.find((t) => t.id === id);
const entOfTenant = (tenantId: string) => {
  const owner = tenantById(tenantId)?.ownerUserId;
  return owner ? educator.context(owner)?.ent : undefined;
};
const tenantHas = (tenantId: string, f: Feature) => !!entOfTenant(tenantId)?.has(f);
const courseTitle = (id?: string) => seedCourses.find((c) => c.id === id)?.title ?? '';
const userName = (id: string) => db.users.find((u) => u.id === id)?.name ?? 'Learner';
const invoiceNo = (tenantId: string) => `${(tenantById(tenantId)?.slug ?? 'edu').toUpperCase()}-${new Date().getFullYear()}-G${String(g().sales.length + 101).padStart(4, '0')}`;

/** Tools overview for the educator "Grow" hub: what is on, what plan unlocks the rest. */
export const growHub = {
  get(userId: string) {
    const ctx = ctxOf(userId);
    const G = g();
    const T = ctx.tenant.id;
    const st = pipelineStats(G.leads.filter((l) => l.tenantId === T));
    const tool = (key: string, f: Feature, title: string, sub: string, icon: string, href: string, plan: string) => ({ key, title, sub, icon, href, on: ctx.ent.has(f), off: ctx.ent.off(f), plan });
    const sales = G.sales.filter((s) => s.tenantId === T);
    return {
      ctx,
      revenue30: sales.filter((s) => new Date(s.at).getTime() > Date.now() - 30 * 864e5).reduce((s, x) => s + x.amountInr, 0),
      tools: [
        tool('crm', 'crm', 'Leads CRM', st.due ? `${st.due} follow-up${st.due === 1 ? '' : 's'} due · ${st.open} open` : `${st.open} open leads · ${st.winRate}% joined`, 'funnel-outline', '/edu/leads', 'Growth'),
        tool('automations', 'automations', 'Automations', `${G.automations.filter((a) => a.tenantId === T && a.enabled).length} running`, 'flash-outline', '/edu/automations', 'Growth'),
        tool('broadcast', 'broadcast', 'Email & push broadcasts', `${G.broadcasts.filter((b) => b.tenantId === T && b.status === 'scheduled').length} scheduled`, 'megaphone-outline', '/edu/broadcasts', 'Creator'),
        tool('emi', 'emi', 'EMI & fee collection', `${G.emiContracts.filter((c) => c.tenantId === T && c.status === 'active').length} students on EMI`, 'calendar-number-outline', '/edu/emi', 'Growth'),
        tool('webinars', 'webinars', 'Webinars', `${G.webinars.filter((w) => w.tenantId === T && webinarState(w) === 'upcoming').length} upcoming`, 'easel-outline', '/edu/webinars', 'Creator'),
        tool('bookings', 'bookings', '1:1 bookings', `${G.bookings.filter((b) => b.tenantId === T && b.status === 'confirmed' && new Date(b.startsAt).getTime() > Date.now()).length} upcoming`, 'calendar-outline', '/edu/bookings', 'Starter'),
        tool('products', 'digital_products', 'Digital products', `${G.products.filter((p) => p.tenantId === T && p.status === 'published').length} on sale`, 'download-outline', '/edu/products', 'Starter'),
        tool('site', 'website', 'Website builder', `${ctx.host}${G.sites.find((s) => s.tenantId === T)?.published ? '' : ' · unpublished'}`, 'globe-outline', '/edu/site', 'Starter'),
        tool('community', 'community', 'Community', `${G.channels.filter((c) => c.tenantId === T).length} channels`, 'people-outline', '/edu/community', 'Creator'),
      ],
    };
  },
};

/* ───────────── messaging engine (automations + broadcasts share it) ───────────── */
interface Recipient { userId?: string; email?: string; name: string }
function optedIn(r: Recipient) {
  return r.userId ? !!db.settings[r.userId]?.push?.offers : true; // no app account → email with unsubscribe link
}
function queue(tenantId: string, to: Recipient, channel: Channel, subject: string, body: string, source: { kind: 'automation' | 'broadcast'; id: string }) {
  const G = g();
  const chans: ('email' | 'push')[] = channel === 'both' ? ['email', 'push'] : [channel];
  let n = 0;
  for (const ch of chans) {
    if (ch === 'push' && !to.userId) continue;
    if (ch === 'email' && !to.email) continue;
    G.outbox.push({ id: uid('ob'), tenantId, to, channel: ch, subject, body, source, status: 'sent_test', at: now() });
    if (ch === 'push' && to.userId) notifyUser(to.userId, 'course', subject, body);
    n += 1;
  }
  if (G.outbox.length > 2000) G.outbox.splice(0, G.outbox.length - 2000);
  return n;
}
/** Fire an automation for one person (real: database trigger / cron → worker). Returns messages queued. */
export function fireAutomation(tenantId: string, trigger: Trigger, to: Recipient, vars: TemplateVars) {
  if (!tenantHas(tenantId, 'automations')) return 0;
  const a = g().automations.find((x) => x.tenantId === tenantId && x.trigger === trigger && x.enabled);
  if (!a) return 0;
  const meta = TRIGGERS.find((t) => t.id === trigger)!;
  if (!meta.transactional && !optedIn(to)) return 0;
  const t = tenantById(tenantId)!;
  const v = { academy: t.branding.displayName, name: to.name.split(' ')[0], link: `https://${t.customDomain ?? `${t.slug}.thebodhin.com`}`, ...vars };
  const n = queue(tenantId, to, a.channel, renderTemplate(a.subject, v), renderTemplate(a.body, v), { kind: 'automation', id: a.id });
  if (n) a.sent += 1;
  return n;
}

/* ───────────── Leads CRM ───────────── */
export const leadsApi = {
  list(userId: string, filter: LeadStage | 'all' | 'due', q = '') {
    const ctx = ctxOf(userId, 'crm');
    const all = g().leads.filter((l) => l.tenantId === ctx.tenant.id);
    const s = q.trim().toLowerCase();
    const st = pipelineStats(all);
    const rows = all
      .filter((l) => filter === 'all' || (filter === 'due' ? ['overdue', 'today'].includes(followState(l)) : l.stage === filter))
      .filter((l) => !s || [l.name, l.phone, l.email, courseTitle(l.courseId)].some((x) => x?.toLowerCase().includes(s)))
      .sort((a, b) => (a.nextFollowUpAt ?? '9').localeCompare(b.nextFollowUpAt ?? '9') || b.updatedAt.localeCompare(a.updatedAt));
    return { ctx, rows: rows.map((l) => ({ l, course: courseTitle(l.courseId), follow: followState(l) })), stats: st, stages: LEAD_STAGES, courses: seedCourses.filter((c) => c.tenantId === ctx.tenant.id) };
  },
  get(userId: string, id: string) {
    const ctx = ctxOf(userId, 'crm');
    const l = g().leads.find((x) => x.id === id && x.tenantId === ctx.tenant.id);
    if (!l) throw new ApiError('not_found', 'This lead was removed.');
    return { l, course: courseTitle(l.courseId), follow: followState(l), courses: seedCourses.filter((c) => c.tenantId === ctx.tenant.id) };
  },
  create(userId: string, input: { name: string; phone: string; email?: string; courseId?: string; source: LeadSource; note?: string }) {
    const ctx = ctxOf(userId, 'crm');
    return addLead(ctx.tenant.id, input, userName(userId));
  },
  move(userId: string, id: string, stage: LeadStage, opts: { lostReason?: string } = {}) {
    const { l } = leadsApi.get(userId, id);
    if (!canMove(l.stage, stage)) throw new ApiError('stage', l.stage === 'lost' ? 'Re-open the lead (Contacted) before marking it Joined.' : 'Already in this stage.');
    if (stage === 'lost' && !opts.lostReason) throw new ApiError('reason', 'Pick why this lead was lost — it shows you what to fix.', 'reason');
    l.notes.push({ at: now(), text: `Moved ${LEAD_STAGES.find((s) => s.id === l.stage)!.label} → ${LEAD_STAGES.find((s) => s.id === stage)!.label}${opts.lostReason ? ` (${opts.lostReason})` : ''}`, by: userName(userId) });
    l.stage = stage;
    l.lostReason = stage === 'lost' ? opts.lostReason : undefined;
    if (stage === 'won' || stage === 'lost') l.nextFollowUpAt = undefined;
    l.updatedAt = now();
    persist();
  },
  note(userId: string, id: string, text: string) {
    const { l } = leadsApi.get(userId, id);
    const t = text.trim();
    if (!t) throw new ApiError('note', 'Write a note first.', 'note');
    l.notes.push({ at: now(), text: t.slice(0, 500), by: userName(userId) });
    if (l.stage === 'new') l.stage = 'contacted';
    l.updatedAt = now();
    persist();
  },
  followUp(userId: string, id: string, at: string | null) {
    const { l } = leadsApi.get(userId, id);
    if (at && new Date(at).getTime() < Date.now() - 60e3) throw new ApiError('date', 'Pick a time in the future.', 'date');
    l.nextFollowUpAt = at ?? undefined;
    l.updatedAt = now();
    persist();
  },
  bookDemo(userId: string, id: string, at: string) {
    const { l } = leadsApi.get(userId, id);
    if (new Date(at).getTime() < Date.now()) throw new ApiError('date', 'Demo time must be in the future.', 'date');
    l.demoAt = at;
    l.stage = 'demo';
    l.nextFollowUpAt = at;
    l.notes.push({ at: now(), text: `Demo booked for ${new Date(at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`, by: userName(userId) });
    l.updatedAt = now();
    persist();
  },
  remove(userId: string, id: string) {
    const ctx = ctxOf(userId, 'crm', true);
    const G = g();
    G.leads = G.leads.filter((x) => !(x.id === id && x.tenantId === ctx.tenant.id));
    persist();
  },
  csv(userId: string) {
    const { rows } = leadsApi.list(userId, 'all');
    const esc = (s = '') => `"${s.replace(/"/g, '""')}"`;
    return ['Name,Phone,Email,Course,Source,Stage,Next follow-up,Created', ...rows.map(({ l, course }) => [esc(l.name), l.phone, esc(l.email), esc(course), l.source, l.stage, l.nextFollowUpAt ?? '', l.createdAt].join(','))].join('\n');
  },
};
function followState(l: Lead) {
  return l.stage === 'won' || l.stage === 'lost' || !l.nextFollowUpAt ? 'none' : new Date(l.nextFollowUpAt).getTime() < Date.now() ? (new Date(l.nextFollowUpAt).toDateString() === new Date().toDateString() ? 'today' : 'overdue') : new Date(l.nextFollowUpAt).toDateString() === new Date().toDateString() ? 'today' : 'later';
}
function addLead(tenantId: string, input: { name: string; phone: string; email?: string; courseId?: string; source: LeadSource; note?: string }, by: string) {
  const name = input.name.trim();
  if (name.length < 2) throw new ApiError('name', 'Enter the person’s name.', 'name');
  const phone = normPhone(input.phone);
  if (!phone) throw new ApiError('phone', 'Enter a valid 10-digit mobile number.', 'phone');
  if (input.email && !validEmail(input.email)) throw new ApiError('email', 'Enter a valid email or leave it empty.', 'email');
  const G = g();
  const dup = G.leads.find((l) => l.tenantId === tenantId && l.phone === phone);
  if (dup) {
    dup.notes.push({ at: now(), text: `Enquired again${input.courseId ? ` about ${courseTitle(input.courseId)}` : ''} (${input.source}).`, by });
    if (dup.stage === 'lost') dup.stage = 'new';
    dup.updatedAt = now();
    persist();
    return { id: dup.id, duplicate: true };
  }
  const l: Lead = { id: uid('ld'), tenantId, name: name.slice(0, 80), phone, email: input.email?.trim() || undefined, courseId: input.courseId, source: input.source, stage: 'new', notes: input.note?.trim() ? [{ at: now(), text: input.note.trim().slice(0, 500), by }] : [], nextFollowUpAt: ahead(0, 2), createdAt: now(), updatedAt: now() };
  G.leads.push(l);
  fireAutomation(tenantId, 'lead_created', { name: l.name, email: l.email }, { course: courseTitle(l.courseId) || 'our courses' });
  const owner = tenantById(tenantId)?.ownerUserId;
  if (owner && by === 'Website form') notifyUser(owner, 'system', 'New enquiry 📩', `${l.name} asked about ${courseTitle(l.courseId) || 'your courses'}. Call within an hour — fast replies convert best.`, { pathname: '/edu/lead/[id]', params: { id: l.id } });
  persist();
  return { id: l.id, duplicate: false };
}

/* ───────────── Automations ───────────── */
export const automationsApi = {
  list(userId: string) {
    const ctx = ctxOf(userId, 'automations');
    const rows = g().automations.filter((a) => a.tenantId === ctx.tenant.id).map((a) => ({ a, meta: TRIGGERS.find((t) => t.id === a.trigger)! }));
    return { ctx, rows, log: g().outbox.filter((m) => m.tenantId === ctx.tenant.id && m.source.kind === 'automation').slice(-30).reverse() };
  },
  toggle(userId: string, id: string, on: boolean) {
    const ctx = ctxOf(userId, 'automations', true);
    const a = g().automations.find((x) => x.id === id && x.tenantId === ctx.tenant.id);
    if (a) { a.enabled = on; a.updatedAt = now(); }
    persist();
  },
  save(userId: string, id: string, input: { channel: Channel; subject: string; body: string }) {
    const ctx = ctxOf(userId, 'automations', true);
    const a = g().automations.find((x) => x.id === id && x.tenantId === ctx.tenant.id);
    if (!a) throw new ApiError('not_found', 'Automation not found.');
    validateMsg(input.subject, input.body);
    Object.assign(a, { channel: input.channel, subject: input.subject.trim(), body: input.body.trim(), updatedAt: now() } satisfies Partial<Automation>);
    persist();
  },
  /** Send the message to the owner only, so they see exactly what students get. */
  test(userId: string, id: string) {
    const ctx = ctxOf(userId, 'automations');
    const a = g().automations.find((x) => x.id === id && x.tenantId === ctx.tenant.id);
    if (!a) throw new ApiError('not_found', 'Automation not found.');
    const u = db.users.find((x) => x.id === userId)!;
    const v = sampleVars(ctx.tenant.id, u.name);
    return queue(ctx.tenant.id, { userId, email: u.email, name: u.name }, a.channel, `[Test] ${renderTemplate(a.subject, v)}`, renderTemplate(a.body, v), { kind: 'automation', id: a.id });
  },
  preview(tenantId: string, subject: string, body: string) {
    const v = sampleVars(tenantId, 'Arjun Kumar');
    return { subject: renderTemplate(subject, v), body: renderTemplate(body, v), unknown: [...unknownVars(subject), ...unknownVars(body)] };
  },
};
function sampleVars(tenantId: string, name: string): TemplateVars {
  const t = tenantById(tenantId)!;
  return { name: name.split(' ')[0], course: seedCourses.find((c) => c.tenantId === tenantId)?.title ?? 'Your course', academy: t.branding.displayName, date: new Date(Date.now() + 864e5).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), time: '7:00 PM', amount: '₹5,833', link: `https://${t.customDomain ?? `${t.slug}.thebodhin.com`}` };
}
function validateMsg(subject: string, body: string) {
  if (!subject.trim()) throw new ApiError('subject', 'Add a subject / title.', 'subject');
  if (subject.length > MSG_LIMITS.titleMax) throw new ApiError('subject', `Keep the title under ${MSG_LIMITS.titleMax} characters.`, 'subject');
  if (body.trim().length < 5) throw new ApiError('body', 'Write the message.', 'body');
  if (body.length > MSG_LIMITS.bodyMax) throw new ApiError('body', `Keep the message under ${MSG_LIMITS.bodyMax} characters.`, 'body');
  const bad = [...unknownVars(subject), ...unknownVars(body)];
  if (bad.length) throw new ApiError('body', `Unknown variable {{${bad[0]}}}. Use name, course, academy, date, time, amount or link.`, 'body');
}

/* ───────────── Broadcasts ───────────── */
function audienceOf(tenantId: string, a: Audience): Recipient[] {
  const people = db.people.filter((p) => p.tenantId === tenantId);
  const fromPeople = (ps: typeof people) => ps.map((p) => ({ userId: p.userId, email: p.email, name: p.name }));
  switch (a.kind) {
    case 'all_students': return fromPeople(people);
    case 'course': return fromPeople(people.filter((p) => p.courses.some((c) => c.courseId === a.courseId)));
    case 'batch': return fromPeople(people.filter((p) => p.courses.some((c) => c.batchId === a.batchId)));
    case 'leads': return g().leads.filter((l) => l.tenantId === tenantId && (!a.stage || l.stage === a.stage) && l.email).map((l) => ({ email: l.email, name: l.name }));
    case 'webinar': return (g().webinars.find((w) => w.id === a.webinarId && w.tenantId === tenantId)?.registrations ?? []).map((r) => ({ userId: r.userId, email: r.email, name: r.name }));
  }
}
export const broadcastsApi = {
  list(userId: string) {
    const ctx = ctxOf(userId, 'broadcast');
    const T = ctx.tenant.id;
    runDue();
    return {
      ctx,
      rows: g().broadcasts.filter((b) => b.tenantId === T).sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt)),
      courses: seedCourses.filter((c) => c.tenantId === T),
      batches: db.batches.filter((b) => b.tenantId === T),
      webinars: g().webinars.filter((w) => w.tenantId === T),
      leadsOn: ctx.ent.has('crm'),
      sentToday: g().broadcasts.filter((b) => b.tenantId === T && b.status !== 'cancelled' && new Date(b.createdAt).toDateString() === new Date().toDateString()).length,
    };
  },
  count(userId: string, a: Audience, marketing: boolean) {
    const ctx = ctxOf(userId, 'broadcast');
    const all = audienceOf(ctx.tenant.id, a);
    const ok = marketing ? all.filter(optedIn) : all;
    return { total: all.length, reach: ok.length, skipped: all.length - ok.length };
  },
  create(userId: string, input: { title: string; body: string; channel: Channel; audience: Audience; marketing: boolean; scheduledAt?: string }) {
    const ctx = ctxOf(userId, 'broadcast', true);
    const T = ctx.tenant.id;
    validateMsg(input.title, input.body);
    if (input.audience.kind === 'leads' && !ctx.ent.has('crm')) throw new ApiError('plan', 'Sending to leads needs the Growth plan (Leads CRM).');
    if (broadcastsApi.list(userId).sentToday >= MSG_LIMITS.broadcastsPerDay) throw new ApiError('limit', `You can send ${MSG_LIMITS.broadcastsPerDay} broadcasts a day. This keeps your emails out of spam folders.`);
    const when = input.scheduledAt ? new Date(input.scheduledAt).getTime() : Date.now();
    if (when < Date.now() - 60e3) throw new ApiError('date', 'Schedule time is in the past.', 'date');
    const c = broadcastsApi.count(userId, input.audience, input.marketing);
    if (!c.reach) throw new ApiError('audience', c.total ? 'Everyone in this group has turned off offers. Untick “Marketing” only if this is a class or fee update.' : 'No one is in this group yet.', 'audience');
    if (c.reach > MSG_LIMITS.recipientsPerBroadcast) throw new ApiError('audience', `Up to ${MSG_LIMITS.recipientsPerBroadcast.toLocaleString('en-IN')} people per broadcast.`, 'audience');
    const b: Broadcast = { id: uid('bc'), tenantId: T, title: input.title.trim(), body: input.body.trim(), channel: input.channel, audience: input.audience, marketing: input.marketing, status: 'scheduled', scheduledAt: new Date(when).toISOString(), recipients: 0, skippedOptOut: 0, opens: 0, createdAt: now() };
    g().broadcasts.push(b);
    if (when <= Date.now() + 60e3) deliver(b);
    persist();
    return b;
  },
  cancel(userId: string, id: string) {
    const ctx = ctxOf(userId, 'broadcast', true);
    const b = g().broadcasts.find((x) => x.id === id && x.tenantId === ctx.tenant.id);
    if (!b || b.status !== 'scheduled') throw new ApiError('state', 'Only scheduled broadcasts can be cancelled.');
    b.status = 'cancelled';
    persist();
  },
};
function deliver(b: Broadcast) {
  const all = audienceOf(b.tenantId, b.audience);
  const ok = b.marketing ? all.filter(optedIn) : all;
  const footer = b.marketing ? '\n\nYou get this because you learn with us. Unsubscribe in Profile → Notifications.' : '';
  const academy = tenantById(b.tenantId)!.branding.displayName;
  ok.forEach((r) => { const v = { name: r.name.split(' ')[0], academy }; queue(b.tenantId, r, b.channel, renderTemplate(b.title, v), renderTemplate(b.body, v) + footer, { kind: 'broadcast', id: b.id }); });
  b.recipients = ok.length;
  b.skippedOptOut = all.length - ok.length;
  b.status = 'sent';
  b.sentAt = now();
}
function runDue() {
  g().broadcasts.filter((b) => b.status === 'scheduled' && new Date(b.scheduledAt).getTime() <= Date.now()).forEach(deliver);
}

/* ───────────── EMI ───────────── */
export const emiApi = {
  /** Educator: EMI settings per paid course + every student's instalment status. */
  overview(userId: string) {
    const ctx = ctxOf(userId, 'emi');
    const T = ctx.tenant.id;
    const G = g();
    const courses = seedCourses.filter((c) => c.tenantId === T && c.priceInr >= EMI_MIN_PRICE);
    remindEmi(T);
    const rows = G.emiContracts.filter((c) => c.tenantId === T).map((c) => {
      const plan = G.emiPlans.find((p) => p.courseId === c.courseId);
      return { c, name: userName(c.userId), course: courseTitle(c.courseId), st: emiState(c, plan?.graceDays ?? 7) };
    });
    const order = { overdue: 0, due_soon: 1, on_track: 2, completed: 3 };
    rows.sort((a, b) => order[a.st.state] - order[b.st.state]);
    return {
      ctx,
      courses: courses.map((co) => ({ co, plan: G.emiPlans.find((p) => p.courseId === co.id) ?? null })),
      rows,
      totals: { pending: rows.reduce((s, r) => s + r.st.due, 0), overdue: rows.filter((r) => r.st.state === 'overdue').reduce((s, r) => s + (r.st.next?.amountInr ?? 0), 0), collected: rows.reduce((s, r) => s + r.st.paid, 0) },
    };
  },
  savePlan(userId: string, courseId: string, input: Omit<EmiPlan, 'courseId' | 'tenantId'>) {
    const ctx = ctxOf(userId, 'emi', true);
    const co = seedCourses.find((c) => c.id === courseId && c.tenantId === ctx.tenant.id);
    if (!co) throw new ApiError('not_found', 'Course not found.');
    if (co.priceInr < EMI_MIN_PRICE) throw new ApiError('price', `EMI is for courses of ${inr(EMI_MIN_PRICE)} or more.`);
    if (![2, 3, 4, 6].includes(input.parts)) throw new ApiError('parts', 'Choose 2, 3, 4 or 6 parts.', 'parts');
    if (input.feePct < 0 || input.feePct > 15) throw new ApiError('fee', 'EMI charge must be 0–15%. 0% shows as “No-cost EMI”.', 'fee');
    if (input.everyDays < 7 || input.everyDays > 60) throw new ApiError('every', 'Gap between instalments: 7–60 days.', 'every');
    const G = g();
    const i = G.emiPlans.findIndex((p) => p.courseId === courseId);
    const row = { ...input, courseId, tenantId: ctx.tenant.id };
    i >= 0 ? (G.emiPlans[i] = row) : G.emiPlans.push(row);
    persist();
  },
  /** Learner: EMI offer for a course (null when the academy hasn't enabled it). */
  offer(courseId: string, coupon?: string) {
    const co = seedCourses.find((c) => c.id === courseId);
    if (!co) return null;
    const plan = g().emiPlans.find((p) => p.courseId === courseId && p.enabled);
    if (!plan || !tenantHas(co.tenantId, 'emi')) return null;
    const q = commerce.quote(courseId, coupon);
    if (q.totalInr < EMI_MIN_PRICE) return null;
    return { plan, schedule: emiSchedule(q.totalInr, plan), totalInr: emiSchedule(q.totalInr, plan).reduce((s, i) => s + i.amountInr, 0), noCost: plan.feePct === 0 };
  },
  async start(input: { userId: string; courseId: string; coupon?: string; method: PaymentMethod; source: Parameters<typeof commerce.pay>[0]['source']; checkoutTenantId: string | null; failDemo?: boolean }) {
    const off = emiApi.offer(input.courseId, input.coupon);
    if (!off) throw new ApiError('emi_off', 'EMI is not available for this course.');
    const order = await commerce.pay({ ...input, instalmentInr: off.schedule[0].amountInr });
    const co = seedCourses.find((c) => c.id === input.courseId)!;
    const ins = off.schedule.map((s, i) => (i === 0 ? { ...s, paidAt: now(), orderId: order.id } : s));
    g().emiContracts.push({ id: uid('emi'), tenantId: co.tenantId, userId: input.userId, courseId: input.courseId, totalInr: off.totalInr, instalments: ins, createdAt: now(), status: 'active' });
    persist();
    return order;
  },
  /** Learner: my EMI plans (Payments screen + course banner). */
  mine(userId: string) {
    return g().emiContracts.filter((c) => c.userId === userId && c.status !== 'cancelled').map((c) => {
      const plan = g().emiPlans.find((p) => p.courseId === c.courseId);
      return { c, course: courseTitle(c.courseId), st: emiState(c, plan?.graceDays ?? 7), graceDays: plan?.graceDays ?? 7 };
    });
  },
  forCourse(userId: string, courseId: string) {
    return emiApi.mine(userId).find((x) => x.c.courseId === courseId) ?? null;
  },
  async payNext(userId: string, contractId: string, method: PaymentMethod, failDemo = false) {
    await wait(900);
    if (failDemo) throw new ApiError('payment_failed', 'Payment was declined by your bank. No money was taken.');
    const c = g().emiContracts.find((x) => x.id === contractId && x.userId === userId);
    if (!c) throw new ApiError('not_found', 'Plan not found.');
    const next = c.instalments.find((i) => !i.paidAt);
    if (!next) throw new ApiError('done', 'All instalments are already paid.');
    const first = db.orders.find((o) => o.id === c.instalments[0].orderId);
    const ratio = first && first.amountInr ? next.amountInr / first.amountInr : 1;
    const order = { ...(first ?? ({} as never)), id: uid('ord'), amountInr: next.amountInr, discountInr: 0, coupon: undefined, method, createdAt: now(), invoiceNo: `${first?.invoiceNo ?? 'EMI'}-${next.n}`, commissionInr: Math.round((first?.commissionInr ?? 0) * ratio), educatorShareInr: Math.round((first?.educatorShareInr ?? next.amountInr) * ratio), gatewayFeeInr: Math.round((first?.gatewayFeeInr ?? 0) * ratio) };
    db.orders.push(order);
    next.paidAt = now();
    next.orderId = order.id;
    if (c.instalments.every((i) => i.paidAt)) c.status = 'completed';
    const owner = tenantById(c.tenantId)?.ownerUserId;
    if (owner) notifyUser(owner, 'system', 'Instalment received 💰', `${userName(userId)} paid instalment ${next.n} of ${c.instalments.length} (${inr(next.amountInr)}) for “${courseTitle(c.courseId)}”.`, { pathname: '/edu/emi' });
    persist();
    return order;
  },
  /** Learner access check used by the player banner: paused only after the grace days. Progress is never deleted. */
  access(userId: string, courseId: string) {
    const m = emiApi.forCourse(userId, courseId);
    return m ? { paused: m.st.accessPaused, m } : { paused: false, m: null };
  },
};
/** Reminders run when the dashboard loads in the POC (real: a daily cron). One message per instalment per kind. */
function remindEmi(tenantId: string) {
  const G = g();
  for (const c of G.emiContracts.filter((x) => x.tenantId === tenantId && x.status === 'active')) {
    const st = emiState(c, 7);
    if (!st.next) continue;
    const kind: Trigger | null = st.state === 'overdue' ? 'fee_overdue' : st.state === 'due_soon' ? 'fee_due' : null;
    if (!kind) continue;
    const key = `${c.id}:${st.next.n}:${kind}`;
    if (G.outbox.some((m) => m.source.id === key)) continue;
    const u = db.users.find((x) => x.id === c.userId);
    if (!u) continue;
    const sent = fireAutomation(tenantId, kind, { userId: u.id, email: u.email, name: u.name }, { course: courseTitle(c.courseId), amount: inr(st.next.amountInr), date: new Date(st.next.dueAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) });
    if (sent) G.outbox.push({ id: uid('ob'), tenantId, to: { name: u.name }, channel: 'email', subject: 'marker', body: '', source: { kind: 'automation', id: key }, status: 'queued', at: now() });
  }
}

/* ───────────── shared checkout for webinars, bookings, products (direct sale → tutor's gateway, no commission) ───────────── */
async function charge(tenantId: string, userId: string, kind: Sale['kind'], refId: string, title: string, amountInr: number, method: PaymentMethod, failDemo?: boolean) {
  await wait(900);
  if (failDemo) throw new ApiError('payment_failed', 'Payment was declined by your bank. No money was taken. Try another method.');
  const t = tenantById(tenantId)!;
  if (amountInr > 0 && t.payments?.directGatewayStatus !== 'active') throw new ApiError('not_open', `${t.branding.displayName} hasn’t connected payments yet. Try again later.`);
  const s: Sale = { id: uid('sl'), tenantId, userId, kind, refId, title, amountInr, invoiceNo: amountInr ? invoiceNo(tenantId) : 'FREE', method: amountInr ? method : 'free', at: now() };
  g().sales.push(s);
  if (amountInr && t.ownerUserId) notifyUser(t.ownerUserId, 'system', 'New sale 🎉', `${userName(userId)} bought “${title}” (${inr(amountInr)}).`, { pathname: '/edu/grow' });
  return s;
}

/* ───────────── Webinars ───────────── */
export const webinarsApi = {
  list(userId: string) {
    const ctx = ctxOf(userId, 'webinars');
    return { ctx, rows: g().webinars.filter((w) => w.tenantId === ctx.tenant.id).map((w) => ({ w, state: webinarState(w) })).sort((a, b) => b.w.startsAt.localeCompare(a.w.startsAt)), courses: seedCourses.filter((c) => c.tenantId === ctx.tenant.id) };
  },
  save(userId: string, input: Omit<Webinar, 'id' | 'tenantId' | 'registrations' | 'createdAt' | 'status'> & { id?: string; publish: boolean }) {
    const ctx = ctxOf(userId, 'webinars', true);
    if (input.title.trim().length < 5) throw new ApiError('title', 'Give the webinar a clear title (5+ characters).', 'title');
    if (new Date(input.startsAt).getTime() < Date.now() + 15 * 60e3) throw new ApiError('date', 'Start time must be at least 15 minutes from now.', 'date');
    if (input.durationMin < 15 || input.durationMin > 240) throw new ApiError('duration', 'Duration: 15–240 minutes.', 'duration');
    if (input.priceInr !== 0 && (input.priceInr < 49 || input.priceInr > 9999)) throw new ApiError('price', 'Price: free, or ₹49–₹9,999.', 'price');
    if (input.priceInr > 0 && ctx.tenant.payments?.directGatewayStatus !== 'active') throw new ApiError('price', 'Connect your payment gateway (More → Payments setup) to sell paid webinars.', 'price');
    if (input.capacity < 10 || input.capacity > 1000) throw new ApiError('capacity', 'Seats: 10–1,000.', 'capacity');
    const G = g();
    const ex = input.id ? G.webinars.find((w) => w.id === input.id && w.tenantId === ctx.tenant.id) : undefined;
    if (ex && ex.registrations.length && ex.startsAt !== input.startsAt) ex.registrations.forEach((r) => r.userId && notifyUser(r.userId, 'course', 'Webinar time changed', `“${input.title}” now starts ${new Date(input.startsAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}.`));
    const base = { title: input.title.trim(), description: input.description.trim(), startsAt: input.startsAt, durationMin: input.durationMin, priceInr: input.priceInr, capacity: input.capacity, pitchCourseId: input.pitchCourseId, replay: input.replay, status: input.publish ? ('published' as const) : ('draft' as const) };
    if (ex) Object.assign(ex, base);
    else G.webinars.push({ ...base, id: uid('wb'), tenantId: ctx.tenant.id, registrations: [], createdAt: now() });
    persist();
  },
  cancel(userId: string, id: string) {
    const ctx = ctxOf(userId, 'webinars', true);
    const w = g().webinars.find((x) => x.id === id && x.tenantId === ctx.tenant.id);
    if (!w) return;
    w.status = 'cancelled';
    w.registrations.forEach((r) => r.userId && notifyUser(r.userId, 'course', 'Webinar cancelled', `“${w.title}” was cancelled.${w.priceInr ? ' Your payment will be refunded to the original method in 5–7 working days.' : ''}`));
    persist();
  },
  /** Public page (tenant site / share link). */
  publicGet(id: string, userId?: string) {
    const w = g().webinars.find((x) => x.id === id && x.status !== 'draft');
    if (!w) throw new ApiError('not_found', 'This webinar is not available.');
    const t = tenantById(w.tenantId)!;
    return { w, state: webinarState(w), academy: t.branding.displayName, slug: t.slug, seatsLeft: Math.max(0, w.capacity - w.registrations.length), registered: !!userId && w.registrations.some((r) => r.userId === userId), pitch: seedCourses.find((c) => c.id === w.pitchCourseId) ?? null, gateway: t.payments?.directGatewayStatus === 'active' };
  },
  async register(id: string, input: { userId?: string; name: string; email: string; phone?: string; method?: PaymentMethod; failDemo?: boolean }) {
    const p = webinarsApi.publicGet(id, input.userId);
    if (p.state !== 'upcoming' && p.state !== 'live') throw new ApiError('closed', 'Registration is closed.');
    if (p.registered) throw new ApiError('already', 'You are already registered.');
    if (!p.seatsLeft) throw new ApiError('full', 'All seats are taken.');
    if (input.name.trim().length < 2) throw new ApiError('name', 'Enter your name.', 'name');
    if (!validEmail(input.email)) throw new ApiError('email', 'Enter a valid email — the join link goes there.', 'email');
    if (input.phone && !normPhone(input.phone)) throw new ApiError('phone', 'Enter a valid 10-digit mobile number.', 'phone');
    const w = p.w;
    if (input.userId && w.registrations.some((r) => r.userId === input.userId)) throw new ApiError('already', 'You are already registered.');
    const s = await charge(w.tenantId, input.userId ?? 'guest', 'webinar', w.id, w.title, w.priceInr, input.method ?? 'upi', input.failDemo);
    w.registrations.push({ userId: input.userId, name: input.name.trim(), email: input.email.trim(), phone: input.phone ? normPhone(input.phone)! : undefined, at: now(), orderId: s.id });
    const when = new Date(w.startsAt);
    fireAutomation(w.tenantId, 'webinar_registered', { userId: input.userId, email: input.email, name: input.name }, { course: w.title, date: when.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), time: when.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) });
    // Every registrant becomes a lead (Nrich-style funnel) when the CRM is on.
    if (tenantHas(w.tenantId, 'crm') && input.phone) try { addLead(w.tenantId, { name: input.name, phone: input.phone, email: input.email, courseId: w.pitchCourseId, source: 'webinar' }, 'Webinar'); } catch { /* phone optional */ }
    persist();
    return s;
  },
};

/* ───────────── 1:1 bookings ───────────── */
export const bookingsApi = {
  list(userId: string) {
    const ctx = ctxOf(userId, 'bookings');
    const T = ctx.tenant.id;
    return { ctx, offers: g().offers.filter((o) => o.tenantId === T), upcoming: g().bookings.filter((b) => b.tenantId === T && b.status === 'confirmed' && new Date(b.endsAt).getTime() > Date.now()).sort((a, b) => a.startsAt.localeCompare(b.startsAt)), past: g().bookings.filter((b) => b.tenantId === T && (b.status !== 'confirmed' || new Date(b.endsAt).getTime() <= Date.now())).slice(-20).reverse() };
  },
  saveOffer(userId: string, input: Omit<BookingOffer, 'id' | 'tenantId'> & { id?: string }) {
    const ctx = ctxOf(userId, 'bookings', true);
    if (input.title.trim().length < 3) throw new ApiError('title', 'Name the session, e.g. “Career guidance call”.', 'title');
    if (!input.weekly.length) throw new ApiError('weekly', 'Pick at least one day.', 'weekly');
    if (!validWeekly(input.weekly)) throw new ApiError('weekly', 'Each day needs an end time after its start time.', 'weekly');
    if (input.priceInr !== 0 && (input.priceInr < 99 || input.priceInr > 49999)) throw new ApiError('price', 'Price: free, or ₹99–₹49,999.', 'price');
    if (input.priceInr > 0 && ctx.tenant.payments?.directGatewayStatus !== 'active') throw new ApiError('price', 'Connect your payment gateway to take paid bookings.', 'price');
    const G = g();
    const row = { ...input, title: input.title.trim(), id: input.id ?? uid('of'), tenantId: ctx.tenant.id };
    const i = G.offers.findIndex((o) => o.id === row.id && o.tenantId === ctx.tenant.id);
    i >= 0 ? (G.offers[i] = row) : G.offers.push(row);
    persist();
    return row.id;
  },
  cancelBooking(userId: string, id: string) {
    const ctx = ctxOf(userId, 'bookings');
    const b = g().bookings.find((x) => x.id === id && x.tenantId === ctx.tenant.id);
    if (!b || b.status !== 'confirmed') return;
    b.status = 'cancelled';
    notifyUser(b.userId, 'course', 'Session cancelled', `Your 1:1 on ${new Date(b.startsAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} was cancelled by the academy. Any payment is refunded in 5–7 working days.`);
    persist();
  },
  publicOffer(id: string) {
    const o = g().offers.find((x) => x.id === id && x.active);
    if (!o) throw new ApiError('not_found', 'This booking page is not available.');
    const t = tenantById(o.tenantId)!;
    return { o, academy: t.branding.displayName, slots: freeSlots(o, g().bookings.filter((b) => b.offerId === o.id)), gateway: t.payments?.directGatewayStatus === 'active' };
  },
  async book(id: string, userId: string, startsAt: string, method: PaymentMethod = 'upi', failDemo = false) {
    const p = bookingsApi.publicOffer(id);
    if (!p.slots.includes(startsAt)) throw new ApiError('slot', 'That slot was just taken. Pick another.');
    if (g().bookings.some((b) => b.userId === userId && b.offerId === id && b.status === 'confirmed' && new Date(b.startsAt).getTime() > Date.now())) throw new ApiError('already', 'You already have an upcoming session. Cancel it first to pick a new time.');
    const s = await charge(p.o.tenantId, userId, 'booking', p.o.id, p.o.title, p.o.priceInr, method, failDemo);
    const b: Booking = { id: uid('bk'), tenantId: p.o.tenantId, offerId: id, userId, name: userName(userId), startsAt, endsAt: new Date(new Date(startsAt).getTime() + p.o.durationMin * 60e3).toISOString(), status: 'confirmed', orderId: s.id, createdAt: now() };
    g().bookings.push(b);
    const u = db.users.find((x) => x.id === userId);
    const d = new Date(startsAt);
    fireAutomation(p.o.tenantId, 'booking_confirmed', { userId, email: u?.email, name: b.name }, { course: p.o.title, date: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), time: d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) });
    const owner = tenantById(p.o.tenantId)?.ownerUserId;
    if (owner) notifyUser(owner, 'system', 'New 1:1 booking 📅', `${b.name} booked “${p.o.title}” on ${d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}.`, { pathname: '/edu/bookings' });
    persist();
    return b;
  },
  mine(userId: string) {
    return g().bookings.filter((b) => b.userId === userId).sort((a, b) => b.startsAt.localeCompare(a.startsAt)).map((b) => ({ b, title: g().offers.find((o) => o.id === b.offerId)?.title ?? '1:1 session', academy: tenantById(b.tenantId)?.branding.displayName ?? '' }));
  },
  cancelMine(userId: string, id: string) {
    const b = g().bookings.find((x) => x.id === id && x.userId === userId);
    if (!b || b.status !== 'confirmed') return;
    if (new Date(b.startsAt).getTime() - Date.now() < 12 * 3600e3) throw new ApiError('late', 'Sessions can be cancelled up to 12 hours before. Message the academy for anything later.');
    b.status = 'cancelled';
    persist();
  },
};

/* ───────────── Digital products ───────────── */
export const productsApi = {
  list(userId: string) {
    const ctx = ctxOf(userId, 'digital_products');
    const rows = g().products.filter((p) => p.tenantId === ctx.tenant.id && p.status !== 'archived');
    return { ctx, rows, revenue: g().sales.filter((s) => s.tenantId === ctx.tenant.id && s.kind === 'product').reduce((s, x) => s + x.amountInr, 0) };
  },
  save(userId: string, input: { id?: string; title: string; description: string; kind: ProductKind; priceInr: number; files: { name: string; sizeMb: number }[]; downloadLimit: number; publish: boolean }) {
    const ctx = ctxOf(userId, 'digital_products', true);
    if (input.title.trim().length < 3 || input.title.length > PRODUCT_LIMITS.titleMax) throw new ApiError('title', `Title: 3–${PRODUCT_LIMITS.titleMax} characters.`, 'title');
    if (input.priceInr !== 0 && (input.priceInr < 19 || input.priceInr > 19999)) throw new ApiError('price', 'Price: free, or ₹19–₹19,999.', 'price');
    if (input.priceInr > 0 && input.publish && ctx.tenant.payments?.directGatewayStatus !== 'active') throw new ApiError('price', 'Connect your payment gateway to sell products.', 'price');
    if (!input.files.length && input.publish) throw new ApiError('files', 'Add at least one file before publishing.', 'files');
    if (input.files.length > PRODUCT_LIMITS.files) throw new ApiError('files', `Up to ${PRODUCT_LIMITS.files} files per product.`, 'files');
    if (input.files.some((f) => f.sizeMb > PRODUCT_LIMITS.fileMb)) throw new ApiError('files', `Each file must be under ${PRODUCT_LIMITS.fileMb} MB.`, 'files');
    const ent = ctx.ent.limits.storageGb;
    const used = (db.usage[ctx.tenant.id]?.storageGb ?? 0) + input.files.reduce((s, f) => s + f.sizeMb, 0) / 1024;
    if (ent != null && used > ent) throw new ApiError('storage', 'Not enough storage on your plan. Add a storage pack in Subscription & usage.', 'files');
    const G = g();
    const ex = input.id ? G.products.find((p) => p.id === input.id && p.tenantId === ctx.tenant.id) : undefined;
    const base = { title: input.title.trim(), description: input.description.trim(), kind: input.kind, priceInr: input.priceInr, files: input.files, downloadLimit: Math.max(1, Math.min(20, input.downloadLimit)), status: input.publish ? ('published' as const) : ('draft' as const) };
    if (ex) Object.assign(ex, base);
    else G.products.push({ ...base, id: uid('pr'), tenantId: ctx.tenant.id, sales: 0, createdAt: now() });
    persist();
  },
  archive(userId: string, id: string) {
    const ctx = ctxOf(userId, 'digital_products', true);
    const p = g().products.find((x) => x.id === id && x.tenantId === ctx.tenant.id);
    if (p) p.status = 'archived'; // buyers keep their downloads
    persist();
  },
  publicGet(id: string, userId?: string) {
    const p = g().products.find((x) => x.id === id && x.status === 'published');
    if (!p) throw new ApiError('not_found', 'This product is not available.');
    const t = tenantById(p.tenantId)!;
    const owned = userId ? g().purchases.find((x) => x.productId === id && x.userId === userId) ?? null : null;
    return { p, academy: t.branding.displayName, owned, gateway: t.payments?.directGatewayStatus === 'active' };
  },
  async buy(id: string, userId: string, method: PaymentMethod = 'upi', failDemo = false) {
    const x = productsApi.publicGet(id, userId);
    if (x.owned) throw new ApiError('already', 'You already own this. Open it from My purchases.');
    const s = await charge(x.p.tenantId, userId, 'product', x.p.id, x.p.title, x.p.priceInr, method, failDemo);
    g().purchases.push({ id: uid('pp'), productId: id, tenantId: x.p.tenantId, userId, orderId: s.id, downloads: 0, at: now() });
    x.p.sales += 1;
    persist();
    return s;
  },
  /** Returns a short-lived download link (real: signed storage URL, 10 min). */
  download(id: string, userId: string, file: string) {
    const pur = g().purchases.find((x) => x.productId === id && x.userId === userId);
    const p = g().products.find((x) => x.id === id);
    if (!pur || !p) throw new ApiError('forbidden', 'Buy this product to download it.');
    if (!p.files.some((f) => f.name === file)) throw new ApiError('not_found', 'File not found.');
    if (pur.downloads >= p.downloadLimit * p.files.length) throw new ApiError('limit', 'Download limit reached. Contact the academy if you lost the file.');
    pur.downloads += 1;
    persist();
    return { url: `https://files.thebodhin.com/${p.tenantId}/${p.id}/${encodeURIComponent(file)}?exp=${Date.now() + 600e3}`, left: p.downloadLimit * p.files.length - pur.downloads };
  },
  mine(userId: string) {
    return g().purchases.filter((x) => x.userId === userId).map((pur) => ({ pur, p: g().products.find((p) => p.id === pur.productId)!, academy: tenantById(pur.tenantId)?.branding.displayName ?? '' })).filter((x) => x.p);
  },
};

/* ───────────── Website builder ───────────── */
export const siteApi = {
  get(userId: string) {
    const ctx = ctxOf(userId, 'website');
    const site = g().sites.find((s) => s.tenantId === ctx.tenant.id)!;
    const availableCourses = [...seedCourses, ...db.courses]
      .filter((c, idx, arr) => arr.findIndex((x) => x.id === c.id) === idx && c.tenantId === ctx.tenant.id && c.status !== 'archived' && !!c.title?.trim())
      .map((c) => ({
        id: c.id,
        title: c.title,
        subtitle: c.subtitle || '',
        priceInr: c.priceInr ?? 0,
      }));
    return {
      ctx,
      site: JSON.parse(JSON.stringify(site)) as Site,
      pro: ctx.ent.has('website_pro'),
      courses: availableCourses,
      meta: SECTION_META.map((m) => ({ ...m, locked: (m.pro && !ctx.ent.has('website_pro')) || (!!m.needs && !ctx.ent.has(m.needs)) })),
    };
  },
  errors(userId: string, site: Site) {
    const ctx = ctxOf(userId, 'website');
    return siteErrors(site, ctx.ent.has('website_pro'));
  },
  save(userId: string, site: Site) {
    const ctx = ctxOf(userId, 'website', true);
    const pro = ctx.ent.has('website_pro');
    const e = siteErrors(site, pro);
    if (e.length) throw new ApiError(e[0].field, e[0].msg, e[0].field);
    if (!pro && site.sections.some((s, i) => s.kind !== defaultSite('', '', '').sections[i]?.kind)) throw new ApiError('sections', 'Re-ordering sections needs the Growth plan.', 'sections');
    for (const s of site.sections) {
      const m = SECTION_META.find((x) => x.kind === s.kind);
      if (s.visible && m?.needs && !ctx.ent.has(m.needs)) throw new ApiError('sections', `“${m.label}” needs a plan with ${m.needs.replace('_', ' ')}.`, 'sections');
      if ((s.heading?.length ?? 0) > 120 || (s.text?.length ?? 0) > 2500) throw new ApiError('sections', 'Headings up to 120 and text up to 2500 characters.', 'sections');
    }
    const G = g();
    const i = G.sites.findIndex((s) => s.tenantId === ctx.tenant.id);
    G.sites[i] = { ...site, tenantId: ctx.tenant.id, updatedAt: now() };
    persist();
  },
  /** Public render data for tutorslug.thebodhin.com (what visitors and Google see). */
  render(slug: string) {
    const cleanSlug = (slug || '').toLowerCase().trim();
    const t = db.tenants.find((x) => x.slug?.toLowerCase() === cleanSlug || x.customDomain?.toLowerCase() === cleanSlug || x.id === slug);
    if (!t) throw new ApiError('not_found', 'This academy site does not exist.');
    let site = g().sites?.find((s) => s.tenantId === t.id);
    if (!site) {
      site = defaultSite(t.id, t.branding?.displayName || t.slug || 'Academy', now());
      g().sites.push(site);
    }
    const has = (f: Feature) => tenantHas(t.id, f);
    const pro = has('website_pro');
    const visible = site.sections.filter((s) => s.visible).filter((s) => {
      const m = SECTION_META.find((x) => x.kind === s.kind);
      return !m || ((!m.pro || pro) && (!m.needs || has(m.needs)));
    });

    const allMyCourses = [...seedCourses, ...db.courses].filter(
      (c, idx, arr) =>
        arr.findIndex((x) => x.id === c.id) === idx &&
        c.tenantId === t.id &&
        c.status !== 'archived' &&
        !!c.title?.trim()
    );

    const selectedIds = site.selectedCourseIds;
    const storefrontCourses = selectedIds && selectedIds.length > 0
      ? allMyCourses.filter((c) => selectedIds.includes(c.id))
      : allMyCourses;

    return {
      t,
      site: { ...site, sections: visible, tracking: pro ? site.tracking : {} },
      courses: storefrontCourses.slice(0, 12),
      webinars: (g().webinars || []).filter((w) => w.tenantId === t.id && webinarState(w) === 'upcoming').slice(0, 4),
      products: (g().products || []).filter((p) => p.tenantId === t.id && p.status === 'published').slice(0, 6),
      offers: (g().offers || []).filter((o) => o.tenantId === t.id && o.active),
      stats: {
        students: db.people.filter((p) => p.tenantId === t.id).length + (db.usage[t.id]?.activeStudents ?? 0),
        courses: storefrontCourses.length,
      },
    };
  },
  submitLead(slug: string, input: { name: string; phone: string; email?: string; courseId?: string; hp?: string }) {
    if (input.hp) return { id: 'bot', duplicate: false }; // honeypot: bots fill hidden fields
    const t = db.tenants.find((x) => x.slug === slug || x.customDomain === slug);
    if (!t || !tenantHas(t.id, 'crm')) throw new ApiError('not_found', 'This form is closed.');
    return addLead(t.id, { ...input, source: 'website' }, 'Website form');
  },
};

/* ───────────── Community ───────────── */
function memberRole(userId: string, tenantId: string): Post['authorRole'] | null {
  const m = db.memberships.find((x) => x.userId === userId && x.tenantId === tenantId);
  if (m?.role === 'owner' || m?.role === 'tutor') return m.role;
  const enrolled = db.enrollments.some((e) => e.userId === userId && seedCourses.find((c) => c.id === e.courseId)?.tenantId === tenantId) || db.people.some((p) => p.tenantId === tenantId && p.userId === userId);
  return enrolled ? 'student' : null;
}
function canRead(userId: string, ch: Channel_) {
  const r = memberRole(userId, ch.tenantId);
  if (!r) return false;
  if (r !== 'student' || !ch.courseId) return true;
  return learning.isEnrolled(userId, ch.courseId) || db.people.some((p) => p.userId === userId && p.courses.some((c) => c.courseId === ch.courseId));
}
export const communityApi = {
  /** Everything the user can read, grouped by academy (learner) — or own workspace (educator). */
  spaces(userId: string) {
    const G = g();
    const tenants = [...new Set(G.channels.filter((c) => canRead(userId, c)).map((c) => c.tenantId))].filter((t) => tenantHas(t, 'community'));
    return tenants.map((tid) => ({ tenantId: tid, academy: tenantById(tid)!.branding.displayName, role: memberRole(userId, tid)!, channels: G.channels.filter((c) => c.tenantId === tid && canRead(userId, c)).map((c) => ({ c, posts: G.posts.filter((p) => p.channelId === c.id && !p.parentId && !p.hidden).length, last: G.posts.filter((p) => p.channelId === c.id && !p.hidden).at(-1)?.at })) }));
  },
  channel(userId: string, channelId: string) {
    const ch = g().channels.find((c) => c.id === channelId);
    if (!ch || !canRead(userId, ch) || !tenantHas(ch.tenantId, 'community')) throw new ApiError('forbidden', 'You can’t open this channel.');
    const role = memberRole(userId, ch.tenantId)!;
    const staff = role !== 'student';
    const all = g().posts.filter((p) => p.channelId === ch.id && (staff || !p.hidden));
    const top = all.filter((p) => !p.parentId).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.at.localeCompare(a.at));
    return { ch, role, staff, canPost: staff || !ch.announce, academy: tenantById(ch.tenantId)!.branding.displayName, posts: top.map((p) => ({ p, replies: all.filter((r) => r.parentId === p.id).sort((a, b) => a.at.localeCompare(b.at)) })) };
  },
  post(userId: string, channelId: string, text: string, parentId?: string) {
    const v = communityApi.channel(userId, channelId);
    const t = text.trim();
    if (!t) throw new ApiError('text', 'Write something first.', 'text');
    if (t.length > COMMUNITY_LIMITS.postMax) throw new ApiError('text', `Keep it under ${COMMUNITY_LIMITS.postMax} characters.`, 'text');
    if (!parentId && !v.canPost) throw new ApiError('forbidden', 'Only the academy posts here. You can reply and react.');
    if (parentId && !g().posts.some((p) => p.id === parentId && p.channelId === channelId)) throw new ApiError('not_found', 'That post was removed.');
    const spam = spamReason(t, v.role);
    if (spam) throw new ApiError('text', spam, 'text');
    const recent = g().posts.filter((p) => p.authorId === userId && Date.now() - new Date(p.at).getTime() < 60e3).length;
    if (recent >= COMMUNITY_LIMITS.postsPerMinute) throw new ApiError('slow', 'You’re posting fast — wait a minute.');
    const p: Post = { id: uid('po'), tenantId: v.ch.tenantId, channelId, authorId: userId, authorName: userName(userId), authorRole: v.role, text: t, parentId, reactions: {}, reports: [], at: now() };
    g().posts.push(p);
    if (parentId) {
      const parent = g().posts.find((x) => x.id === parentId)!;
      if (parent.authorId !== userId) notifyUser(parent.authorId, 'course', `${p.authorName} replied`, t.slice(0, 120), { pathname: '/community/[id]', params: { id: channelId } });
    }
    persist();
    return p;
  },
  react(userId: string, postId: string, emoji: string) {
    const p = g().posts.find((x) => x.id === postId);
    if (!p) return;
    communityApi.channel(userId, p.channelId);
    const list = (p.reactions[emoji] ??= []);
    const i = list.indexOf(userId);
    i >= 0 ? list.splice(i, 1) : list.push(userId);
    if (!list.length) delete p.reactions[emoji];
    persist();
  },
  report(userId: string, postId: string) {
    const p = g().posts.find((x) => x.id === postId);
    if (!p || p.authorId === userId) return;
    communityApi.channel(userId, p.channelId);
    if (!p.reports.includes(userId)) p.reports.push(userId);
    if (p.reports.length >= COMMUNITY_LIMITS.reportsToHide) p.hidden = true;
    persist();
  },
  /** Staff moderation: pin, hide/unhide, delete. */
  moderate(userId: string, postId: string, action: 'pin' | 'hide' | 'unhide' | 'delete') {
    const p = g().posts.find((x) => x.id === postId);
    if (!p) return;
    const v = communityApi.channel(userId, p.channelId);
    if (!v.staff && !(action === 'delete' && p.authorId === userId)) throw new ApiError('forbidden', 'Only the academy can moderate.');
    if (action === 'pin') p.pinned = !p.pinned;
    if (action === 'hide') p.hidden = true;
    if (action === 'unhide') { p.hidden = false; p.reports = []; }
    if (action === 'delete') g().posts = g().posts.filter((x) => x.id !== postId && x.parentId !== postId);
    persist();
  },
  /** Educator admin: channels for the workspace. */
  admin(userId: string) {
    const ctx = ctxOf(userId, 'community');
    const G = g();
    return { ctx, channels: G.channels.filter((c) => c.tenantId === ctx.tenant.id).map((c) => ({ c, posts: G.posts.filter((p) => p.channelId === c.id).length, flagged: G.posts.filter((p) => p.channelId === c.id && (p.hidden || p.reports.length)).length })), courses: seedCourses.filter((c) => c.tenantId === ctx.tenant.id) };
  },
  addChannel(userId: string, input: { name: string; courseId?: string; announce: boolean }) {
    const ctx = ctxOf(userId, 'community', true);
    const name = input.name.trim();
    if (name.length < 2 || name.length > 40) throw new ApiError('name', 'Channel name: 2–40 characters.', 'name');
    const G = g();
    if (G.channels.filter((c) => c.tenantId === ctx.tenant.id).length >= COMMUNITY_LIMITS.channels) throw new ApiError('limit', `Up to ${COMMUNITY_LIMITS.channels} channels.`);
    if (G.channels.some((c) => c.tenantId === ctx.tenant.id && c.name.toLowerCase() === name.toLowerCase())) throw new ApiError('name', 'A channel with this name exists.', 'name');
    G.channels.push({ id: uid('ch'), tenantId: ctx.tenant.id, name, courseId: input.courseId, announce: input.announce, createdAt: now() });
    persist();
  },
  removeChannel(userId: string, id: string) {
    const ctx = ctxOf(userId, 'community', true);
    const G = g();
    if (G.channels.filter((c) => c.tenantId === ctx.tenant.id).length <= 1) throw new ApiError('last', 'Keep at least one channel.');
    G.channels = G.channels.filter((c) => !(c.id === id && c.tenantId === ctx.tenant.id));
    G.posts = G.posts.filter((p) => p.channelId !== id);
    persist();
  },
};

/** Learner "My purchases": products, 1:1 sessions, webinars, EMI. */
export const myStuff = {
  get(userId: string) {
    const G = g();
    return {
      products: productsApi.mine(userId),
      bookings: bookingsApi.mine(userId),
      webinars: G.webinars.filter((w) => w.registrations.some((r) => r.userId === userId)).map((w) => ({ w, state: webinarState(w), academy: tenantById(w.tenantId)?.branding.displayName ?? '' })),
      emi: emiApi.mine(userId),
    };
  },
};

/** Test hook: lets tests reset only the growth store. */
export const __growthTest = { reset() { delete db.growth; }, store: () => g() };
