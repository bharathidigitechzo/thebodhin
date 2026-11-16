# Ready-to-use pass (Nov 14, 2026)

This pass checked every screen at phone width, made wrong entries and successes vibrate, added animations app-wide, made the free trial actually end, and checked that what one person does shows correctly everywhere else. Every bug found was fixed and covered by a test.

## Feel: haptics and animations

| What | Where | Detail |
|---|---|---|
| **Vibration** on a wrong password, OTP, mobile number, coupon or any form error | `ui/haptics.ts`, wired in `TextField`, `OtpInput`, `Banner`, `useAct` | One mistake gives one buzz. A field error and a banner for the same mistake don't double up. |
| Shake on the wrong field or error banner | `ui/feedback.tsx` `useShake` | About 320 ms. Skipped when reduce-motion is on. |
| Success vibration | Payment done, lesson completed, course finished, saved/published (`useAct`) | |
| Light tap / selection ticks | Buttons, icon buttons, chips, bottom tabs, switches, checkboxes | |
| **Vibration on/off** | Profile → Settings → Vibration | Saved per device |
| Android | `performAndroidHapticsAsync` (device haptics engine, as the Expo SDK 58 docs recommend) | iOS uses the Taptic Engine. Web uses the browser's vibration API. |
| Celebration (icon springs in, ring, confetti) | `ui/celebrate.tsx`: payment success, **course complete** sheet (with "View certificate"), lock screen icon | |
| Tab icons pop when selected | `ui/tabIcon.tsx` (learner, educator, admin tabs) | |
| Cards deal in (staggered fade-up) | `ui/appear.tsx` on course cards and rows | |
| Progress bars fill smoothly | `ProgressBar` | |
| Press feedback | Buttons, icon buttons, chips and cards scale slightly when pressed | |

All animations use transform and opacity only, last 500 ms or less, and respect reduce-motion. The package `expo-haptics ~58.0.8` was added; a new EAS build is needed.

## Free trial and subscription: it now really ends

Previously, nothing checked the trial end date, so a trial stayed fully usable forever. Rules now (`core/business.ts` `subGate`, `api/client.ts` `settleSubscription`, database `0009_launch_rules.sql`):

| State | Educator | Learners |
|---|---|---|
| Trial, 4 or more days left | Full access | Normal |
| Trial, 3 days or fewer | Full access, with a countdown strip on every educator screen ("Free trial · 2 days left · Choose plan") | Normal |
| **Trial ended** | **Lock screen** on every educator screen: "Your free trial has ended", what is kept, and one button, "Choose a plan". Only Subscription and Payments setup stay open. | Keep watching courses they bought. New enrolments and live classes for that academy pause. |
| Plan picked during the trial | Starts automatically when the trial ends (first invoice then). No charge today. | |
| Plan picked after the trial | Starts now and unlocks immediately | |
| Renewal failed | 7-day grace with a red strip, then locked | Same as above once locked |
| Cancelled | Works until the paid period ends, then locked | |

Super Admin sees "Trial ended · locked" in the academy list and can **Extend trial** (which unlocks). The trial length comes from Super Admin → Platform rules everywhere. Public pages used to say "14-day" in hard-coded text.

Bug fixed: choosing Growth during a Growth trial used to be "scheduled" and never activated.

## Cross-module checks (`tests/business/alignment.test.ts`, 32 checks)

- A tutor uploads a video lesson → an enrolled learner plays it, a stranger is blocked, and a free preview is open to all. The marketplace page counts it.
- The tutor showcases the lesson → it appears on the public video wall. A Super Admin block removes it; withdrawing promotion consent removes it at once.
- A tutor coupon → exact checkout price → learner Payments, tutor earnings and coupon use count all update. Own-site sales carry no commission.
- A learner doubt → tutor inbox → answer → learner notified → the doubt moves to Answered. Reviews appear on the course page.
- Course finished → certificate → **public verify page confirms it**.
- A Super Admin price or trial change → the public pricing page.
- A course made private → it leaves the marketplace, and enrolled learners keep it.

Bugs fixed:

1. Every learner of a course got the **same certificate ID**.
2. Earned certificates were never saved, so **the verify page said they were fake**. They are now issued once, stored, and unique (`BODHIN-NEET-2026-3K9U7K`).

## Every screen on a phone (`tests/e2e/mobile_audit.py`)

130 screens were opened at 360 × 780 as a visitor, learner, educator and Super Admin. Each was checked for JS crashes, blank screens, broken text (undefined / NaN / [object Object]), horizontal overflow and tap targets under 32 px.

| Result | Detail |
|---|---|
| Crashes, overflow, broken text | 0 |
| Blank screens for an old/wrong link | 4 fixed with a friendly "not found" screen (`NotFound`) |
| Tap targets | Enlarged: video controls, sign-in/up links, onboarding dots and Skip, search Clear, Super Admin text links, board colours, section actions. The remaining small items are switches inside fully tappable rows. |

## Blueprint gaps closed

| Gap | Built |
|---|---|
| Pilot success measures | Super Admin → More → **Pilot success**: activation funnel (approved → published → payments ready → first sale → first live class), days to first course, onboarding %, active learners (7 days), refund rate by channel, 30-day commission, trial/paying/locked counts, storage and live-hour totals |
| Recording retention | Super Admin → Platform rules → Live classes: "Keep class recordings" (default 180 days, 0 = forever). Learners see "available N more days" or "Recording expired". Recordings can be streamed, never downloaded. |
| Module on/off ("Enable pre-built modules") | Workspace → **Modules**: 17 switches (live classes, batches, quizzes, certificates, coupons, marketplace, community, webinars, bookings, products, website, broadcasts, CRM, automations, EMI, bundles, affiliates). Off means off everywhere (scheduling, joining, coupons, marketplace listing, certificates, growth hub shows "Off"). Data is kept, and changes are audited. Modules a plan doesn't include can't be switched on. |

## Database (`supabase/migrations/0009_launch_rules.sql`)

- `tenant_gate` / `tenant_locked`: the same states as the app.
- `tenant_has`: now also respects switched-off modules and the lock.
- `enrol_block`: pauses new enrolments while locked.
- `guard_unlocked`: a trigger on courses, modules, lessons, live_sessions and coupons.
- `set_module`: owner only, plan-checked, audited.
- `recording_available`.
- `settle_subscriptions`: schedule nightly with pg_cron.

`bodhin_setup_all.sql` now includes 0008 and 0009.

## Tests

| Suite | Result |
|---|---|
| Business rules, 13 suites (new: trial-gate 43, alignment 32, gaps 27) | All pass |
| Database | 214 / 214 |
| Browser: feel (24), mobile audit (130 screens), timetable, live scale, smart board, learner journey, desktop, round 2, growth, checkout, tutor→admin, pricing, refunds, playground | See the final run |

## Still for the developer

- An EAS development build, because `expo-haptics` is a native module. Check vibration on a real Android phone and iPhone; the web preview logs haptics but most desktops can't vibrate.
- Schedule `settle_subscriptions()` with pg_cron, and wire the payment gateway webhooks for renewals.
- On phones, persist the Vibration setting with AsyncStorage. The web saves it in localStorage.

## Bug hunt (Nov 14, evening)

| Method | Result |
|---|---|
| ESLint (Expo config, added to the repo: `npx eslint src`) | 0 rules-of-hooks errors (no conditional hooks). The rest is React Compiler advice. One real item fixed: a component created on every render in Admin → Content. |
| **Monkey test** (`tests/e2e/monkey.py`): every visible button on every screen, as each role | 544 taps, 0 crashes / blank screens / broken text |
| **Empty accounts** (`tests/e2e/empty_accounts.py`): a brand-new learner and a newly approved educator with no data, plus a learner opening educator links, plus a locked educator on all 34 educator pages | 52 / 52 |

Bugs found and fixed:

1. **A learner could not become an educator from inside the app.** "Switch to Educator" only appeared for people who were already educators, and `/apply` failed with "No application to complete". Now Profile shows **Teach on Bodhin** → apply → status, and an application is started automatically.
2. A learner opening an educator link got a blank screen or a crash. Now they see "**This is the educator area**", with Teach on Bodhin / Sign in / See my application.
3. **One crashing screen froze the whole app** (everything after it went blank). Added a root safety net (`ErrorBoundary` in `app/_layout.tsx`): "Something went wrong · Try again · Go home". In production, report the error to Sentry there.
4. A locked (trial-ended) educator crashed the course editor and batch screens. Viewing is now allowed while locked; every change is still blocked.
5. A newly approved educator stayed a "learner" until they signed out. Roles now refresh when Profile or the educator area opens.
6. `/application-status` with an unfinished application was blank. It now opens the application form.
