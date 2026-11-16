# Bodhin marketing site — design direction

1. **Personality:** grounded, scholarly, warm. A good teacher's classroom, not a tech startup.
2. **Reference world:** the ruled school notebook and the blackboard — a margin line, a chalk underline under the word that matters, a teacher's tick mark.
3. **Type:** serif display (Georgia / system serif) for headlines, like a textbook title; the app's system sans for everything else. Tamil text falls back to the system Tamil face.
4. **Palette:** navy (dominant), gold (accent, used sparingly as "chalk"), ivory paper background, existing semantic colours. Contrast ≥ 4.5:1.
5. **Shape & texture:** ruled-paper lines behind hero text, thin borders instead of heavy shadows, 20–28 px radius only on large panels.
6. **Signature moment:** the hero headline's key word is underlined by a gold chalk stroke that draws itself, beside a phone that plays the real product (course → live class → certificate).

## Motion rules (ui/motion.tsx)

- Sections reveal once on scroll (fade + 16 px rise, 320 ms ease-out). Numbers count up when first seen.
- The hero word rotates every 2.4 s; the phone showcase advances every 3.6 s and pauses when touched.
- The live-class panel shows a pulsing LIVE dot and chat bubbles arriving in order.
- Nothing runs longer than 500 ms per step; only transform and opacity animate.
- **Reduce motion:** every animation checks the OS setting and shows the final state instead.

## Navigation flow

- Visitors on the web land on **Home** (`/welcome`); the phone app keeps its onboarding.
- Two clear paths from the first screen: **Learner** → Explore courses → course page → sign up. **Educator** → For educators → Pricing (plan finder) → Apply → application status.
- Top nav shows where you are (active underline) and a scroll-progress line; on phones a menu sheet plus a bottom action bar keeps the main action in thumb reach.
- Every page ends with the next step; the footer is a full sitemap.

## Founder taste

- (record likes / rejections here)
