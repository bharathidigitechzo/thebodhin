"""
Export Bodhin test cases to CSV files matching the user's requested format:
Columns: ID, Type, Steps, Expected, Pri, Status
Generates:
1. Bodhin_Test_Cases_File1_Student_Mobile.csv
2. Bodhin_Test_Cases_File2_Admin_Educator.csv
3. Bodhin_All_Test_Cases.csv
"""
import csv

# ── A. STUDENT MOBILE APP ───────────────────────────────────────────────────
student_cases = [
    # A1. Authentication
    ("STU-AUTH-01", "M", "Signup with valid name, phone, email, password -> accept terms -> Create Account", "OTP verification screen shown; lands on Home after OTP 123456", "P1", "-"),
    ("STU-AUTH-02", "M", "Signup with all fields empty -> submit", "Inline error under every required field; no request sent", "P1", "-"),
    ("STU-AUTH-03", "M", "Signup with name < 2 chars", "Error: 'Enter your full name.'", "P1", "-"),
    ("STU-AUTH-04", "M", "Signup with invalid email (no @ or no domain)", "Error: 'Enter a valid email address.'", "P1", "-"),
    ("STU-AUTH-05", "M", "Signup: phone starting with 1 (not 6-9)", "Error: 'Enter a valid 10-digit mobile number.'", "P1", "-"),
    ("STU-AUTH-06", "M", "Signup: type 11 digits in phone field", "Field auto-caps at 10 digits; 11th digit not accepted", "P1", "-"),
    ("STU-AUTH-07", "M", "Signup: password with < 8 chars", "Error: 'Use at least 8 characters.'; strength bar red", "P1", "-"),
    ("STU-AUTH-08", "M", "Signup: password letters only (no number)", "Error: 'Use letters and numbers.'", "P1", "-"),
    ("STU-AUTH-09", "M", "Signup without accepting Terms", "Error: 'Please accept the terms to continue.'", "P1", "-"),
    ("STU-AUTH-10", "M", "Signup with already-registered email", "Clear 'already registered' message; no crash", "P1", "-"),
    ("STU-AUTH-11", "M", "OTP screen: enter correct OTP 123456", "Verified; navigates to Home screen", "P1", "-"),
    ("STU-AUTH-12", "M", "OTP screen: enter wrong OTP 000000", "Error: 'Invalid OTP'; stays on verify screen", "P1", "-"),
    ("STU-AUTH-13", "M", "OTP screen: tap Resend before cooldown expires", "Resend button disabled during cooldown timer", "P2", "-"),
    ("STU-AUTH-14", "M", "Login with valid email arjun@demo.in / demo123", "Lands on Student Home; bottom nav shows all 5 tabs", "P1", "-"),
    ("STU-AUTH-15", "M", "Login with valid phone number (10 digits) + password", "Login succeeds; navigates to Home", "P1", "-"),
    ("STU-AUTH-16", "M", "Login with wrong password", "Generic error on form; password field not cleared in network error", "P1", "-"),
    ("STU-AUTH-17", "M", "Login with both fields empty", "Error on identifier and password fields", "P1", "-"),
    ("STU-AUTH-18", "M", "Tap Demo Student button on Sign In", "Credentials auto-filled; auto-login to Student Home", "P2", "-"),
    ("STU-AUTH-19", "M", "Login -> kill app -> relaunch", "Still signed in (session persisted)", "P1", "-"),
    ("STU-AUTH-20", "M", "Forgot password: enter registered email -> submit", "Success confirmation shown (generic message)", "P1", "-"),
    ("STU-AUTH-21", "M", "Forgot password: enter unknown email", "Same generic confirmation (no account enumeration)", "P1", "-"),
    ("STU-AUTH-22", "M", "Sign Out from Profile -> confirm", "Back to Sign In screen; session cleared", "P1", "-"),
    ("STU-AUTH-23", "M", "After sign out: press back button", "Stays on Sign In; Home not accessible without login", "P1", "-"),
    ("STU-VAL-01..08", "A", "Password strength 0/1/2/3; phone regex; email regex; name min; identifier field (email vs phone)", "See validation module in test file", "P1", "-"),

    # A2. Home Dashboard & Notifications
    ("STU-HOME-01", "M", "Open Home tab after login", "Greeting (time-based), 8 quick-link tiles, in-progress course card, notification bell visible", "P1", "-"),
    ("STU-HOME-02", "M", "Open Home when no courses enrolled", "Quick links visible; 'Continue Learning' card absent; no crash", "P1", "-"),
    ("STU-HOME-03", "M", "Notification bell badge: unread count", "Badge shows correct unread count", "P2", "-"),
    ("STU-HOME-04", "M", "Tap 'My Learning' quick link", "Navigates to Learning tab", "P1", "-"),
    ("STU-HOME-05", "M", "Tap 'Live Classes' quick link", "Navigates to Live tab", "P1", "-"),
    ("STU-HOME-06", "M", "Tap 'Playground' quick link", "Navigates to Playground screen", "P1", "-"),
    ("STU-HOME-07", "M", "Tap 'Certificates' quick link", "Navigates to Certificates screen", "P1", "-"),
    ("STU-HOME-08", "M", "Pull-to-refresh on Home", "Spinner shown; data reloaded; no crash", "P2", "-"),
    ("STU-HOME-09", "M", "Open Home in airplane mode", "Error state with Retry button; Retry works when network returns", "P1", "-"),
    ("STU-NOTIF-01", "M", "Open Notifications screen (bell icon)", "List grouped by day; unread items highlighted; oldest at bottom", "P2", "-"),
    ("STU-NOTIF-02", "M", "Tap a notification", "Navigates to linked screen; item marked read", "P2", "-"),
    ("STU-NOTIF-03", "M", "Mark all as read", "All items un-highlighted; bell badge resets to 0", "P2", "-"),

    # A3. Explore & Search
    ("STU-EXP-01", "M", "Open Explore tab", "Course grid loads with thumbnails, titles, educators, ratings, prices; banner carousel at top", "P1", "-"),
    ("STU-EXP-02", "M", "Open Explore in airplane mode", "Error state with Retry; Retry works", "P1", "-"),
    ("STU-EXP-03", "M", "Tap a category chip (e.g. Web Development)", "List filters to that category only; chip shows active state", "P1", "-"),
    ("STU-EXP-04", "M", "Tap 'All' after a category filter", "Full course list restored", "P1", "-"),
    ("STU-EXP-05", "M", "Swipe banner carousel", "Next promoted course shown; auto-scroll works", "P2", "-"),
    ("STU-EXP-06", "M", "Search 'Python'", "Matching courses shown; each has thumbnail, title, educator, price", "P1", "-"),
    ("STU-EXP-07", "M", "Search 'xyzqrsuvw' (no results)", "Empty-state message; no crash", "P1", "-"),
    ("STU-EXP-08", "M", "Open course detail page", "Title, description, curriculum, educator bio, reviews, price, Enroll button all visible", "P1", "-"),
    ("STU-EXP-09", "M", "Play free preview lesson on course detail", "Video player opens; preview plays without enrollment; locked lessons show lock icon", "P1", "-"),
    ("STU-EXP-10", "M", "Heart icon on course detail (add to wishlist)", "Icon fills; course added to wishlist", "P2", "-"),
    ("STU-EXP-11", "M", "Heart icon again (remove from wishlist)", "Icon empties; course removed from wishlist", "P2", "-"),
    ("STU-EXP-12", "M", "Open detail of an already-enrolled course", "'Go to Course' button shown; 'Enroll' button absent", "P1", "-"),

    # A4. My Learning & Video Player
    ("STU-LRN-01", "M", "Open Learning tab -> Courses segment", "Enrolled courses with progress bars listed", "P1", "-"),
    ("STU-LRN-02", "M", "Open Learning tab with no enrollments", "Empty state with 'Explore Courses' CTA; no crash", "P1", "-"),
    ("STU-LRN-03", "M", "Switch to Assessments segment", "All assessments (quiz/exam/assignment) listed; pending count badge on tab", "P1", "-"),
    ("STU-LRN-04", "M", "Filter assessments by type 'Quiz'", "Only quiz items shown", "P2", "-"),
    ("STU-VID-01", "M", "Open a course lesson (enrolled)", "Video player opens; video buffers and plays; controls visible", "P1", "-"),
    ("STU-VID-02", "M", "Play then Pause video", "Video pauses cleanly; play resumes from same frame", "P1", "-"),
    ("STU-VID-03", "M", "Drag seek bar to middle of video", "Video jumps to that position; time indicator updates", "P1", "-"),
    ("STU-VID-04", "M", "Watch 2 min, exit, re-open same lesson", "Video resumes from ~2:00 (progress auto-saved)", "P1", "-"),
    ("STU-VID-05", "M", "Add a note at timestamp 1:30", "Note saved with 1:30 timestamp; tap timestamp -> video jumps there", "P2", "-"),
    ("STU-VID-06", "M", "Bookmark current timestamp", "Bookmark saved; tap bookmark -> video jumps there", "P2", "-"),
    ("STU-VID-07", "M", "Ask a question via Q&A panel", "Question posted in thread; tutor reply pending state shown", "P2", "-"),
    ("STU-VID-08", "M", "Download lesson at SD quality", "Download starts; lesson appears in Downloads page", "P2", "-"),
    ("STU-VID-09", "M", "Play downloaded lesson in airplane mode", "Offline video plays from local storage without buffering", "P2", "-"),
    ("STU-VID-10", "M", "Change video quality in-player (SD <-> HD)", "Quality switches; playback continues from same position", "P2", "-"),
    ("STU-VID-11", "M", "Complete all lessons; check course progress", "Progress shows 100%; certificate request option visible", "P1", "-"),

    # A5. Payments & Purchases
    ("STU-PAY-01", "M", "Tap Enroll on a paid course", "Navigates to checkout / payment page; price breakdown visible", "P1", "-"),
    ("STU-PAY-02", "M", "Apply valid coupon code at checkout", "Discount applied; 'You save ₹X' shown; final amount updated", "P1", "-"),
    ("STU-PAY-03", "M", "Apply invalid coupon FAKEXXXX999", "Error: 'Invalid coupon code'; price unchanged", "P1", "-"),
    ("STU-PAY-04", "M", "Open My Purchases -> Payments tab", "Payment rows list with course name, amount, date, status", "P1", "-"),
    ("STU-PAY-05", "M", "Switch to Enrollments tab on Payments", "Enrolled courses with enrollment date, access validity, progress", "P1", "-"),
    ("STU-PAY-06", "M", "Tap a payment row -> invoice sheet", "Invoice details (number, date, course, amount) in bottom sheet", "P2", "-"),
    ("STU-PAY-07", "M", "Request refund within 7-day window", "Refund submitted; 'Pending' status shown; success message", "P1", "-"),
    ("STU-PAY-08", "M", "Attempt refund on purchase older than 7 days", "Refund button disabled or 'Window closed' message; no request sent", "P1", "-"),
    ("STU-PAY-09", "M", "Request refund twice on same order", "Second attempt refused; no duplicate request", "P2", "-"),

    # A6. Live Classes & 1:1 Mentorship
    ("STU-LIVE-01", "M", "Open Live tab", "Upcoming sessions listed with date, time, course, tutor; week timetable visible", "P1", "-"),
    ("STU-LIVE-02", "M", "Open Live tab with no upcoming sessions", "Empty state shown; no crash", "P2", "-"),
    ("STU-LIVE-03", "M", "Tap Join on an active live session (red LIVE badge)", "Navigates to live room; video stream visible", "P1", "-"),
    ("STU-LIVE-04", "M", "Scroll to past sessions section", "History with attended/missed status shown", "P2", "-"),
    ("STU-MENT-01", "M", "Book 1:1 mentorship: select course, date, topic -> Book", "Booking appears with 'Waiting for reply' status", "P1", "-"),
    ("STU-MENT-02", "M", "View mentorship bookings list", "All bookings shown; correct status pills (Waiting/Confirmed/Done/Not accepted)", "P1", "-"),
    ("STU-MENT-03", "M", "Cancel a pending booking -> confirm", "Booking removed or status updated to 'Cancelled'", "P2", "-"),
    ("STU-MENT-04", "M", "Book with no enrolled course", "Selector shows no courses; Book button disabled", "P2", "-"),

    # A7. Quizzes & Assignments
    ("STU-QUIZ-01", "M", "Open Quizzes page", "All available quizzes listed with title, course, deadline, status", "P1", "-"),
    ("STU-QUIZ-02", "M", "Start a quiz: answer all MCQs -> Submit -> Confirm", "Score/Result screen: correct count, percentage, Pass/Fail shown", "P1", "-"),
    ("STU-QUIZ-03", "M", "Let quiz timer expire without submitting", "Quiz auto-submitted; result screen shown", "P1", "-"),
    ("STU-QUIZ-04", "M", "Attempt a quiz already completed", "Shows previous score; 'Retake' or locked depending on settings", "P2", "-"),
    ("STU-ASGN-01", "M", "Open Assignments page", "Pending assignments with title, course, deadline, status listed", "P1", "-"),
    ("STU-ASGN-02", "M", "Open code assignment: write solution -> Run Tests -> all pass -> Submit", "Assignment marked Submitted; status updates", "P1", "-"),
    ("STU-ASGN-03", "M", "Run Tests on wrong code", "Failing tests shown with actual vs expected output; submit not forced", "P2", "-"),

    # A8. Code Playground
    ("STU-PLAY-01", "M", "Open Playground page", "My Projects list and Challenges section both visible; daily run quota shown", "P1", "-"),
    ("STU-PLAY-02", "M", "Create new project (stack: React, title: 'My App')", "Project created; code editor opens with starter files; Run button visible", "P1", "-"),
    ("STU-PLAY-03", "M", "Write console.log('Hello') -> Run", "Output panel shows 'Hello'; no crash", "P1", "-"),
    ("STU-PLAY-04", "M", "Save project (Ctrl+S or Save button)", "Saved state indicator shown; reopen -> code preserved", "P1", "-"),
    ("STU-PLAY-05", "M", "Open an Easy challenge -> submit correct solution", "Tests pass (green); challenge marked Solved; celebration shown", "P1", "-"),
    ("STU-PLAY-06", "M", "Submit wrong solution for a challenge", "Failing tests shown; not marked Solved", "P1", "-"),
    ("STU-PLAY-07", "M", "Exhaust daily server run quota", "Remaining runs show 0; 'Daily limit reached' message; further runs blocked", "P2", "-"),

    # A9. Certificates
    ("STU-CERT-01", "M", "Open Certificates page", "Earned certificates listed with course name, issued date; badges section visible", "P1", "-"),
    ("STU-CERT-02", "M", "Request certificate on 100% complete + quiz-passed course", "Request submitted; 'Waiting for educator\\'s approval' status shown", "P1", "-"),
    ("STU-CERT-03", "M", "Request certificate on course with <80% progress", "Request button disabled or progress requirement message shown; no request sent", "P1", "-"),
    ("STU-CERT-04", "M", "View an earned certificate -> Share", "Preview shows student name, course, date; OS share sheet opens", "P2", "-"),
    ("STU-CERT-05", "M", "Copy verification URL and open in browser", "Certificate authenticity page loads", "P2", "-"),

    # A10. Profile & Settings
    ("STU-PROF-01", "M", "Open Profile tab", "Avatar, name, email, role, learning stats (courses, hours, certs) all visible", "P1", "-"),
    ("STU-PROF-02", "M", "Edit profile: change name -> Save", "Updated name shown immediately in header", "P1", "-"),
    ("STU-PROF-03", "M", "Change password with correct current password", "Success message; login with new password works", "P1", "-"),
    ("STU-PROF-04", "M", "Change password: new != confirm password", "Error: 'Passwords do not match'; password unchanged", "P1", "-"),
    ("STU-PROF-05", "M", "Toggle Live Classes push notification OFF -> reopen settings", "Toggle still OFF (persisted)", "P2", "-"),
    ("STU-PROF-06", "M", "Toggle WiFi-Only download mode ON", "Setting saved; persists across reopen", "P2", "-"),
    ("STU-PROF-07", "M", "Submit feedback: 4 stars + text", "Success message; modal closes", "P2", "-"),
    ("STU-PROF-08", "M", "Open Help & Support -> submit ticket", "Ticket ID returned; success message shown", "P2", "-"),
    ("STU-PROF-09", "M", "Open Refer page", "Unique referral link/code shown; Share button opens OS share sheet", "P3", "-"),
    ("STU-PROF-10", "M", "Downloads page: tap downloaded lesson in airplane mode", "Video plays offline from local storage", "P2", "-"),

    # A11. Public Pages (no login required)
    ("STU-PUB-01", "M", "Open root URL (no login)", "Public landing page: hero, nav links, course showcase, footer load correctly", "P1", "-"),
    ("STU-PUB-02", "M", "Open /watch page (no login)", "Free video wall loads; stats counters visible", "P1", "-"),
    ("STU-PUB-03", "M", "Play a free video on /watch (no login)", "Video player opens and plays without login prompt", "P1", "-"),
    ("STU-PUB-04", "M", "Filter watch page by category chip", "Only matching videos shown; 'All' restores full list", "P2", "-"),
    ("STU-PUB-05", "M", "Open /pricing page", "All 5 plans (Starter/Creator/Growth/Institute/Enterprise) with pricing and features; Growth marked Recommended", "P1", "-"),
    ("STU-PUB-06", "M", "Open /for-educators page", "Educator benefits and 'Apply Now' CTA visible; CTA navigates to sign-up or apply", "P2", "-"),
    ("STU-PUB-07", "M", "Access /home without login", "Redirected to Sign In page", "P1", "-"),

    # Responsive (Mobile / App)
    ("RSP-01", "M", "All student screens at 375 px (mobile portrait)", "Single column; bottom nav bar; tap targets >= 44 px; no horizontal overflow", "P2", "-"),
    ("RSP-02", "M", "All student screens at 768 px (tablet)", "Tablet grid (2-col); adjusted spacing; no truncation", "P2", "-"),
    ("RSP-03", "M", "All student screens at 1280 px (desktop)", "Side rail nav; multi-col grid (3-4 cols); content max-width constrained", "P2", "-"),
]

# ── B. EDUCATOR & ADMIN PANEL ───────────────────────────────────────────────
admin_educator_cases = [
    # B1. Educator Registration & Application
    ("EDU-AUTH-01", "M", "Sign up as Tutor role: fill all valid fields -> Continue as Educator", "OTP verification screen shown; role = tutor in session", "P1", "-"),
    ("EDU-AUTH-02", "M", "Demo Tutor login (priya@demo.in / demo123)", "Lands on educator dashboard or application page; not on student home", "P1", "-"),
    ("EDU-APP-01", "M", "Submit educator application: fill all fields + Verify ID -> Submit", "Success screen shown; status = Submitted / Under Review", "P1", "-"),
    ("EDU-APP-02", "M", "Verify ID button on application form", "Loading ~1.2 s; Verified badge appears; state persists", "P1", "-"),
    ("EDU-APP-03", "M", "Submit application with all required fields empty", "Validation errors on required fields; not submitted", "P1", "-"),
    ("EDU-APP-04", "M", "View application status page after submit", "Current status badge shown (Submitted / Under Review / Approved / Rejected / Changes Requested)", "P1", "-"),
    ("EDU-APP-05", "M", "Re-submit after 'Changes Requested': edit field -> Submit", "Status resets to Submitted; admin sees updated data", "P2", "-"),

    # B2. Course Management
    ("EDU-CRS-01", "M", "Create course: title, description, category, price, thumbnail -> Submit for Review", "Course created with Pending Review status; visible in educator course list", "P1", "-"),
    ("EDU-CRS-02", "M", "Edit course title and price -> Save", "Updated values shown; if previously Approved -> status returns to Pending Review", "P1", "-"),
    ("EDU-CRS-03", "M", "Add module to course (e.g. 'Chapter 1: Python Basics')", "Module appears in curriculum list; lessons can be added under it", "P1", "-"),
    ("EDU-CRS-04", "M", "Add lesson with video upload and Free Preview toggle", "Lesson added to module; free preview status correctly saved", "P1", "-"),
    ("EDU-CRS-05", "M", "Reorder two lessons via drag handle", "New order saved; students see updated curriculum sequence", "P2", "-"),
    ("EDU-CRS-06", "M", "Toggle Marketplace Listing ON for approved course", "Course appears on Bodhin Explore; 20% commission applies to marketplace sales", "P2", "-"),
    ("EDU-CRS-07", "M", "Toggle Marketplace Listing OFF", "Course removed from Explore; direct workspace access unaffected", "P2", "-"),

    # B3. Assessments
    ("EDU-ASS-01", "M", "Create Quiz: title, course, 20-min limit, 60% pass, deadline, 3 MCQ questions -> Publish", "Quiz published; students see it in Assessments tab", "P1", "-"),
    ("EDU-ASS-02", "M", "Create Exam (type = Exam)", "Type 'Exam' correctly shown in student's assessment list", "P1", "-"),
    ("EDU-ASS-03", "M", "Create Assignment with Code question + test cases -> Publish", "Students can see it in Assignments; code editor shown", "P1", "-"),
    ("EDU-ASS-04", "M", "View student submissions list for a published assessment", "Submissions list: student name, score, submitted time, Pass/Fail visible", "P2", "-"),

    # B4. Live Classes
    ("EDU-LIVE-01", "M", "Schedule live session: title, course, tomorrow 10 AM, 60 min", "Session created; students see it in Live tab; notification sent", "P1", "-"),
    ("EDU-LIVE-02", "M", "Schedule another session at same date/time", "Clash detection: 'Schedule conflict' error; second session not created", "P1", "-"),
    ("EDU-LIVE-03", "M", "Start a scheduled session", "Live room opens; students Join button activates; session status = Live (red)", "P1", "-"),
    ("EDU-LIVE-04", "M", "End live class -> confirm", "Session status = Conducted; students disconnected gracefully", "P1", "-"),
    ("EDU-LIVE-05", "M", "Add post-class summary", "Summary saved; students can read it in Live tab History", "P2", "-"),

    # B5. Batch Management
    ("EDU-BCH-01", "M", "Create batch: name 'Python Batch Jan 2026', course, start date", "Batch created; appears in Batches list", "P1", "-"),
    ("EDU-BCH-02", "M", "Add 2 students to the batch", "Students appear in batch members list; count updated", "P1", "-"),
    ("EDU-BCH-03", "M", "Mark attendance for a session: 2 of 3 present -> Save", "Attendance saved; 2/3 present in report; student attendance % updated", "P1", "-"),
    ("EDU-BCH-04", "M", "Send announcement to batch", "Announcement sent; batch students receive notification", "P2", "-"),

    # B6. Students & Mentorship
    ("EDU-STU-01", "M", "View enrolled students list for a course", "Name, email, enrollment date, progress %, last activity all visible", "P1", "-"),
    ("EDU-STU-02", "M", "Tap individual student row", "Student detail: lessons completed, quiz scores, assignment status, attendance % visible", "P2", "-"),
    ("EDU-MENT-01", "M", "View incoming mentorship requests", "Requests list: student, course, preferred date/time, topic, duration visible", "P1", "-"),
    ("EDU-MENT-02", "M", "Accept a mentorship request", "Status = Confirmed; student notified; student sees green 'Confirmed' pill", "P1", "-"),
    ("EDU-MENT-03", "M", "Reject a mentorship request with reason", "Status = Not accepted; student notified with rejection reason", "P1", "-"),

    # B7. Certificates & Coupons
    ("EDU-CERT-01", "M", "Approve student certificate request", "Certificate issued; student notified; appears in student's Certificates page", "P1", "-"),
    ("EDU-CERT-02", "M", "Reject certificate request with reason", "Status = Rejected; student sees rejection reason; can retake quiz and re-request", "P1", "-"),
    ("EDU-CPN-01", "M", "Create coupon PYTHON30 (30% off, max 100 uses)", "Coupon created; student can apply PYTHON30 at checkout for 30% discount", "P1", "-"),
    ("EDU-CPN-02", "M", "Use coupon beyond its max-use limit", "Coupon rejected: 'Max uses reached'", "P1", "-"),

    # B8. Educator Security
    ("EDU-SEC-01", "M", "Logged-in student tries to access /educator/* or educator dashboard URL", "Redirected to Student Home or Access Denied; educator content not visible", "P1", "-"),
    ("EDU-SEC-02", "M", "Educator tries to access /admin/* (Super Admin routes)", "Redirected or Access Denied; admin dashboard not accessible", "P1", "-"),
    ("EDU-SEC-03", "M", "Educator A tries to view Educator B's course edit page", "403 / Not Found; B's course not exposed", "P1", "-"),

    # C1. Super Admin: Login & Command Center
    ("ADM-AUTH-01", "M", "Demo Admin login (admin@demo.in / demo123)", "Lands on Command Center; admin bottom nav visible (Inbox / Dashboard / Money / More)", "P1", "-"),
    ("ADM-AUTH-02", "M", "Logged-in Admin manually navigates to /home (student route)", "Redirected to Admin Command Center; student content not shown", "P1", "-"),
    ("ADM-CMD-01", "M", "Open Command Center", "Revenue (GMV, commission, MRR), pending action tiles, Platform KPIs, activity feed all visible", "P1", "-"),
    ("ADM-CMD-02", "M", "Global search 'Arjun' from Command Center", "Matching users / courses / tenants shown by category", "P2", "-"),
    ("ADM-CMD-03", "M", "Tap Educator Approvals tile", "Navigates to Inbox -> Educators tab", "P1", "-"),
    ("ADM-CMD-04", "M", "Tap Payouts tile", "Navigates to Money -> Payouts tab", "P1", "-"),
    ("ADM-CMD-05", "M", "Tap Refund Requests tile", "Navigates to Money -> Refunds tab", "P1", "-"),

    # C2. Approvals: Educators
    ("ADM-APR-01", "M", "Open Inbox -> Educators tab", "Applications list; each card: academy name, applicant, city, subjects, submission time, status pill", "P1", "-"),
    ("ADM-APR-02", "M", "Tap application card -> detail pane", "Full detail: photo, name, email, phone, academy, subjects, experience, ID verified badge, sample URL, status", "P1", "-"),
    ("ADM-APR-03", "M", "Approve educator application -> confirm", "Educator workspace created; educator notified; pending tile count -1; application removed from list", "P1", "-"),
    ("ADM-APR-04", "M", "Reject educator with reason", "Educator notified; status = Rejected; pending count -1", "P1", "-"),
    ("ADM-APR-05", "M", "Request Changes with note", "Status = Changes Requested; 'Waiting on applicant' pill; educator sees admin note", "P1", "-"),
    ("ADM-APR-06", "M", "Select 2 ready applications -> Bulk Approve", "Both approved; both notified; pending count -2", "P2", "-"),

    # C3. Approvals: Courses
    ("ADM-CRS-01", "M", "Open Inbox -> Courses tab", "Pending courses list; each: thumbnail, title, educator, submitted time", "P1", "-"),
    ("ADM-CRS-02", "M", "Tap course card -> detail pane", "Course title, description, curriculum, educator, price visible", "P1", "-"),
    ("ADM-CRS-03", "M", "Approve course", "Course published; visible in Explore; educator notified; pending count -1", "P1", "-"),
    ("ADM-CRS-04", "M", "Request Changes on course with note", "Educator notified; can edit and re-submit; status = Changes Requested", "P1", "-"),

    # C4. Approvals: Reported Content
    ("ADM-RPT-01", "M", "Open Inbox -> Reports tab", "Flagged items: type, reporter, reason, timestamp visible", "P1", "-"),
    ("ADM-RPT-02", "M", "Dismiss a report (No issue)", "Item stays live; report resolved; removed from list", "P1", "-"),
    ("ADM-RPT-03", "M", "Remove a reported review", "Review deleted from course; report resolved", "P1", "-"),
    ("ADM-RPT-04", "M", "Unlist a reported course", "Course hidden from Explore; educator notified", "P1", "-"),
    ("ADM-RPT-05", "M", "Warn a reported user", "Warning recorded; user notified", "P2", "-"),

    # C5. User Management
    ("ADM-USR-01", "M", "Open Users page -> All filter", "All users listed with counts (All / Learners / Educators / Staff / Locked); name, email, role, joined date shown", "P1", "-"),
    ("ADM-USR-02", "M", "Switch filter to 'Educators'", "Only educator accounts shown", "P1", "-"),
    ("ADM-USR-03", "M", "Switch filter to 'Locked'", "Only locked accounts shown", "P1", "-"),
    ("ADM-USR-04", "M", "Search 'Arjun' in Users", "Real-time filter; matching users listed", "P1", "-"),
    ("ADM-USR-05", "M", "Tap user row -> 360 detail", "Personal info, enrollments, orders, activity, lock option all visible", "P1", "-"),
    ("ADM-USR-06", "M", "Lock account with reason", "Account locked; audit log entry created; locked user cannot login", "P1", "-"),
    ("ADM-USR-07", "M", "Unlock account", "Account active again; user can login; audit log entry created", "P1", "-"),

    # C6. Finance
    ("ADM-PAY-01", "M", "Open Money -> Payouts tab", "Upcoming payout run: date, educators list (name, amount, orders, bank last4), total payout amount, commission breakdown visible", "P1", "-"),
    ("ADM-PAY-02", "M", "Approve payout run -> confirm", "Run status = Approved; educators notified; payout history entry created; audit logged", "P1", "-"),
    ("ADM-PAY-03", "M", "Hold one educator's payout line with reason", "That educator's payout held; others unaffected; hold reason visible", "P2", "-"),
    ("ADM-REF-01", "M", "Open Money -> Refunds tab", "Pending refund requests: student, course, amount, reason, days since purchase visible", "P1", "-"),
    ("ADM-REF-02", "M", "Approve refund", "Refund processed; student notified; finance report updated; request = Approved", "P1", "-"),
    ("ADM-REF-03", "M", "Reject refund with reason", "Student notified with reason; request = Rejected", "P1", "-"),
    ("ADM-BIL-01", "M", "Open Money -> Billing tab", "Subscription list: MRR, plan, next billing, trial flag, past-due flag per tenant", "P2", "-"),
    ("ADM-REP-01", "M", "Open Money -> Reports tab", "GMV chart, revenue mix (Bodhin own / Marketplace / Subscriptions), key metrics visible", "P2", "-"),

    # C7. Tenant Management
    ("ADM-TNT-01", "M", "Open Tenants tab -> All filter", "All workspaces: name, plan badge, status, student count, GMV listed", "P1", "-"),
    ("ADM-TNT-02", "M", "Filter Tenants -> Trial", "Only trial tenants shown; days remaining visible", "P2", "-"),
    ("ADM-TNT-03", "M", "Filter Tenants -> Past Due", "Only past-due tenants; red flag visible", "P2", "-"),
    ("ADM-TNT-04", "M", "Tap a tenant -> detail", "Plan, billing, usage meters (students/storage/live hrs), revenue, activity feed all visible", "P1", "-"),
    ("ADM-TNT-05", "M", "Tenant usage at 70%", "Usage bar yellow (warn state) shown", "P2", "-"),
    ("ADM-TNT-06", "M", "Tenant usage at 100%", "Usage bar red (limit); blocking action triggered", "P1", "-"),
    ("ADM-TNT-07", "M", "Add internal note to tenant", "Note saved with admin name and timestamp; visible in notes history", "P2", "-"),

    # C8. Plan Management
    ("ADM-PLN-01", "M", "Open Plans page", "All 5 plans with pricing, limits, features; Growth marked Recommended", "P1", "-"),
    ("ADM-PLN-02", "M", "Edit Starter plan monthly price from ₹799 -> ₹999 -> Save", "Price updated; Pricing page reflects ₹999; config history records change", "P1", "-"),
    ("ADM-PLN-03", "M", "Edit Creator plan student limit 150 -> 200 -> Save", "Tenants on Creator plan get new 200-student limit", "P1", "-"),
    ("ADM-PLN-04", "M", "Edit add-on price (e.g. extra storage per 10GB) -> Save", "Educators purchasing that add-on see new price", "P2", "-"),

    # C9. Content Curation
    ("ADM-CUR-01", "M", "Add a course to promoted banners", "Course appears in Explore page top banner carousel", "P2", "-"),
    ("ADM-CUR-02", "M", "Add a new category 'Data Science'", "Category appears as filter chip in Explore; educators can select it when creating a course", "P2", "-"),
    ("ADM-CUR-03", "M", "Hide a category", "Category chip hidden from Explore; existing courses unaffected", "P3", "-"),

    # C10. Broadcast
    ("ADM-BRD-01", "M", "Send broadcast to All Students: title + body -> Send", "All students receive in-app notification; broadcast appears in history with reach count and timestamp", "P1", "-"),
    ("ADM-BRD-02", "M", "Send broadcast to a specific tenant", "Only that tenant's students receive it; others unaffected", "P2", "-"),

    # C11. Support Tickets
    ("ADM-TKT-01", "M", "Open Tickets page", "Open tickets listed: category, subject, user name, created time, status", "P1", "-"),
    ("ADM-TKT-02", "M", "Reply to ticket", "Reply sent; ticket status = In Progress; user notified", "P1", "-"),
    ("ADM-TKT-03", "M", "Resolve ticket", "Status = Resolved; user notified; moves out of open list", "P1", "-"),

    # C12. Feature Flags
    ("ADM-FLG-01", "M", "Toggle Live Classes OFF -> check student app", "Students' Live tab shows 'Coming Soon' or section hidden; no crash", "P1", "-"),
    ("ADM-FLG-02", "M", "Toggle Live Classes back ON", "Live Classes section restored for students", "P1", "-"),
    ("ADM-FLG-03", "M", "Toggle Marketplace Checkout OFF", "Enroll/Buy button hidden or disabled for marketplace courses; direct workspace purchases unaffected", "P1", "-"),
    ("ADM-FLG-04", "M", "Enable Maintenance Mode with custom message", "Custom maintenance message shown to all users; admin dashboard still accessible", "P2", "-"),
    ("ADM-FLG-05", "M", "Disable Maintenance Mode", "App returns to normal; maintenance message gone", "P2", "-"),

    # C13. Platform Settings
    ("ADM-CFG-01", "M", "Change commission rate 20% -> 15% -> Save", "Future marketplace orders use 15%; config history records old/new values", "P1", "-"),
    ("ADM-CFG-02", "M", "Change refund window 7 -> 14 days -> Save", "Students can now request refund within 14 days; student refund UI reflects this", "P1", "-"),

    # C14. Audit Log
    ("ADM-AUD-01", "M", "Open Audit page after performing multiple admin actions", "All actions logged: educator approved, course approved, refund decided, payout run, user locked, flag toggled", "P1", "-"),
    ("ADM-AUD-02", "M", "View Config Change History section", "Each change: area (plan/addon/platform), label, before/after values, changed by, timestamp", "P1", "-"),

    # C15. Role-Based Access Control
    ("ADM-RBAC-01", "M", "Finance role admin: access Money tab", "Payouts, Refunds, Billing, Reports all accessible", "P1", "-"),
    ("ADM-RBAC-02", "M", "Finance role admin: try to access Educator Approvals", "Tile hidden or action refused; no access", "P1", "-"),
    ("ADM-RBAC-03", "M", "Moderator role admin: access Reports (flagged content)", "Reports tab accessible; content moderation actions work", "P1", "-"),
    ("ADM-RBAC-04", "M", "Moderator role admin: try to access Payouts", "Access denied or tab hidden", "P1", "-"),
    ("ADM-RBAC-05", "M", "Support role admin: access Tickets only", "Tickets page accessible; Money/Approvals hidden", "P2", "-"),
    ("ADM-RBAC-06", "M", "Invite team member (email, role = Support) -> Send Invite", "Invite sent; pending entry in Team list; invitee receives email", "P2", "-"),

    # D. Cross-System Sync
    ("SYNC-01", "M", "Educator approved by admin", "Educator can now create and publish courses; workspace visible in Tenants list", "P1", "-"),
    ("SYNC-02", "M", "Course approved by admin", "Course appears in Explore; students can enroll", "P1", "-"),
    ("SYNC-03", "M", "Refund approved by admin", "Student notified; payment history shows Refunded", "P1", "-"),
    ("SYNC-04", "M", "Payout run approved", "Educator sees updated earnings; payout history entry added", "P1", "-"),
    ("SYNC-05", "M", "Feature flag Live Classes toggled OFF", "Students' Live tab hides or shows Coming Soon immediately", "P1", "-"),
    ("SYNC-06", "M", "Maintenance mode enabled with message", "All users see maintenance banner/page; admin unaffected", "P2", "-"),
    ("SYNC-07", "M", "User account locked", "Locked user cannot login; 'Account locked' message shown", "P1", "-"),
    ("SYNC-08", "M", "User account unlocked", "User can login again normally", "P1", "-"),
    ("SYNC-09", "M", "Broadcast sent to All Students", "All students receive notification in Notifications screen", "P1", "-"),
    ("SYNC-10", "M", "Plan price edited (Starter ₹799 -> ₹999)", "Pricing page shows ₹999 on next load", "P1", "-"),
    ("SYNC-11", "M", "Category 'Data Science' added", "Explore category chips include 'Data Science' on next load", "P2", "-"),
    ("SYNC-12", "M", "Course added to promoted banners", "Explore page banner carousel shows the featured course", "P2", "-"),
    ("SYNC-13", "M", "Certificate approved by educator", "Certificate appears in student's Certificates page; student notified", "P1", "-"),
    ("SYNC-14", "M", "Support ticket replied by admin", "Student sees reply in ticket thread; status = In Progress", "P1", "-"),

    # E. Security
    ("SEC-01", "M", "Student token calling /admin/* routes", "401 / 403; admin content not exposed", "P1", "-"),
    ("SEC-02", "M", "Student A requests Student B's orders or profile", "403 / 404; B's data not returned", "P1", "-"),
    ("SEC-03", "M", "Educator A edits Educator B's course URL directly", "403 / Not Found; B's course not modified", "P1", "-"),
    ("SEC-04", "M", "Tamper checkout price in client request", "Server recomputes price; client value ignored", "P1", "-"),
    ("SEC-05", "M", "<script> or SQL injection in name / address / fields", "Stored and rendered escaped; no XSS or SQL execution", "P1", "-"),
    ("SEC-06", "M", "Unauthenticated user accesses /home or any protected route", "Redirected to Sign In; protected content not shown", "P1", "-"),
    ("SEC-07", "M", "Duplicate refund request on same order", "Second request refused; no duplicate refund", "P2", "-"),
    ("SEC-08", "M", "Admin account logs in: check that student home is never shown", "Admin always lands on Command Center", "P1", "-"),
    ("SEC-09", "M", "Finance admin tries to approve an educator application", "Action refused; audit log records attempt if applicable", "P1", "-"),
    ("SEC-10", "M", "Password reset with expired/reused token", "Refused with message; new token required", "P1", "-"),
]

HEADER = ["ID", "Type", "Steps", "Expected", "Pri", "Status"]

# Export File 1
f1_path = r"g:\thebodhin\Bodhin_Test_Cases_File1_Student_Mobile.csv"
with open(f1_path, "w", newline="", encoding="utf-8-sig") as f:
    writer = csv.writer(f)
    writer.writerow(HEADER)
    writer.writerows(student_cases)
print(f"File 1 written ({len(student_cases)} rows) -> {f1_path}")

# Export File 2
f2_path = r"g:\thebodhin\Bodhin_Test_Cases_File2_Admin_Educator.csv"
with open(f2_path, "w", newline="", encoding="utf-8-sig") as f:
    writer = csv.writer(f)
    writer.writerow(HEADER)
    writer.writerows(admin_educator_cases)
print(f"File 2 written ({len(admin_educator_cases)} rows) -> {f2_path}")

# Export Combined File
f_all_path = r"g:\thebodhin\Bodhin_All_Test_Cases.csv"
with open(f_all_path, "w", newline="", encoding="utf-8-sig") as f:
    writer = csv.writer(f)
    writer.writerow(HEADER)
    writer.writerows(student_cases)
    writer.writerows(admin_educator_cases)
print(f"Combined File written ({len(student_cases) + len(admin_educator_cases)} rows) -> {f_all_path}")
