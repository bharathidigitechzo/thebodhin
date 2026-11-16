// @ts-nocheck — Node-only test; executed by tests/business/run.sh
/* Round 2: bundles, upsells, affiliates, certificate designer, analytics, international pricing, embed, marketing/pricing data. */
import { db } from '@/api/mockDb';
import { commerce, learning } from '@/api/client';
import { showcaseApi, marketingX, verifyCertificate, adminGrowth } from '@/api/growth2';
import { affiliatesApi, analyticsApi, bundlesApi, certDesignApi, embedApi, intlApi, marketing, track, upsellApi, __r2Test } from '@/api/growth2';
import { PLAN_FEATURES } from '@/core/business';
import { PLANS } from '@/core/plans';
import { certFileName, certHtml } from '@/core/certHtml';
import { attribute, bundleSplit, certErrors, countryOfPhone, daily, embedSnippets, funnel, upsellPrice, defaultCert } from '@/core/growth2';

let pass = 0, fail = 0; const fails: string[] = [];
const ok = (c, n, x?) => { if (c) pass++; else { fail++; fails.push(n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };
const throws = (fn, re, n) => { try { fn(); ok(false, n, 'did not throw'); } catch (e) { ok(re.test(e.message), n, e.message); } };
const rejects = async (p, re, n) => { try { await p; ok(false, n, 'did not reject'); } catch (e) { ok(re.test(e.message), n, e.message); } };
const OWNER = 'u_rajesh', TUTOR = 'u_meera', STUDENT = 'u_arjun';
const mkUser = (id, name, phone = '+919000000099') => { db.users.push({ id, name, email: `${id}@x.in`, phone, phoneVerified: true, createdAt: new Date().toISOString(), password: 'x' }); return id; };

(async () => {
  /* plans */
  ok(['bundles', 'certificate_designer'].every((f) => PLAN_FEATURES.creator.includes(f)) && !PLAN_FEATURES.starter.includes('bundles'), 'Creator: bundles + certificate designer');
  ok(PLAN_FEATURES.growth.includes('affiliates') && !PLAN_FEATURES.creator.includes('affiliates'), 'Growth: affiliates');
  ok(['analytics_pro', 'multi_currency', 'embed'].every((f) => PLAN_FEATURES.institute.includes(f) && !PLAN_FEATURES.growth.includes(f)), 'Institute: analytics pro, intl, embed');
  ok(PLANS.find((p) => p.id === 'institute').monthlyInr === 7999, 'prices untouched');

  /* pure */
  const sp = bundleSplit(11999, [{ id: 'a', priceInr: 8999 }, { id: 'b', priceInr: 5500 }]);
  ok(sp.reduce((s, p) => s + p.amountInr, 0) === 11999 && sp[1].amountInr === Math.floor(11999 * 5500 / 14499), 'bundle split exact & proportional', sp);
  ok(upsellPrice(2999, 30) === 2099, 'upsell price');
  const now = Date.now();
  const clicks = [{ code: 'A', tenantId: 't', visitorId: 'v', at: new Date(now - 40 * 864e5).toISOString() }, { code: 'B', tenantId: 't', visitorId: 'v', at: new Date(now - 2 * 864e5).toISOString() }];
  ok(attribute(clicks, 'v', 't', 30) === 'B' && attribute(clicks, 'v', 't', 1) === null && attribute(clicks, 'x', 't', 30) === null, 'last click inside window wins');
  ok(certErrors(defaultCert('t', 'Rajesh', '')).length === 0 && certErrors({ ...defaultCert('t', 'R', ''), signName: '' }).length === 1, 'certificate validation');
  ok(countryOfPhone('+971501234567') === 'UAE' && countryOfPhone('+919876543210') === 'India' && countryOfPhone('') === 'Unknown', 'country from phone');
  const f = funnel([{ kind: 'course_view', visitorId: '1', courseId: 'c' }, { kind: 'course_view', visitorId: '2', courseId: 'c' }, { kind: 'checkout_start', visitorId: '1', courseId: 'c' }, { kind: 'paid', visitorId: '1', courseId: 'c' }]);
  ok(f.views === 2 && f.viewToCheckout === 50 && f.checkoutToPaid === 100, 'funnel math', f);
  ok(daily([{ at: new Date().toISOString(), v: 5 }], 7).at(-1).v === 5 && daily([], 30).length === 30, 'daily buckets');
  const sn = embedSnippets('learn.x.in', 'rajesh', 'c1');
  ok(sn.wordpress === '[bodhin academy="rajesh" course="c1"]' && sn.iframe.includes('/embed/rajesh?course=c1'), 'embed snippets');

  /* bundles */
  const bl = bundlesApi.list(OWNER);
  ok(bl.rows.some((r) => r.b.id === 'bd_growth_pack'), 'seeded bundle');
  throws(() => bundlesApi.save(OWNER, { title: 'One course only', courseIds: ['c_seo_growth'], priceInr: 100, publish: true }), /2–10/, 'needs 2+ courses');
  throws(() => bundlesApi.save(OWNER, { title: 'Too expensive', courseIds: ['c_seo_growth', 'c_meta_ads'], priceInr: 99999, publish: true }), /less than/, 'bundle must be cheaper');
  throws(() => bundlesApi.save(OWNER, { title: 'Too cheap', courseIds: ['c_seo_growth', 'c_meta_ads'], priceInr: 100, publish: true }), /80%/, 'max 80% off');
  throws(() => bundlesApi.save(TUTOR, { title: 'Tutor bundle', courseIds: ['c_seo_growth', 'c_meta_ads'], priceInr: 9000, publish: true }), /owner/, 'only owner saves bundles');
  const B = mkUser('u_bundle', 'Bundle Buyer');
  const pub = bundlesApi.publicGet('bd_growth_pack', B);
  ok(pub.payInr === 11999 && pub.save.pct > 0, 'full bundle price for new learner');
  const before = db.orders.length;
  const orders = await bundlesApi.buy('bd_growth_pack', B, 'upi', null);
  ok(orders.length === 2 && db.orders.length === before + 2 && orders.reduce((s, o) => s + o.amountInr, 0) === 11999 && orders.every((o) => o.bundleId === 'bd_growth_pack'), 'bundle → one order per course, exact total');
  ok(learning.isEnrolled(B, 'c_seo_growth') && learning.isEnrolled(B, 'c_meta_ads'), 'enrolled in every bundle course');
  await rejects(bundlesApi.buy('bd_growth_pack', B, 'upi', null), /already own every/, 'cannot buy bundle twice');
  const P = mkUser('u_partial', 'Partial Owner');
  await commerce.pay({ userId: P, courseId: 'c_meta_ads', method: 'upi', source: 'direct', checkoutTenantId: 't_rajesh' });
  const pp = bundlesApi.publicGet('bd_growth_pack', P);
  ok(pp.owned.includes('c_meta_ads') && pp.payInr < 11999 && pp.payInr > 0, 'owned course removed from bundle price', pp.payInr);
  ok(bundlesApi.forCourse('c_seo_growth').length >= 1, 'course page shows its bundles');

  /* upsell */
  const U = mkUser('u_upsell', 'Upsell Buyer');
  const off = upsellApi.offer('c_seo_growth', U);
  ok(off && off.course.id === 'c_ga4' && off.priceInr === upsellPrice(off.course.priceInr, 30), 'checkout add-on offered');
  await commerce.pay({ userId: U, courseId: 'c_seo_growth', method: 'upi', source: 'direct', checkoutTenantId: 't_rajesh' });
  const uo = await upsellApi.take('c_seo_growth', U, 'upi', null);
  ok(uo.amountInr === off.priceInr && uo.upsellOf === 'c_seo_growth' && learning.isEnrolled(U, 'c_ga4'), 'add-on bought at offer price');
  ok(upsellApi.offer('c_seo_growth', U) === null, 'no add-on once owned');
  throws(() => upsellApi.save(OWNER, { courseId: 'c_seo_growth', offerCourseId: 'c_seo_growth', discountPct: 20, headline: 'Same course', enabled: true }), /different/, 'cannot upsell the same course');
  throws(() => upsellApi.save(OWNER, { courseId: 'c_seo_growth', offerCourseId: 'c_ga4', discountPct: 80, headline: 'Too much off', enabled: true }), /5–50/, 'add-on discount limited');

  /* affiliates */
  const adm = affiliatesApi.admin(OWNER);
  ok(adm.program.enabled && adm.program.commissionPct === 15, 'seeded program on at 15%');
  throws(() => affiliatesApi.saveProgram(OWNER, { ...adm.program, commissionPct: 60 }), /5–40/, 'commission capped');
  const mine = affiliatesApi.mine(STUDENT);
  ok(mine.some((m) => m.tenantId === 't_rajesh' && !m.a), 'student can join program');
  const af = affiliatesApi.join(STUDENT, 't_rajesh');
  throws(() => affiliatesApi.join(STUDENT, 't_rajesh'), /already/, 'join once');
  ok(af.status === 'active' && /^[A-Z0-9]{6,12}$/.test(af.code), 'gets an active code', af.code);
  const F = mkUser('u_friend', 'Friend Buyer');
  ok(!affiliatesApi.click(af.code, STUDENT) && affiliatesApi.click(af.code, F), 'own clicks ignored, friend click counted');
  const o = await commerce.pay({ userId: F, courseId: 'c_meta_ads', method: 'upi', source: 'direct', checkoutTenantId: 't_rajesh' });
  const cm = __r2Test.store().commissions.find((x) => x.orderId === o.id);
  ok(cm && cm.amountInr === Math.round(o.amountInr * 0.15) && cm.status === 'pending' && o.affiliateCode === af.code, 'commission created on referred direct sale', cm);
  ok(affiliatesApi.mine(STUDENT).find((m) => m.tenantId === 't_rajesh').pending === cm.amountInr, 'affiliate sees pending earnings');
  // self purchase
  const self = await commerce.pay({ userId: STUDENT, courseId: 'c_meta_ads', method: 'upi', source: 'direct', checkoutTenantId: 't_rajesh', extra: { affiliateCode: af.code } }).catch(() => null);
  ok(!self || !__r2Test.store().commissions.some((x) => x.orderId === self.id), 'no commission on own purchase');
  // marketplace order never earns
  const M = mkUser('u_mkt', 'Market Buyer');
  affiliatesApi.click(af.code, M);
  const mo = await commerce.pay({ userId: M, courseId: 'c_dm_ai', method: 'upi', source: 'bodhin_referral', checkoutTenantId: null });
  ok(mo.channel !== 'bodhin_marketplace' || !__r2Test.store().commissions.some((x) => x.orderId === mo.id), 'no affiliate commission on marketplace sales');
  throws(() => affiliatesApi.payOut(OWNER, af.id), /500/, 'payout minimum');
  cm.payableAt = new Date(Date.now() - 1000).toISOString();
  const due = affiliatesApi.admin(OWNER).affiliates.find((x) => x.a.id === af.id).due;
  ok(due === cm.amountInr, 'after refund window commission becomes payable');
  ok(affiliatesApi.payOut(OWNER, 'af_karthik') === 1350, 'owner pays out seeded affiliate');

  /* certificates */
  const cd = certDesignApi.get(OWNER);
  throws(() => certDesignApi.save(OWNER, { ...cd.t, title: 'x' }), /5–40/, 'cert title validated');
  certDesignApi.save(OWNER, { ...cd.t, layout: 'modern', signName: 'Rajesh Kumar' });
  ok(certDesignApi.get(OWNER).t.layout === 'modern', 'design saved');
  throws(() => certDesignApi.save(TUTOR, cd.t), /owner/, 'tutor cannot change design');
  const certs = db.certificates.filter((x) => x.userId === STUDENT);
  if (certs.length) { const rr = certDesignApi.render(STUDENT, certs[0].id); ok(rr.learner && rr.verify.includes(certs[0].id), 'certificate renders with verify link'); } else ok(true, 'no seeded certs');

  /* certificate PDF (phone) */
  const html = certHtml({ t: { ...defaultCert('t', 'Rajesh Kumar', ''), layout: 'modern' }, learner: 'Arjun <b>K</b>', course: 'SEO & Content', academy: 'Rajesh Kumar Academy', date: '14 November 2026', certId: 'BODHIN-1', verify: 'https://thebodhin.com/cert/BODHIN-1', primary: '#0B3B73', accent: 'javascript:alert(1)' });
  ok(html.includes('A4 landscape') && html.includes('SEO &amp; Content') && html.includes('Arjun &lt;b&gt;K&lt;/b&gt;') && !html.includes('<b>K</b>'), 'certificate PDF html: A4 landscape, text escaped');
  ok(!html.includes('javascript:') && html.includes('#D99A1E') && html.includes('class="band"') && html.includes('Verify: https://thebodhin.com/cert/BODHIN-1'), 'PDF: bad colour replaced, modern band, verify link printed');
  ok(certFileName('Arjun Kumar', 'SEO & Content / 2026') === 'Arjun-Kumar-SEO-Content-2026.pdf' && certFileName('', '') === 'certificate.pdf', 'PDF file name is safe');

  /* analytics */
  track('course_view', 'c_seo_growth', 'v_test');
  const an = analyticsApi.get(OWNER, 30);
  ok(an.pro && an.funnel && an.funnel.views > 0 && an.countries.length > 0, 'Institute sees funnel and countries');
  ok(an.series.length === 30 && an.kpi.revenue > 0 && an.byChannel.length === 4, 'revenue series and channels');
  throws(() => analyticsApi.get(TUTOR, 30), /owner/, 'tutors cannot see analytics');
  ok(analyticsApi.csv(OWNER, 7).startsWith('Day,Revenue'), 'CSV export');

  /* international */
  const io = intlApi.options('c_dm_ai');
  ok(io.some((x) => x.id === 'USD' && x.amount === 199), 'USD price offered');
  throws(() => intlApi.connect(OWNER, 'stripe', 'sk_live_secret123456'), /publishable/, 'secret key refused');
  throws(() => intlApi.setPrices(OWNER, 'c_dm_ai', { USD: 99999 }), /1 and 5,000/, 'price bounds');
  const I = mkUser('u_intl', 'Dubai Learner', '+971501234567');
  const iord = await intlApi.pay({ userId: I, courseId: 'c_dm_ai', currency: 'USD', checkoutTenantId: 't_rajesh', source: 'direct' });
  ok(iord.currency === 'USD' && iord.amountForeign === 199 && iord.amountInr === 199 * 84 && learning.isEnrolled(I, 'c_dm_ai'), 'paid in USD, INR equivalent recorded');
  ok(intlApi.options('c_seo_growth').length === 0, 'courses without intl prices stay INR only');

  /* embed */
  ok(embedApi.get(OWNER).courses.length > 0 && embedApi.render('rajesh').courses.length > 0, 'embed snippets + public widget');
  throws(() => embedApi.render('no-such-academy'), /not available/, 'unknown academy widget');

  /* showcase videos (promotion consent) */
  const wall = showcaseApi.wall();
  ok(wall.rows.length >= 10 && wall.rows.every((x) => x.course.visibility === 'public_promoted'), 'video wall only shows promoted courses', wall.rows.length);
  ok(wall.rows.slice(0, 4).map((x) => x.course.id).length === new Set(wall.rows.slice(0, 4).map((x) => x.course.id)).size || new Set(wall.rows.map((x) => x.course.id)).size < 4, 'wall interleaves educators');
  const sa = showcaseApi.admin(OWNER);
  const seo = sa.courses.find((x) => x.co.id === 'c_seo_growth');
  ok(seo && seo.eligible && seo.clips.length > 0, 'promoted course has clips');
  throws(() => showcaseApi.add(OWNER, { courseId: 'c_seo_growth', title: 'x', durationSec: 60 }), /5–70/, 'promo title validated');
  throws(() => showcaseApi.add(OWNER, { courseId: 'c_seo_growth', title: 'Too long promo', durationSec: 3600 }), /20 seconds/, 'promo length limited');
  const nc = showcaseApi.add(OWNER, { courseId: 'c_seo_growth', title: 'Why SEO still matters', durationSec: 90 });
  ok(showcaseApi.wall().rows.some((x) => x.c.id === nc.id), 'new promo video appears on wall');
  showcaseApi.setActive(OWNER, nc.id, false);
  ok(!showcaseApi.wall().rows.some((x) => x.c.id === nc.id), 'hidden video leaves the wall');
  throws(() => showcaseApi.add(TUTOR, { courseId: 'c_seo_growth', title: 'Tutor promo video', durationSec: 60 }), /owner/, 'only owner adds showcase videos');
  const co = db.courses.find((x) => x.id === 'c_seo_growth') ?? (await import('@/api/catalogSeed')).courses.find((x) => x.id === 'c_seo_growth');
  const before2 = co.visibility; co.visibility = 'public';
  ok(!showcaseApi.wall().rows.some((x) => x.course.id === 'c_seo_growth'), 'turning promotion off removes every video at once');
  throws(() => showcaseApi.add(OWNER, { courseId: 'c_seo_growth', title: 'Without consent', durationSec: 60 }), /Listing \+ promotion/, 'no consent → cannot add');
  co.visibility = before2;
  const p0 = wall.rows[0].c.plays; showcaseApi.played(wall.rows[0].c.id);
  ok(showcaseApi.wall().rows.find((x) => x.c.id === wall.rows[0].c.id).c.plays === p0 + 1, 'plays counted');
  ok(marketingX.split(2000).marketplace.bodhin === 400 && marketingX.split(2000).direct.bodhin === 0, 'money-flow uses real 20% rate');

  /* public certificate check */
  const anyCert = db.certificates[0];
  const vc = verifyCertificate(anyCert.id);
  ok(vc.valid && vc.course === anyCert.title && vc.id === anyCert.id, 'real certificate verifies', vc);
  ok(!verifyCertificate('NOPE-123').valid && /No certificate/.test(verifyCertificate('NOPE-123').reason), 'unknown ID → not found');
  ok(!verifyCertificate('<script>').valid && /doesn’t look like/.test(verifyCertificate('<script>').reason), 'junk input rejected safely');

  /* super admin growth */
  const ADMIN = db.memberships.find((m) => m.role === 'super_admin').userId;
  const ag = adminGrowth.get(ADMIN);
  ok(ag.rows.length > 0 && ag.adoption.length === 7 && ag.rows.some((r) => r.t.id === 't_rajesh'), 'admin sees growth adoption per academy');
  throws(() => adminGrowth.get(OWNER), /admin role/, 'educators cannot open admin growth');
  const firstLive = showcaseApi.wall().rows[0].c;
  throws(() => adminGrowth.block(ADMIN, firstLive.id, true, ''), /reason/, 'removing a video needs a reason');
  adminGrowth.block(ADMIN, firstLive.id, true, 'Poor audio quality');
  ok(!showcaseApi.wall().rows.some((x) => x.c.id === firstLive.id) && db.audit[0].action === 'showcase.block', 'blocked video leaves the wall and is audited');
  ok(adminGrowth.clips(ADMIN).find((x) => x.c.id === firstLive.id).why === 'Blocked by Bodhin', 'admin sees why it is not live');
  adminGrowth.block(ADMIN, firstLive.id, false);
  ok(showcaseApi.wall().rows.some((x) => x.c.id === firstLive.id), 'restored video returns');
  const finance = db.memberships.find((m) => m.role === 'finance');
  if (finance) throws(() => adminGrowth.block(finance.userId, firstLive.id, true, 'Finance should not'), /admin role/, 'finance role cannot moderate videos');

  /* marketing */
  const h = marketing.home();
  ok(h.showcase.length > 0 && h.stats.courses > 0, 'home shows showcase courses');
  const pr = marketing.pricing();
  ok(pr.plans.length === 5 && pr.plans.find((x) => x.p.id === 'starter').p.monthlyInr === 799 && pr.commissionPct === 20, 'pricing page reads the plan catalogue', pr.commissionPct);
  ok(pr.rows.find((r) => r.key === 'crm').on.growth === true && pr.rows.find((r) => r.key === 'crm').on.starter === false, 'comparison table from PLAN_FEATURES');

  console.log(`  growth2: ${pass} passed, ${fail} failed`);
  fails.forEach((x) => console.log('   ✗ ' + x));
  if (fail) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
