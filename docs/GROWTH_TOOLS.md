# Growth tools — Nrich / Graphy parity, round 1

Bodhin now has the sales and engagement tools that Nrich Learning and Graphy show to clients. They are added **beside** the existing modules: no existing table, screen, API or test was removed or rewritten. All existing test suites still pass.

## What was added

| # | Tool | Like | Educator screen | Learner / public screen | Plan |
|---|---|---|---|---|---|
| 1 | Leads CRM: pipeline, follow-ups, demo booking, lost reasons, CSV | Nrich CRM | `/edu/leads`, `/edu/lead/[id]` | Site enquiry form | Growth+ |
| 2 | Automations: 10 recipes (welcome, class reminder, fee due/overdue, abandoned checkout, completion, enquiry, inactive, webinar, booking) | Nrich automation | `/edu/automations` | email + push | Growth+ |
| 3 | Broadcasts: email + push to all / course / batch / webinar registrants / leads, now or scheduled | Nrich, Graphy email | `/edu/broadcasts` | Notifications | Creator+ |
| 4 | EMI: 2/3/4/6 parts, no-cost or up to +15%, grace days, access pause, per-instalment invoice | Nrich EMI | `/edu/emi` | Checkout option, `/my-purchases`, lesson pause screen | Growth+ |
| 5 | Webinars: free or paid, seats, reminders, replay, course pitch; registrants become leads | Nrich, Graphy | `/edu/webinars` | `/webinar/[id]` | Creator+ |
| 6 | 1:1 bookings: weekly hours, buffer, notice, no double booking, 12-hour cancel rule | Nrich consultations | `/edu/bookings` | `/book/[id]` | Starter+ |
| 7 | Digital products: eBook, notes, templates, question banks; download limits | Graphy | `/edu/products` | `/product/[id]` | Starter+ |
| 8 | Website builder: sections, text, SEO preview, contact, GA4 / Meta Pixel, 3 looks | Graphy | `/edu/site` | `/site/[slug]` (= slug.thebodhin.com) | Starter (template) · Growth (pro) |
| 9 | Community: academy- or course-level channels, announcement-only channels, replies, reactions, reports, moderation | Nrich Social Connect, Graphy | `/edu/community` | `/community`, `/community/[id]` | Creator+ |

All tools are reached from **More → Grow hub** (`/edu/grow`). Locked tools show which plan unlocks them.

## Pricing document: unchanged

- Plan prices, limits and the 20% marketplace commission are unchanged (Starter ₹799, Creator ₹1,499, Growth ₹3,499, Institute ₹7,999, Enterprise custom).
- **No transaction fee.** Graphy charges 5% per sale; we did not copy that.
- Plans now differ by these tool flags, added to `PLAN_FEATURES` (`src/core/business.ts`) and to `plans.features` (migration 0007). Super Admin can still turn any tool on or off per plan or per tenant from the existing Plans and Tenant screens.
- Webinar, 1:1 and product sales are **direct sales**: the money goes to the tutor's own gateway, with no Bodhin commission. This follows the pricing document rule that a tutor's own students pay the tutor.
- Product files count against the plan's storage limit.

## Files

| Layer | File |
|---|---|
| Rules (pure, shared with tests) | `apps/student/src/core/growth.ts` |
| API (mock now, Supabase later) | `apps/student/src/api/growth.ts` |
| UI frame | `apps/student/src/ui/grow.tsx`, `ui/payBar.tsx` |
| Screens | `app/edu/{grow,leads,lead/[id],automations,broadcasts,emi,webinars,bookings,products,site,community}.tsx`, `app/{webinar/[id],book/[id],product/[id],site/[slug],community/index,community/[id],my-purchases}.tsx` |
| Small hooks into existing code | `commerce.pay` accepts `instalmentInr` (EMI first part); checkout shows the EMI option; the lesson player pauses on overdue EMI; nav and More/Profile rows |
| Database | `supabase/migrations/0007_growth.sql` (18 tables, RLS, rules in SQL) |
| Tests | `tests/business/growth.test.ts` (102), `supabase/tests/db_test.py` (+57), `tests/e2e/growth.py` (37) |

## Rules enforced in the database (0007)

- Every table has `tenant_id` plus row-level security, so an academy can never read another academy's leads, registrants, bookings or buyers.
- Plan gates are checked in SQL through `tenant_has()`, not just hidden in the app.
- **Leads:** the public form uses `submit_lead()` (anonymous). One phone number per academy means one lead; a lost lead re-opens when the person enquires again. A lead can't be marked lost without a reason.
- **Broadcasts:** only the owner can send, up to 5 a day. The outbox is written by the server only.
- **EMI:** `emi_create()` runs as the server only and splits the price exactly. `emi_access_ok()` pauses lessons only after the grace days. Contracts are visible only to the learner and the academy.
- **Webinars:** registration locks the row, so seats never oversell. Each email registers once. Paid webinars need payment.
- **Bookings:** `book_slot()` checks weekly hours in IST, the buffer, minimum notice and the booking horizon, and allows one upcoming session per learner. A unique index stops double booking. Learners can cancel only up to 12 hours before.
- **Products:** a product can't be published without files. File storage keys stay hidden. `product_download()` serves buyers only, within the download limit.
- **Website:** on non-Growth plans, testimonials, FAQ, the enquiry form and GA4/Pixel tracking are refused. The hero section must stay visible. SEO title is 5–60 characters, and GA4 and Pixel ID formats are validated.
- **Community:** only enrolled learners and the team can read. Announcement channels are team-only for new posts. Student posts can't contain phone numbers or more than one link, and are limited to 5 a minute. Three reports hide a post. Students can't pin posts.

## Not done yet (honest list)

- **WhatsApp:** skipped for now (your decision). Messages use email and app push.
- **Real sending:** in the POC, messages go to the outbox as "test mode", and app push shows in Notifications. Going live needs an email provider (Resend, SES or similar) plus a worker that drains `message_outbox`, and Expo push tokens.
- **Payments for webinars, 1:1 sessions and products:** the POC simulates the gateway. Live, the tutor's Razorpay/Cashfree webhook inserts the `growth_sales` row and the registration, booking or purchase.
- **File upload:** "Add file" is simulated. Live, it needs the document picker, a private storage bucket and signed 10-minute URLs (the Edge Function signs the key returned by `product_download()`).
- **Public site on the real subdomain:** the page renders at `/site/[slug]`. Live, the host `slug.thebodhin.com` must route to it (Vercel wildcard domain), with server-side rendering for SEO.
- **Round 2 is now built in the app** (see the section below); its database migration is not written yet.

## Go-live steps for the developer

1. Run `supabase/migrations/0007_growth.sql` on the Supabase project. If the project is new, run `bodhin_setup_all.sql` instead; it now includes 0005, 0006 and 0007.
2. Replace each `api/growth.ts` function body with a Supabase call. Keep the signatures, so no screen changes.
3. Add the outbox worker (an Edge Function on cron every minute), plus daily crons for `fee_due`, `fee_overdue`, `class_tomorrow` and `inactive_7d`.
4. Add the payment webhooks for growth sales, and the signed download URL function.
5. Set up the Vercel wildcard domain for tutor sites.

---

# Round 2 (app side complete, no database work yet)

| Tool | Educator screen | Learner / public screen | Plan |
|---|---|---|---|
| Bundles: 2–10 courses at one price; owned courses are removed from the price | `/edu/bundles` | `/bundle/[id]`, card on the course page | Creator+ |
| Checkout add-on (upsell): tick-box on checkout, 5–50% off | `/edu/bundles` → Checkout add-ons | Checkout | Creator+ |
| Certificate designer: 3 layouts, wording, signer, logo, QR, accent | `/edu/certificate` | `/certificate/[id]` (Download PDF on web) | Creator+ |
| Affiliate program: commission 5–40%, 7/30/60/90-day window, approval, payouts | `/edu/affiliates` | `/refer`, links with `?aff=CODE` | Growth+ |
| Analytics: revenue trend, channels, top courses, learners, CSV | `/edu/analytics` | — | All plans |
| Analytics pro: funnel (view → checkout → paid) and countries | `/edu/analytics` | — | Institute+ |
| International pricing: USD / AED / GBP / EUR per course, Stripe or PayPal | `/edu/intl` | Checkout "Pay in" | Institute+ |
| Embed widget: script tag, iframe, WordPress shortcode, buy button | `/edu/embed` | `/embed/[slug]` | Institute+ |
| Public pages: home with free-preview showcase, pricing (read from the plan catalogue), Terms / Privacy / Refunds | — | `/welcome`, `/pricing`, `/legal/[doc]` | — |

## Rules built in

- **Bundles:** the bundle price is split across its courses in proportion to list price, with one order per course, so commission and statements stay correct. A bundle must be cheaper than buying separately, and at most 80% off.
- **Affiliates:** the last click inside the window wins. No commission on a person's own purchase. No commission on Bodhin marketplace sales, because Bodhin's 20% already applies. Commission waits 7 days (the refund window) before it becomes payable. The minimum payout is ₹500.
- **International:** only the gateway's public key is entered in the app. The order stores the currency, the foreign amount and the INR equivalent.
- **Pricing page:** every price, limit, feature tick and the commission percentage is read from `PLANS`, `PLAN_FEATURES` and the platform config. Nothing is hardcoded.
- **Legal pages:** these are drafts. A lawyer must review them before launch.

## Files

`src/core/growth2.ts`, `src/api/growth2.ts`, `src/ui/CertificateView.tsx`, `src/ui/publicFrame.tsx`, and the screens listed above. Checkout now takes `chargeInr` / `extra`, and `afterPaidHooks` (in `api/client.ts`) lets affiliates and analytics react to a paid order.

Tests: `tests/business/growth2.test.ts` (59 checks), `tests/e2e/round2.py` (28 checks).

## For the developer (database, later)

- Write migration `0008_growth2.sql`: bundles, upsells, affiliate_programs, affiliates, affiliate_clicks, commissions, cert_templates, analytics_events, intl_prices. Add the six new keys to `plans.features`: `bundles`, `certificate_designer`, `affiliates`, `analytics_pro`, `multi_currency`, `embed`.
- Certificate PDF on phones is built: `expo-print` makes an A4-landscape PDF from `core/certHtml.ts`, and `expo-sharing` opens save/share. It needs a development build or store build to test on a real phone (the web preview uses the browser print dialog).
- Embed: host `embed.thebodhin.com/v1.js` and build the WordPress plugin, both of which simply insert the `/embed/[slug]` iframe.
- Stripe/PayPal: do the server-side key exchange and add webhooks.

---

# Public marketing site (thebodhin.com)

| Page | Route | What it does |
|---|---|---|
| Home | `/welcome` | Two paths (learn / teach), rotating subject word + chalk underline, phone showing course → live → playground → certificate, floating video wall, learner steps, educator teaser with an animated lead pipeline, educators, final choice |
| Free videos | `/watch` | Every free video educators shared, subject filter, plays in place, "Join" leads to the course |
| For educators | `/for-educators` | Teach / Sell / Grow / Run chapters, an animated money-flow diagram using the real rates, the site builder, 4 launch steps |
| Features | `/features` | Every tool grouped by job, each showing its starting plan (computed from `PLAN_FEATURES`) |
| Pricing | `/pricing` | Plan finder (students + needs → plan), monthly/annual toggle, compare table, FAQ accordion — all numbers from `PLANS` |
| About | `/about` | Story and four promises |
| Contact | `/contact` | Call-back form → Bodhin's lead pipeline (falls back to a support ticket, so no enquiry is lost) |
| Legal | `/legal/terms`, `/legal/privacy`, `/legal/refunds` | Drafts, to be reviewed by a lawyer |

**Navigation flow.** A new web visitor lands on Home; a returning one goes to Sign in; the phone app keeps its onboarding. The top nav marks the current page and shows a scroll-progress line. On phones there is a menu sheet ("You are here") and a bottom action bar that keeps the page's main action within thumb reach. Every page ends with a next step, and the footer is the full sitemap.

**Motion** (`src/ui/motion.tsx`): page enter, reveal on scroll, count-up, chalk underline, word rotator, pulse, sequence, marquee, press/hover lift, carousel, parallax, line draw, value swap, accordion, and the travelling dot in the money-flow diagram. Every animation uses transform and opacity only, lasts at most 500 ms per step, and shows its final state when the OS "Reduce motion" setting is on. Design direction: `docs/design/direction.md`.

**Showcase videos (promotion consent).** Educators choose which lessons, or separate promo videos, Bodhin may show on its public pages and in ads (Grow → Showcase videos, `/edu/showcase`). Only courses set to "Listing + promotion" and approved by Bodhin qualify, as the pricing document requires. Consent is re-checked every time the wall is read, so turning promotion off removes every video at once. Learners who join from a video are tagged as a campaign (marketplace) sale.

For the developer: a `showcase_clips` table (tenant_id, course_id, lesson_id or a storage key for the promo video, active, plays) whose public read policy joins to courses `where visibility = 'public_promoted' and moderation = 'approved'`. The player streams a signed HLS URL of the clip only, never the whole course.

---

# Launch polish (round 3)

| Item | Where | Notes |
|---|---|---|
| Public certificate check | `/cert/[id]`, footer → "Verify a certificate" (`/cert/check`) | No login. Shows only what is printed on the certificate. Unknown or invalid IDs say "Not found". The QR, PDF and help text all point to `thebodhin.com/cert/<id>`. (`/verify` stays the OTP screen.) |
| Cookie consent on academy sites | `ui/cookieConsent.tsx`, used by `/site/[slug]` | Appears only when the site has GA4 or a Meta Pixel. Nothing loads until the visitor taps Accept. The choice is remembered per site and stays visible as a chip ("Analytics on/off · Change"). |
| SEO and share tags | `ui/seo.tsx` | Unique title, description, canonical, Open Graph and Twitter tags for every public page. Academy sites use their own SEO title and description from the builder. Real deployment needs server-side rendering so Google and WhatsApp read them without JavaScript, and an `og/bodhin-share.png` image. |
| Super Admin · Growth tools | `/admin/growth` (More → Growth tools / Showcase videos) | Adoption of each tool, non-course sales per academy, and affiliate dues. Showcase moderation: remove a video with a reason; the action is audited and the educator is notified. Needs the `content.bodhin` permission (Super Admin, Moderator). |

Database (developer): add `blocked` and `block_reason` to `showcase_clips`, writable only by admins with `content.bodhin`. Every public read must filter `active and not blocked and course promoted+approved`.
