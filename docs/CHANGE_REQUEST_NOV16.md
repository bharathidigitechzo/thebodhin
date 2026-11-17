# Change request (Nov 16, 2026): what was built

The team's list (Student portal, Admin portal, Tutor dashboard, Educator dashboard, common navigation) is built on top of the existing app. Nothing was removed except the items the list asked to remove. Every item has a test.

Roles used in this document: **Student** = learner, **Tutor** = team member of an academy, **Educator** = academy owner, **Admin** = Bodhin team (Super Admin) managing Bodhin's own courses.

## Requirement → where it is

| # | Requirement | Built | Where |
|---|---|---|---|
| S1 | Certificate at 75% + required quiz → educator approves → student downloads | Eligibility check on every lesson completed and quiz submitted. Request goes to the academy owner (or the Bodhin team for Bodhin courses) with a notification. Approve issues a unique certificate; reject needs a reason. Student sees "In review", "Not approved: reason" + **Ask again**, or what is still missing. Owner can switch approval off (auto-issue) and pick the required quiz per course (or none). | `api/academy.ts` certApprovals · `app/edu/certificates.tsx` · `app/certificates.tsx` |
| S2 | Certificate section below Playground | Student sidebar order: Home, Explore, My Learning, Live, Quizzes, Assignments, Community, Playground, **Certificates**, Profile | `core/nav.ts` |
| S3 | Quiz and Assignment sections below Live, only bought courses | `/quizzes` and `/assignments`; anything a tutor publishes for a course shows up automatically for its buyers only | `app/quizzes.tsx`, `app/assignments.tsx`, `ui/assessList.tsx` |
| S4 | Live: upcoming, running, scheduled + join; 1:1 mentorship booking → tutor notified → accept/reject → student notified | Live tab already had live now / upcoming / timetable / past. Added **1:1 mentorship**: pick course + tutor + time + topic. The tutor accepts (can change the time) or declines with a reason. The student gets a notification and a **Join** button when it is time. Cancel works both ways. | `app/mentorship.tsx`, `app/edu/mentorship.tsx`, `app/mentor-room/[id].tsx` |
| A1 | Admin: create/manage courses, quizzes, assignments, live | Admin More → Bodhin content: Create course, Quizzes & assignments, Live classes, 1:1 mentorship, Certificate management, Students. Uses the same tools as educators, scoped to Bodhin's academy. | `app/admin/(tabs)/more.tsx`, `app/admin/classes.tsx` |
| A2 | Admin Live section; schedule for a course; buyers notified; shows in their Live | Admin → **Live classes**: schedule for a course, go live, cancel with a reason. Schedule screen now offers **Everyone who bought a course** or **One batch**. The course builder has **Schedule a live class** for that course. | `api/academy.ts` courseLive · `app/edu/schedule.tsx` |
| A3 | Admin certificate management + templates/designs + auto-generation | Same certificate management as educators. **Templates** tab: designer (layout, wording, signer, logo, QR) + **upload up to 6 background designs** (JPG/PNG/WebP ≤ 5 MB), picked in the designer. Certificates are generated from the template with name, course, date and ID. | `app/edu/certificates.tsx`, `app/edu/certificate.tsx`, `core/certHtml.ts` |
| A4 | Student management by course | `/edu/students`: each course → students with email, purchase status, progress bar, quizzes passed, assignments submitted/graded, certificate status, last active. Search + course filter. Owner sees all, tutor only assigned courses, admin only Bodhin courses. | `app/edu/students.tsx` |
| T1 | Create Course in the Create menu | Create menu: **Create course** for owners and tutors (a tutor's course is assigned to them; price and publishing stay with the owner, with an **Ask owner to publish** button). Also in the sidebar and the module strip. | `app/educator/home.tsx`, `app/edu/new-course.tsx` |
| T2 | Show all important modules by priority | Desktop sidebar lists every module, teaching first: Dashboard, Courses, Create course, Live classes, Timetable, Quizzes, Assignments, Batches, Students, Community, 1:1 mentorship, Doubts, Certificates*, Earnings*, Grow*, More (*owner). Phones: **Your modules** strip on the dashboard + full grid in More. | `core/nav.ts`, `ui/responsive.tsx` |
| T3 | Meeting scheduling + notifications + confirmations/cancellations + join | Course-wide and batch classes notify students; cancel notifies with the reason; 1:1 requests, confirmations, cancellations notify both sides; join rooms for classes and 1:1s. | as above |
| T4 | Create Announcement inside Community; navigation must not disappear | Community → **Create announcement** (channel, title, message, pin, notify students); tutors can use it too. Channels opened from the educator area stay in the educator area. | `app/edu/community.tsx`, `app/edu/channel/[id].tsx` |
| T5 | Timetable = meetings + reminders | Timetable has **Meetings** (live classes + confirmed 1:1s) and **Reminders** (course update, quiz, assignment, deadline, other: add, edit, tick off, delete; notified a day before). Creating a course/quiz is never shown as a meeting. | `app/edu/timetable.tsx` |
| T6 | Remove Learner Dashboard and Playground from tutor dashboard | Removed from every educator/tutor menu. The role switch is now **Switch dashboard** (see Part 3). | `core/nav.ts`, `app/educator/more.tsx` |
| T7 | Remove certificate/student items from tutor profile | Tutors' **Profile & account**: name, email, password, notifications, help, switch dashboard, log out. No purchases, playground, downloads, refer, certificates. Tutors have no certificate section (owners approve). | `app/edu/account.tsx` |
| E1 | Category dropdown with Other → new category saved | Category is a dropdown; **Other…** adds a new name, saves it for the academy's future courses (Bodhin team → marketplace list). Duplicates refused. | `api/academy.ts` categoriesApi |
| E2 | Real cover image + course video upload with preview, replace/remove, validation, shown to students | **Upload cover image** (JPG/PNG/WebP ≤ 5 MB) with preview, Replace, Remove; shown on every course card and the course page. **Upload intro video** (MP4/MOV/WebM/MKV ≤ 2 GB) with a playable preview, Replace, Remove; shown on the course page. Wrong files get a clear message and a vibration. | `app/edu/course/[id].tsx`, `ui/pickMedia.ts`, `ui/VideoPreview.tsx` |
| E3–E4 | Timetable reminders; no Learner Dashboard | as T5, T6 | |
| E5 + Part 3 | Navigation consistent; switching users loads correct modules; More never disappears | Every inner page on phones keeps the 5-slot bar (Community, Timetable, Students …; the module you are in lights up More). One **Switch dashboard** sheet (Admin / Educator or Tutor / Student) opens each dashboard with its own full navigation. Bodhin admins on shared tools keep the admin sidebar. Each role sees only its modules; modules the academy switched off are hidden. | `ui/responsive.tsx` AreaBar, SwitchDashboardSheet |

## Database (`supabase/migrations/0010_academy_workflows.sql`)

New tables: `quiz_attempts`, `certificates`, `cert_settings`, `course_cert_rules`, `cert_requests`, `cert_designs`, `mentor_requests`, `teaching_reminders`, `academy_categories`; columns `courses.cover_image_path`, `courses.intro_video_uid`, `lessons.pass_pct`, `live_sessions.cancel_reason`.

Rules in SQL: `cert_eligibility`, `cert_check` (trigger on progress and quiz attempts), `cert_decide`, `cert_request_again`, `mentor_request` / `mentor_respond` / `mentor_cancel`, `live_notify_buyers` (trigger), `send_due_reminders`, `tutor_create_course`, `guard_tutor_course_fields`. RLS on every new table. `bodhin_setup_all.sql` includes it. A database that already ran the Nov 14 file runs only 0010.

## For the developer

| Item | What to do |
|---|---|
| Storage | Buckets `covers` (public read) and `cert-designs` (owner write). Upload the original image there and save the path, instead of the scaled preview the mock keeps. |
| Video | Intro video → Cloudflare Stream (same as lessons) → `courses.intro_video_uid`, signed playback. |
| Quiz scoring | Score server-side in an edge function, then insert into `quiz_attempts`. The certificate trigger runs from there. |
| Certificate verify | Public page reads `certificates` by ID through an edge function (the table is private by RLS). |
| Schedules (pg_cron) | `select public.send_due_reminders();` every 15 min (plus `settle_subscriptions` nightly, as before). |
| 1:1 room | Same LiveKit service as classes: a 2-person room keyed by the mentorship id; allow join from 10 min before `starts_at` to `ends_at`. |
| Push | Every `notifications` row should also go out as a push notification (Expo push), as for the other notifications. |

## Tests

| Suite | Result |
|---|---|
| Business rules, `tests/business/academy.test.ts` (new) | 105 / 105 |
| All business suites | All pass |
| Database `run_db_tests.sh` (+ `academy_db_test.py`, new) | 214 / 214 + 50 / 50 |
| Browser `tests/e2e/change_request.py` (new: student, tutor, educator, admin, phone and desktop) | 45 / 45 |
| Phone audit (now 140 screens incl. the new ones) | 0 problems |
| Empty accounts (new screens added) | 59 / 59 |
| Feel, timetable, live scale, smart board, learner journey, desktop, round 2, growth, checkout, tutor→admin, pricing, refunds, playground | All pass |

Changed behaviour in old tests (intended): the desktop test now switches through **Switch dashboard**; the feel test now expects "Certificate status" after finishing a course, because certificates wait for approval.
