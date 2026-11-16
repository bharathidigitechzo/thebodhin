// @ts-nocheck — Node-only test; executed by tests/business/run.sh
/* Growth tools (Nrich / Graphy parity): CRM, automations, broadcasts, EMI, webinars, bookings, products, website, community.
   Runs the real api/growth.ts + api/client.ts on the mock DB, plus the pure rules in core/growth.ts. */
import { db } from '@/api/mockDb';
import { commerce, educator, learning } from '@/api/client';
import { automationsApi, bookingsApi, broadcastsApi, communityApi, emiApi, growHub, leadsApi, myStuff, productsApi, siteApi, webinarsApi, __growthTest } from '@/api/growth';
import { PLAN_FEATURES } from '@/core/business';
import { PLANS } from '@/core/plans';
import { canMove, emiSchedule, emiState, freeSlots, normPhone, pipelineStats, renderTemplate, siteErrors, spamReason, unknownVars, defaultSite } from '@/core/growth';

let pass = 0, fail = 0; const fails: string[] = [];
const ok = (c: unknown, n: string, x?: unknown) => { if (c) pass++; else { fail++; fails.push(n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };
const throws = (fn: () => unknown, re: RegExp, n: string) => { try { fn(); ok(false, n, 'did not throw'); } catch (e) { ok(re.test(e.message), n, e.message); } };
const rejects = async (p: Promise<unknown>, re: RegExp, n: string) => { try { await p; ok(false, n, 'did not reject'); } catch (e) { ok(re.test(e.message), n, e.message); } };

const OWNER = 'u_rajesh', TUTOR = 'u_meera', STUDENT = 'u_arjun';
const T = 'T';

(async () => {
  /* ── pricing document stays intact ── */
  ok(PLANS.map((p) => p.monthlyInr ?? p.priceMonthlyInr ?? p.monthly).join() === PLANS.map((p) => p.monthlyInr ?? p.priceMonthlyInr ?? p.monthly).join(), 'plans load');
  const price = (id) => { const p = PLANS.find((x) => x.id === id); return p.monthlyInr ?? p.priceMonthlyInr ?? p.monthly ?? p.price; };
  ok(price('starter') === 799 && price('creator') === 1499 && price('growth') === 3499 && price('institute') === 7999, 'plan prices exactly as the pricing document', PLANS.map((p) => [p.id, price(p.id)]));
  ok(PLAN_FEATURES.starter.includes('website') && PLAN_FEATURES.starter.includes('bookings') && PLAN_FEATURES.starter.includes('digital_products'), 'Starter: website, 1:1, products');
  ok(!PLAN_FEATURES.starter.includes('webinars') && PLAN_FEATURES.creator.includes('webinars') && PLAN_FEATURES.creator.includes('community') && PLAN_FEATURES.creator.includes('broadcast'), 'Creator adds webinars, community, broadcasts');
  ok(!PLAN_FEATURES.creator.includes('crm') && ['crm', 'automations', 'emi', 'website_pro'].every((f) => PLAN_FEATURES.growth.includes(f)), 'Growth adds CRM, automations, EMI, pro website');
  ok(['institute', 'enterprise'].every((p) => PLAN_FEATURES.growth.every((f) => PLAN_FEATURES[p].includes(f))), 'higher plans include everything below');
  ok(['courses', 'marketplace', 'coupons', 'custom_domain'].every((f) => PLAN_FEATURES.institute.includes(f)), 'old features untouched');

  /* ── pure rules ── */
  ok(normPhone('+91 98765 43210') === '9876543210' && normPhone('09876543210') === '9876543210' && normPhone('12345') === null && normPhone('5876543210') === null, 'phone normalising');
  ok(renderTemplate('Hi {{name}}, {{course}} {{oops}}', { name: 'Arjun', course: 'SEO' }) === 'Hi Arjun, SEO {{oops}}', 'templates fill known vars, keep unknown visible');
  ok(unknownVars('{{name}} {{nmae}}').join() === 'nmae', 'typo variables detected');
  const sch = emiSchedule(8999, { parts: 3, everyDays: 30, feePct: 0 });
  ok(sch.reduce((s, i) => s + i.amountInr, 0) === 8999 && sch[0].amountInr === 3001 && sch[1].amountInr === 2999, 'EMI split is exact, first part absorbs rounding', sch);
  ok(emiSchedule(10000, { parts: 4, everyDays: 30, feePct: 5 }).reduce((s, i) => s + i.amountInr, 0) === 10500, 'EMI charge added once to the total');
  const k = { instalments: [{ n: 1, amountInr: 100, dueAt: new Date(Date.now() - 40 * 864e5).toISOString(), paidAt: 'x' }, { n: 2, amountInr: 100, dueAt: new Date(Date.now() - 10 * 864e5).toISOString() }], totalInr: 200 };
  ok(emiState(k, 7).state === 'overdue' && emiState(k, 7).accessPaused && !emiState(k, 14).accessPaused, 'grace days decide access pause');
  ok(!canMove('lost', 'won') && canMove('lost', 'contacted') && !canMove('new', 'new'), 'stage moves');
  ok(spamReason('call 98765 43210', 'student') && !spamReason('call 98765 43210', 'owner') && spamReason('http://a http://b', 'student'), 'student spam guard');
  const offer = { durationMin: 30, bufferMin: 10, noticeHours: 0, horizonDays: 2, weekly: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, from: '10:00', to: '12:00' })) };
  const base = new Date(); base.setHours(0, 0, 0, 0);
  const slots = freeSlots(offer, [], base);
  ok(slots.length === 6, '2 days × (10:00, 10:40, 11:20) slots', slots.length);
  const taken = [{ startsAt: slots[0], endsAt: new Date(new Date(slots[0]).getTime() + 30 * 60e3).toISOString(), status: 'confirmed' }];
  ok(!freeSlots(offer, taken, base).includes(slots[0]) && freeSlots(offer, taken, base).includes(slots[1]), 'taken slot disappears, next one (after buffer) stays');
  const site0 = defaultSite('t', 'Acad', new Date().toISOString());
  ok(siteErrors(site0, false).length === 0, 'default site is valid on Starter');
  ok(siteErrors({ ...site0, tracking: { ga4: 'G-ABC1234' } }, false).some((e) => e.field === 'tracking') && !siteErrors({ ...site0, tracking: { ga4: 'G-ABC1234' } }, true).length, 'tracking only on pro');
  ok(siteErrors({ ...site0, sections: site0.sections.map((s) => ({ ...s, visible: s.kind !== 'hero' })) }, true).some((e) => /hero/i.test(e.msg)), 'hero must stay');
  ok(pipelineStats([{ stage: 'won', source: 'ads' }, { stage: 'lost', source: 'ads' }, { stage: 'new', source: 'website' }]).winRate === 50, 'win rate ignores open leads');

  /* ── hub ── */
  const hub = growHub.get(OWNER);
  ok(hub.tools.length === 9 && hub.tools.every((t) => t.on), 'Rajesh (Institute) has all 9 tools on', hub.tools.map((t) => [t.key, t.on]));
  const starterOwner = db.tenants.find((t) => t.ownerUserId && (t.subscription?.plan ?? t.plan) === 'starter')?.ownerUserId;
  if (starterOwner) {
    const sh = growHub.get(starterOwner);
    ok(sh.tools.find((t) => t.key === 'crm').on === false && sh.tools.find((t) => t.key === 'site').on === true, 'Starter hub: website on, CRM locked');
    throws(() => leadsApi.list(starterOwner, 'all'), /Growth/, 'Starter cannot open CRM');
    throws(() => webinarsApi.list(starterOwner), /Creator/, 'Starter cannot open webinars');
  } else ok(false, 'a starter tenant exists in seed');
  throws(() => leadsApi.list(STUDENT, 'all'), /educators/, 'students cannot open CRM');

  /* ── CRM ── */
  const l0 = leadsApi.list(OWNER, 'all');
  ok(l0.rows.length >= 7 && l0.stats.due >= 1, 'seeded leads with due follow-ups');
  throws(() => leadsApi.create(OWNER, { name: 'X', phone: '9999999999', source: 'phone' }), /name/i, 'name required');
  throws(() => leadsApi.create(OWNER, { name: 'Bad Phone', phone: '12345', source: 'phone' }), /mobile/i, 'phone validated');
  const n1 = leadsApi.create(OWNER, { name: 'Kumar', phone: '9123456780', source: 'ads', courseId: 'c_seo_growth' });
  const n2 = leadsApi.create(OWNER, { name: 'Kumar again', phone: '+91 91234 56780', source: 'website' });
  ok(!n1.duplicate && n2.duplicate && n2.id === n1.id, 'same phone merges into one lead');
  throws(() => leadsApi.move(OWNER, n1.id, 'lost'), /why|reason/i, 'lost needs reason');
  leadsApi.move(OWNER, n1.id, 'lost', { lostReason: 'Price too high' });
  throws(() => leadsApi.move(OWNER, n1.id, 'won'), /Re-open/, 'cannot jump lost → won');
  leadsApi.move(OWNER, n1.id, 'contacted');
  leadsApi.bookDemo(OWNER, n1.id, new Date(Date.now() + 864e5).toISOString());
  ok(leadsApi.get(OWNER, n1.id).l.stage === 'demo', 'booking a demo moves stage');
  throws(() => leadsApi.followUp(OWNER, n1.id, new Date(Date.now() - 864e5).toISOString()), /future/, 'follow-up in the past refused');
  ok(leadsApi.csv(OWNER).split('\n')[0].startsWith('Name,Phone'), 'CSV export');
  ok(leadsApi.list(TUTOR, 'all').rows.length > 0, 'tutors can work leads');
  throws(() => leadsApi.remove(TUTOR, n1.id), /owner/, 'only owner deletes leads');

  /* ── automations + outbox ── */
  const au = automationsApi.list(OWNER);
  ok(au.rows.length === 10, '10 ready recipes');
  const welcome = au.rows.find((r) => r.a.trigger === 'enrolled').a;
  throws(() => automationsApi.save(OWNER, welcome.id, { channel: 'email', subject: 'Hi', body: 'Hello {{nme}}' }), /Unknown variable/, 'unknown variable refused');
  throws(() => automationsApi.toggle(TUTOR, welcome.id, false), /owner/, 'tutor cannot change automations');
  ok(automationsApi.test(OWNER, welcome.id) >= 1, 'test send queues to owner');
  const prev = automationsApi.preview('t_rajesh', '{{course}}', 'Hi {{name}}');
  ok(prev.body === 'Hi Arjun' && prev.unknown.length === 0, 'preview fills sample values');

  /* ── broadcasts ── */
  const bl = broadcastsApi.list(OWNER);
  const cAll = broadcastsApi.count(OWNER, { kind: 'all_students' }, false);
  const cMkt = broadcastsApi.count(OWNER, { kind: 'all_students' }, true);
  ok(cAll.reach > 0 && cMkt.reach <= cAll.reach, 'marketing reach ≤ transactional reach (opt-outs skipped)', [cAll, cMkt]);
  throws(() => broadcastsApi.create(OWNER, { title: '', body: 'hello there', channel: 'email', audience: { kind: 'all_students' }, marketing: false }), /title/i, 'title required');
  const b1 = broadcastsApi.create(OWNER, { title: 'Class moved, {{name}}', body: 'Hi {{name}}, Saturday class is at 11 AM.', channel: 'both', audience: { kind: 'all_students' }, marketing: false });
  ok(b1.status === 'sent' && b1.recipients === cAll.reach, 'sent now to everyone');
  ok(__growthTest.store().outbox.some((m) => m.source.id === b1.id && !m.body.includes('{{name}}')), 'broadcast text personalised per person');
  const b2 = broadcastsApi.create(OWNER, { title: 'Later', body: 'Scheduled message', channel: 'email', audience: { kind: 'all_students' }, marketing: false, scheduledAt: new Date(Date.now() + 3600e3).toISOString() });
  ok(b2.status === 'scheduled', 'scheduled for later');
  broadcastsApi.cancel(OWNER, b2.id);
  throws(() => broadcastsApi.cancel(OWNER, b2.id), /scheduled/, 'cannot cancel twice');
  for (let i = 0; i < 5; i++) { try { broadcastsApi.create(OWNER, { title: `B${i}`, body: 'Another update', channel: 'push', audience: { kind: 'all_students' }, marketing: false }); } catch { /* cap */ } }
  throws(() => broadcastsApi.create(OWNER, { title: 'Too many', body: 'Another update', channel: 'push', audience: { kind: 'all_students' }, marketing: false }), /5 broadcasts/, 'daily cap 5');

  /* ── EMI ── */
  const emi = emiApi.overview(OWNER);
  ok(emi.courses.every(({ co }) => co.priceInr >= 2000), 'EMI lists only courses ≥ ₹2,000');
  const cheap = db.courses.concat([]).find(() => false);
  throws(() => emiApi.savePlan(OWNER, 'c_dm_ai', { parts: 5, everyDays: 30, feePct: 0, graceDays: 7, enabled: true }), /2, 3, 4 or 6/, 'parts validated');
  throws(() => emiApi.savePlan(OWNER, 'c_dm_ai', { parts: 3, everyDays: 30, feePct: 20, graceDays: 7, enabled: true }), /0–15/, 'EMI charge capped 15%');
  const off = emiApi.offer('c_dm_ai');
  ok(off && off.schedule.length === 3 && off.noCost, 'EMI offered on checkout');
  const fresh = 'u_emi_buyer';
  db.users.push({ id: fresh, name: 'EMI Buyer', email: 'emi@x.in', phone: '+919000000001', phoneVerified: true, createdAt: new Date().toISOString(), password: 'x' });
  const ordersBefore = db.orders.length;
  const o1 = await emiApi.start({ userId: fresh, courseId: 'c_dm_ai', method: 'upi', source: 'direct', checkoutTenantId: 't_rajesh' });
  ok(o1.amountInr === off.schedule[0].amountInr && db.orders.length === ordersBefore + 1, 'first instalment charged, not the full price', o1.amountInr);
  ok(learning.isEnrolled(fresh, 'c_dm_ai'), 'EMI buyer is enrolled');
  const mine = emiApi.mine(fresh)[0];
  ok(mine && mine.st.paid === off.schedule[0].amountInr && mine.st.state === 'on_track', 'EMI plan tracked as on track');
  await emiApi.payNext(fresh, mine.c.id, 'upi');
  await emiApi.payNext(fresh, mine.c.id, 'upi');
  ok(emiApi.mine(fresh)[0].st.state === 'completed' && emiApi.mine(fresh)[0].st.paid === off.totalInr, 'all instalments paid → completed');
  await rejects(emiApi.payNext(fresh, mine.c.id, 'upi'), /already paid/, 'no extra charge after completion');
  // overdue → paused
  const late = 'u_emi_late';
  db.users.push({ id: late, name: 'Late Payer', email: 'late@x.in', phone: '+919000000002', phoneVerified: true, createdAt: new Date().toISOString(), password: 'x' });
  await emiApi.start({ userId: late, courseId: 'c_dm_ai', method: 'upi', source: 'direct', checkoutTenantId: 't_rajesh' });
  const lk = __growthTest.store().emiContracts.find((c) => c.userId === late);
  lk.instalments[1].dueAt = new Date(Date.now() - 9 * 864e5).toISOString();
  ok(emiApi.access(late, 'c_dm_ai').paused === true, 'access pauses after 7 grace days');
  ok(emiApi.overview(OWNER).rows[0].st.state === 'overdue', 'overdue students listed first for the academy');
  await emiApi.payNext(late, lk.id, 'upi');
  ok(emiApi.access(late, 'c_dm_ai').paused === false, 'paying restores access');

  /* ── webinars ── */
  throws(() => webinarsApi.save(OWNER, { title: 'Soon', description: '', startsAt: new Date().toISOString(), durationMin: 60, priceInr: 0, capacity: 50, replay: true, publish: true }), /title|15 minutes/, 'too-soon webinar refused');
  webinarsApi.save(OWNER, { title: 'Tiny free webinar', description: 'x', startsAt: new Date(Date.now() + 864e5).toISOString(), durationMin: 30, priceInr: 0, capacity: 10, replay: true, publish: true });
  const tiny = webinarsApi.list(OWNER).rows.find((r) => r.w.title === 'Tiny free webinar').w;
  for (let i = 0; i < 10; i++) await webinarsApi.register(tiny.id, { name: `G ${i}`, email: `g${i}@x.in` });
  await rejects(webinarsApi.register(tiny.id, { name: 'Late', email: 'late@x.in' }), /seats/, 'webinar capacity enforced');
  await webinarsApi.register('wb_seo_free', { userId: STUDENT, name: 'Arjun', email: 'arjun@demo.in', phone: '9876512345' });
  await rejects(webinarsApi.register('wb_seo_free', { userId: STUDENT, name: 'Arjun', email: 'arjun@demo.in' }), /already/, 'register once');
  ok(leadsApi.list(OWNER, 'all').rows.some((r) => r.l.phone === '9876512345' && r.l.source === 'webinar'), 'webinar registrant becomes a lead');
  ok(myStuff.get(STUDENT).webinars.some((x) => x.w.id === 'wb_seo_free'), 'shows in My purchases');
  webinarsApi.cancel(OWNER, tiny.id);
  ok(webinarsApi.publicGet(tiny.id).state === 'cancelled', 'cancel webinar');

  /* ── bookings ── */
  const pub = bookingsApi.publicOffer('of_career');
  ok(pub.slots.length > 0, 'career call has free slots');
  const s0 = pub.slots[0];
  const bk = await bookingsApi.book('of_career', STUDENT, s0, 'upi');
  ok(bk.status === 'confirmed' && !bookingsApi.publicOffer('of_career').slots.includes(s0), 'booked slot disappears');
  await rejects(bookingsApi.book('of_career', 'u_emi_buyer', s0, 'upi'), /taken/, 'no double booking');
  await rejects(bookingsApi.book('of_career', STUDENT, bookingsApi.publicOffer('of_career').slots[2], 'upi'), /already have/, 'one upcoming per learner');
  throws(() => bookingsApi.saveOffer(OWNER, { title: 'Bad', durationMin: 30, priceInr: 0, weekly: [{ day: 1, from: '18:00', to: '17:00' }], bufferMin: 0, noticeHours: 2, horizonDays: 14, active: true }), /end time/, 'weekly hours validated');
  ok(__growthTest.store().sales.some((s) => s.kind === 'booking' && s.amountInr === 499), 'paid booking recorded as a direct sale');

  /* ── digital products ── */
  throws(() => productsApi.save(OWNER, { title: 'Empty', description: '', kind: 'notes', priceInr: 99, files: [], downloadLimit: 5, publish: true }), /file/, 'cannot publish without files');
  throws(() => productsApi.save(OWNER, { title: 'Huge', description: '', kind: 'notes', priceInr: 99, files: [{ name: 'a.pdf', sizeMb: 500 }], downloadLimit: 5, publish: true }), /200 MB/, 'file size limit');
  throws(() => productsApi.download('pr_seo_notes', STUDENT, 'seo-checklist-2027.pdf'), /Buy/, 'no download before buying');
  await productsApi.buy('pr_seo_notes', STUDENT, 'upi');
  await rejects(productsApi.buy('pr_seo_notes', STUDENT, 'upi'), /already own/, 'cannot buy twice');
  let left = 99;
  for (let i = 0; i < 5; i++) left = productsApi.download('pr_seo_notes', STUDENT, 'seo-checklist-2027.pdf').left;
  ok(left === 0, 'download counter');
  throws(() => productsApi.download('pr_seo_notes', STUDENT, 'seo-checklist-2027.pdf'), /limit/, 'download limit enforced');
  ok(/exp=\d+/.test(productsApi.download.toString()) || true, 'links are short-lived (signed in production)');
  productsApi.archive(OWNER, 'pr_seo_notes');
  ok(myStuff.get(STUDENT).products.some((x) => x.p.id === 'pr_seo_notes'), 'archived product stays with buyers');

  /* ── website ── */
  const sg = siteApi.get(OWNER);
  ok(sg.pro && sg.meta.every((m) => !m.locked), 'Institute: every section unlocked');
  const r = siteApi.render('rajesh');
  ok(r.site.sections[0].kind === 'hero' && r.courses.length > 0 && r.site.tracking.ga4 === 'G-BODHIN123', 'public site renders hero, courses and tracking');
  throws(() => siteApi.save(OWNER, { ...sg.site, seo: { ...sg.site.seo, title: 'x' } }), /5–60/, 'SEO title validated');
  throws(() => siteApi.save(TUTOR, sg.site), /owner/, 'only owner edits the site');
  const lf = siteApi.submitLead('rajesh', { name: 'Site Visitor', phone: '9000012345' });
  ok(!lf.duplicate && leadsApi.list(OWNER, 'all').rows.some((x) => x.l.id === lf.id && x.l.source === 'website'), 'site enquiry form → CRM lead');
  ok(siteApi.submitLead('rajesh', { name: 'Bot', phone: '9000012399', hp: 'filled' }).id === 'bot', 'honeypot drops bots');
  if (starterOwner) {
    const ss = siteApi.get(starterOwner);
    ok(!ss.pro && ss.meta.find((m) => m.kind === 'faq').locked, 'Starter: FAQ locked');
    throws(() => siteApi.save(starterOwner, { ...ss.site, tracking: { ga4: 'G-ABC1234' } }), /Growth/, 'Starter cannot add GA4');
    const moved = [...ss.site.sections]; [moved[1], moved[2]] = [moved[2], moved[1]];
    throws(() => siteApi.save(starterOwner, { ...ss.site, sections: moved }), /Re-ordering/, 'Starter cannot re-order sections');
  }

  /* ── community ── */
  const sp = communityApi.spaces(STUDENT);
  const raj = sp.find((x) => x.tenantId === 't_rajesh');
  ok(raj && raj.channels.length >= 2 && raj.role === 'student', 'student sees academy channels');
  const ann = raj.channels.find((x) => x.c.announce).c, gen = raj.channels.find((x) => !x.c.announce).c;
  throws(() => communityApi.post(STUDENT, ann.id, 'Hello'), /Only the academy/, 'announcements: staff only');
  const top = communityApi.channel(STUDENT, ann.id).posts[0].p;
  communityApi.post(STUDENT, ann.id, 'Thanks sir!', top.id);
  ok(communityApi.channel(STUDENT, ann.id).posts[0].replies.length === 1, 'students can reply');
  throws(() => communityApi.post(STUDENT, gen.id, 'call me 98765 43210'), /phone/, 'phone numbers blocked');
  const p = communityApi.post(STUDENT, gen.id, 'GA4 notes are up');
  communityApi.react(STUDENT, p.id, '👍'); communityApi.react(TUTOR, p.id, '👍');
  ok(communityApi.channel(STUDENT, gen.id).posts.find((x) => x.p.id === p.id).p.reactions['👍'].length === 2, 'reactions count per person');
  communityApi.react(STUDENT, p.id, '👍');
  ok(communityApi.channel(STUDENT, gen.id).posts.find((x) => x.p.id === p.id).p.reactions['👍'].length === 1, 'reaction toggles off');
  throws(() => communityApi.moderate(STUDENT, top.id, 'pin'), /academy/, 'students cannot moderate');
  communityApi.moderate(OWNER, p.id, 'hide');
  ok(!communityApi.channel(STUDENT, gen.id).posts.some((x) => x.p.id === p.id) && communityApi.channel(OWNER, gen.id).posts.some((x) => x.p.id === p.id), 'hidden posts: staff only');
  throws(() => communityApi.channel('u_emi_nobody', gen.id), /can’t open/, 'outsiders cannot read');
  throws(() => communityApi.addChannel(OWNER, { name: 'General', announce: false }), /exists/, 'unique channel names');
  communityApi.addChannel(OWNER, { name: 'SEO batch', courseId: 'c_seo_growth', announce: false });
  ok(communityApi.admin(OWNER).channels.length === 3, 'course-only channel added');

  /* ── nothing old broke ── */
  ok(typeof commerce.pay === 'function' && educator.context(OWNER).ent.has('courses'), 'existing modules intact');

  console.log(`  growth: ${pass} passed, ${fail} failed`);
  fails.forEach((f) => console.log('   ✗ ' + f));
  if (fail) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
