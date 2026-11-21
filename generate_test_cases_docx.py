import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import parse_xml, OxmlElement
from docx.oxml.ns import nsdecls, qn
import os

def create_bodhin_test_cases_docx(file_path):
    doc = docx.Document()

    # Set page margins to 0.75 in
    for section in doc.sections:
        section.top_margin = Inches(0.75)
        section.bottom_margin = Inches(0.75)
        section.left_margin = Inches(0.75)
        section.right_margin = Inches(0.75)

    # Styles & Colors
    PRIMARY_COLOR = RGBColor(13, 33, 55)     # #0D2137 Dark Bodhin Navy
    SECONDARY_COLOR = RGBColor(240, 106, 56) # #F06A38 Bodhin Coral
    DARK_TEXT = RGBColor(30, 41, 59)         # #1E293B
    LIGHT_BG = "F8FAFC"                      # #F8FAFC
    HEADER_BG = "0D2137"                     # Dark Navy
    SUBHEADER_BG = "E2E8F0"                  # Slate Light

    def set_cell_background(cell, fill_hex):
        tcPr = cell._tc.get_or_add_tcPr()
        tcPr.append(parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>'))

    def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
        tcPr = cell._tc.get_or_add_tcPr()
        tcMar = parse_xml(f'<w:tcMar {nsdecls("w")}><w:top w:w="{top}" w:type="dxa"/><w:bottom w:w="{bottom}" w:type="dxa"/><w:left w:w="{left}" w:type="dxa"/><w:right w:w="{right}" w:type="dxa"/></w:tcMar>')
        tcPr.append(tcMar)

    def set_table_borders(table, color="CBD5E1", sz="4"):
        tblPr = table._tbl.tblPr
        borders = parse_xml(
            f'<w:tblBorders {nsdecls("w")}>'
            f'<w:top w:val="single" w:sz="{sz}" w:space="0" w:color="{color}"/>'
            f'<w:bottom w:val="single" w:sz="{sz}" w:space="0" w:color="{color}"/>'
            f'<w:left w:val="none"/>'
            f'<w:right w:val="none"/>'
            f'<w:insideH w:val="single" w:sz="{sz}" w:space="0" w:color="{color}"/>'
            f'<w:insideV w:val="single" w:sz="{sz}" w:space="0" w:color="{color}"/>'
            f'</w:tblBorders>'
        )
        tblPr.append(borders)

    # Title & Metadata
    title_p = doc.add_paragraph()
    title_p.paragraph_format.space_before = Pt(0)
    title_p.paragraph_format.space_after = Pt(4)
    run_title = title_p.add_run("BODHIN LMS PLATFORM")
    run_title.font.name = "Arial"
    run_title.font.size = Pt(24)
    run_title.font.bold = True
    run_title.font.color.rgb = PRIMARY_COLOR

    sub_p = doc.add_paragraph()
    sub_p.paragraph_format.space_after = Pt(14)
    run_sub = sub_p.add_run("Comprehensive Manual Test Cases Document (Super Admin · Educator · Tutor · Student)")
    run_sub.font.name = "Arial"
    run_sub.font.size = Pt(13)
    run_sub.font.color.rgb = SECONDARY_COLOR
    run_sub.font.bold = True

    # Info Header Table
    meta_table = doc.add_table(rows=3, cols=2)
    meta_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    meta_table.autofit = False
    set_table_borders(meta_table, "CBD5E1", "4")

    meta_data = [
        [("Project Name:", " Bodhin Multi-Tenant Learning Management System"),
         ("Document Version:", " 2.0 (Post UI & WebRTC Real-Time Stabilization)")],
        [("Target Environments:", " Desktop (1366x768 - 1920x1080) & Mobile Web (360x780)"),
         ("Execution Mode:", " Manual QA Testing with Pass / Fail Tracking")],
        [("Date of Generation:", " 21 November 2026"),
         ("Tester Name:", " ___________________________")]
    ]

    for row_idx, row in enumerate(meta_data):
        for col_idx, (k, v) in enumerate(row):
            cell = meta_table.cell(row_idx, col_idx)
            cell.width = Inches(3.5)
            set_cell_background(cell, "F1F5F9" if row_idx % 2 == 0 else "FFFFFF")
            set_cell_margins(cell, top=80, bottom=80, left=120, right=120)
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            r1 = p.add_run(k)
            r1.font.bold = True
            r1.font.size = Pt(9.5)
            r1.font.color.rgb = DARK_TEXT
            r2 = p.add_run(v)
            r2.font.size = Pt(9.5)
            r2.font.color.rgb = DARK_TEXT

    doc.add_paragraph().paragraph_format.space_after = Pt(10)

    # Executive Summary & Test Sign-off Box
    h2 = doc.add_heading(level=2)
    r_h2 = h2.add_run("Executive QA Execution & Sign-off Dashboard")
    r_h2.font.name = "Arial"
    r_h2.font.color.rgb = PRIMARY_COLOR
    h2.paragraph_format.space_after = Pt(6)

    dash_table = doc.add_table(rows=6, cols=6)
    dash_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    dash_table.autofit = False
    set_table_borders(dash_table, "94A3B8", "6")

    headers = ["Role / Module", "Total TCs", "Passed [ ✓ ]", "Failed [ ✗ ]", "Blocked [ ! ]", "Sign-Off / Signature"]
    hdr_row = dash_table.rows[0]
    for idx, name in enumerate(headers):
        cell = hdr_row.cells[idx]
        set_cell_background(cell, HEADER_BG)
        set_cell_margins(cell, top=100, bottom=100, left=100, right=100)
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_after = Pt(0)
        r = p.add_run(name)
        r.font.bold = True
        r.font.size = Pt(9)
        r.font.color.rgb = RGBColor(255, 255, 255)

    dash_data = [
        ["1. Super Admin Portal (/admin)", "6", "____", "____", "____", "_________________"],
        ["2. Educator Portal (/educator, /edu)", "21", "____", "____", "____", "_________________"],
        ["3. Tutor Portal (Restricted /educator)", "5", "____", "____", "____", "_________________"],
        ["4. Student Portal (Web & Mobile)", "15", "____", "____", "____", "_________________"],
        ["5. Cross-Role & System Integration", "3", "____", "____", "____", "_________________"]
    ]

    for r_idx, row_items in enumerate(dash_data, start=1):
        row = dash_table.rows[r_idx]
        bg = "FFFFFF" if r_idx % 2 != 0 else "F8FAFC"
        for c_idx, val in enumerate(row_items):
            cell = row.cells[c_idx]
            set_cell_background(cell, bg)
            set_cell_margins(cell, top=80, bottom=80, left=80, right=80)
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            if c_idx in [1, 2, 3, 4]:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            else:
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            r = p.add_run(val)
            r.font.size = Pt(9)
            if c_idx == 0:
                r.font.bold = True
            r.font.color.rgb = DARK_TEXT

    p_note = doc.add_paragraph()
    p_note.paragraph_format.space_before = Pt(6)
    p_note.paragraph_format.space_after = Pt(14)
    r_note = p_note.add_run("Instructions for Tester: Execute each step outlined below. Check [ ✓ ] Pass if behavior matches Expected Result, [ ✗ ] Fail if any bug occurs, or [ ! ] Blocked if dependencies prevent testing. Document any deviation in the 'Actual Result / Notes' box.")
    r_note.font.size = Pt(8.5)
    r_note.font.italic = True
    r_note.font.color.rgb = RGBColor(100, 116, 139)

    # Test cases data definition
    test_suites = [
        {
            "category": "SECTION 1: SUPER ADMIN PORTAL (/admin)",
            "description": "Verification of platform-wide executive oversight, monetization controls, course approvals, and multi-tenant ledger.",
            "cases": [
                {
                    "id": "TC-ADM-01",
                    "module": "Executive Dashboard",
                    "scenario": "Verify Platform-Wide Aggregated KPI Metrics",
                    "pre": "Super Admin credentials available; active courses, batches, and learners exist in database.",
                    "steps": "1. Navigate to /admin.\n2. Observe primary KPI summary cards: Total Active Learners, Total Courses, Active Batches, and Platform Revenue.\n3. Compare displayed figures with aggregated database queries.",
                    "expected": "All counters render accurate real-time metrics without NaN, 0-value glitch, or calculation mismatch. Cards adapt cleanly to desktop width."
                },
                {
                    "id": "TC-ADM-02",
                    "module": "Admin Navigation Header",
                    "scenario": "Verify Header Branding, Role Badge & Responsive Layout",
                    "pre": "Admin logged in on Desktop (1366px) and Mobile (360px).",
                    "steps": "1. Open /admin on Desktop (1366px width).\n2. Verify Bodhin official logo, 'Super Admin' pill badge, profile avatar, and greeting.\n3. Resize screen down to Mobile viewport (360px) and check header layout.",
                    "expected": "Header renders official Bodhin SVG/PNG brand icon without distortion. On mobile, elements stack cleanly without horizontal overflow."
                },
                {
                    "id": "TC-ADM-03",
                    "module": "Content Moderation (/admin/content)",
                    "scenario": "Review, Approve, and Reject Submitted Course",
                    "pre": "Educator has submitted a newly created course for platform publishing.",
                    "steps": "1. Navigate to /admin/content.\n2. Locate course in 'Pending Review' table.\n3. Inspect course curriculum, uploaded video lessons, and pricing.\n4. Click 'Approve Course' (or 'Reject with Feedback').",
                    "expected": "Course status transitions to 'Published'. Immediately appears in public course catalog for learners. If rejected, educator receives notification."
                },
                {
                    "id": "TC-ADM-04",
                    "module": "Tenant Money & Payouts (/admin/money)",
                    "scenario": "Verify Educator Payout Request Processing & Approval",
                    "pre": "Educator has requested a payout from their available earnings balance.",
                    "steps": "1. Navigate to /admin/money -> Switch to 'Payouts' tab using Pill Tabs.\n2. Locate educator's payout request (amount, bank account, IFSC, TDS).\n3. Click 'Approve Payout' and confirm disbursement.\n4. Log in as Educator and check /edu/earnings.",
                    "expected": "Payout marked 'Approved' with payment reference ID. Ledger deducts amount from educator's balance. Educator's dashboard confirms cleared payout."
                },
                {
                    "id": "TC-ADM-05",
                    "module": "Billing & Refunds (/admin/money)",
                    "scenario": "Verify Student Refund Workflow & Enrollment Revocation",
                    "pre": "Student purchased a course and submitted a refund request within policy.",
                    "steps": "1. Under /admin/money, navigate to 'Refunds' tab.\n2. Review student name, course purchased, and refund reason.\n3. Click 'Process Refund'.\n4. Log in as Student and check course access.",
                    "expected": "Refund status updates to 'Processed'. Student's access to course lectures is automatically revoked. Platform ledger logs debit transaction."
                },
                {
                    "id": "TC-ADM-06",
                    "module": "Mobile UX Parity (/admin)",
                    "scenario": "Verify Mobile Floating '+ Create' Action & Bottom Sheet",
                    "pre": "Admin accessing portal from mobile screen (<768px).",
                    "steps": "1. Open /admin on mobile browser or responsive emulator (360x780).\n2. Verify the floating circular '+ Create' action button at bottom right.\n3. Tap '+ Create' button.\n4. Tap outside the sheet or click close.",
                    "expected": "Floating button stays fixed above bottom navigation. Tapping opens an interactive slide-up bottom sheet with shortcuts (Course, Batch, Invite, Broadcast)."
                }
            ]
        },
        {
            "category": "SECTION 2: EDUCATOR PORTAL (/educator, /edu)",
            "description": "Verification of course authoring, live classes, batch cohorts, assessment rubrics, grading resubmissions, tutor team invitations, and subscription usage.",
            "cases": [
                {
                    "id": "TC-EDU-01",
                    "module": "Course Curriculum Builder",
                    "scenario": "Create Multi-Module Course with Video Lessons & Notes",
                    "pre": "Educator logged in at /educator/courses.",
                    "steps": "1. Click '+ Create Course'.\n2. Enter Title, Description, Thumbnail, Category, and Pricing (INR).\n3. Add 'Module 1: Introduction' and 'Module 2: Advanced Strategies'.\n4. Add 2 video lessons per module, attach downloadable PDF notes, and save.",
                    "expected": "Curriculum hierarchy persists accurately in database. Draft course displays in educator's course repository with accurate lesson count."
                },
                {
                    "id": "TC-EDU-02",
                    "module": "Free Preview Gating",
                    "scenario": "Configure Free Preview Lesson vs Locked Paid Lessons",
                    "pre": "Draft course with at least 3 lessons created.",
                    "steps": "1. In course editor, toggle Lesson 1 as 'Free Preview: YES'.\n2. Leave Lesson 2 and Lesson 3 as 'Free Preview: NO'.\n3. Publish course and open course page as an unenrolled student.",
                    "expected": "Unenrolled student can play Lesson 1 video completely. Attempting to play Lesson 2 prompts student to enroll/purchase with locked icon."
                },
                {
                    "id": "TC-EDU-03",
                    "module": "Batch & Cohort Management (/educator/batches)",
                    "scenario": "Create Batch, Assign Tutor, and Set Student Seat Capacity",
                    "pre": "Published course available; at least one active tutor exists.",
                    "steps": "1. Navigate to /educator/batches -> Click '+ New Batch'.\n2. Select Course, enter batch name (e.g., 'Q4 Mastery Cohort'), start date, and end date.\n3. Set max student capacity to 30.\n4. Assign Tutor from dropdown and click Save.",
                    "expected": "Batch is created with 0/30 seats filled. Assigned Tutor immediately sees this batch under their assigned classes."
                },
                {
                    "id": "TC-EDU-04",
                    "module": "Live Class Scheduling (/educator/live)",
                    "scenario": "Schedule Live Class with Automated Clash Detection",
                    "pre": "Batch created; existing class scheduled for Friday 5:00 PM.",
                    "steps": "1. Navigate to /educator/live -> Click '+ Schedule'.\n2. Select batch and intentionally set time to Friday 5:15 PM (overlapping existing session).\n3. Observe schedule modal validation.\n4. Change to a non-conflicting time (6:30 PM) and save.",
                    "expected": "System detects time conflict and surfaces prominent red 'Clash' badge preventing accidental double-booking. Non-clashing class saves to Timetable."
                },
                {
                    "id": "TC-EDU-05",
                    "module": "Live Class Hardware Lobby",
                    "scenario": "Verify Pre-Join Camera, Microphone Level Meter & Speaker Test",
                    "pre": "Scheduled live session ready to start.",
                    "steps": "1. Click 'Start Class' on scheduled session.\n2. Observe pre-join lobby dialog.\n3. Select Camera from dropdown; toggle video ON/OFF.\n4. Speak into microphone and observe audio level visualizer bar.\n5. Click 'Speaker Test' to verify audio output.",
                    "expected": "Real video preview renders instantly. Green audio volume meter bounces in sync with vocal input. Fake/simulated network stats are removed."
                },
                {
                    "id": "TC-EDU-06",
                    "module": "Live Class Host Controls (WebRTC)",
                    "scenario": "Host WebRTC Room: Screen Share, Mute All, Hand Raise, Live Polls",
                    "pre": "Educator and at least 2 students connected in live room.",
                    "steps": "1. Click 'Go Live' to begin broadcast.\n2. Click 'Share Screen' and select application window.\n3. In People tab, click 'Mute All'.\n4. Ask student to click 'Raise Hand'; verify teacher sees alert and clicks 'Allow to Speak'.\n5. Launch a live poll with 3 options and observe real-time tally.",
                    "expected": "Screen share streams smoothly with low latency. 'Mute All' mutes all remote participants. Raised hand highlights user. Poll votes increment live."
                },
                {
                    "id": "TC-EDU-07",
                    "module": "Post-Class Summary & Attendance",
                    "scenario": "End Live Session and Verify Authentic Attendance Log",
                    "pre": "Live class completed with enrolled attendees.",
                    "steps": "1. Click 'End Class' -> Confirm 'End session for everyone'.\n2. Inspect post-class summary dashboard.\n3. Verify attendees list against users who actually joined the room.",
                    "expected": "Summary presents actual meeting duration and authentic attendee names. Scripted/fake bot counts (e.g. fake '247 viewers') are completely absent."
                },
                {
                    "id": "TC-EDU-08",
                    "module": "Assessment Builder (/edu/assess)",
                    "scenario": "Create Timed Quiz with Multiple Choice Questions & Answer Keys",
                    "pre": "Educator in /edu/assess.",
                    "steps": "1. Click '+ Create' -> Select 'Quiz'.\n2. Enter Title, description, passing score (70%), and duration (15 mins).\n3. Add Question 1 (Single Choice) and Question 2 (Multi-Select).\n4. Specify correct answer key and explanations. Click 'Publish'.",
                    "expected": "Quiz saves and attaches to course/curriculum. Students attempting quiz are auto-scored strictly against the configured answer key."
                },
                {
                    "id": "TC-EDU-09",
                    "module": "Assignment Builder (/edu/assess)",
                    "scenario": "Create Assignment with Custom Rubric Criteria",
                    "pre": "Educator in /edu/assess.",
                    "steps": "1. Click '+ Create' -> Select 'Assignment'.\n2. Configure deliverables allowed: File Upload (PDF/PNG), External Link, and Code.\n3. Under Grading Rubric, add 2 criteria: 'Strategy & Depth' (Max: 50) and 'Presentation Quality' (Max: 50).\n4. Set deadline and publish.",
                    "expected": "Assignment published. Student sees clear submission requirements along with the exact rubric grading breakdown."
                },
                {
                    "id": "TC-EDU-10",
                    "module": "Assessment Grading (/edu/grading)",
                    "scenario": "Grade Student Submission using Interactive Rubric Criteria",
                    "pre": "Student has submitted assignment deliverables.",
                    "steps": "1. Open /edu/grading.\n2. Click on student submission (e.g., Arjun's Growth Strategy).\n3. Review attached PDF and link preview.\n4. Enter rubric scores: Strategy (45/50) and Presentation (45/50).\n5. Type feedback remarks and click 'Publish Grade'.",
                    "expected": "Score calculates to 90% automatically. Submission status changes to 'Graded'. Student receives grade card and educator remarks."
                },
                {
                    "id": "TC-EDU-11",
                    "module": "Grading Resubmission Loop",
                    "scenario": "Request Assignment Resubmission with Actionable Feedback",
                    "pre": "Student submitted an incomplete draft assignment.",
                    "steps": "1. In /edu/grading, open the incomplete submission.\n2. Click 'Request Resubmit'.\n3. Enter return note: 'Please provide all 3 required ad banner dimensions'.\n4. Confirm return.",
                    "expected": "Submission status changes back to 'Draft'. Student sees return note and can upload revised files. Previous submission history is preserved."
                },
                {
                    "id": "TC-EDU-12",
                    "module": "Doubt Resolution (/edu/doubts)",
                    "scenario": "Answer Student Query in Threaded Doubt Queue",
                    "pre": "Student posted a query regarding a specific course lesson.",
                    "steps": "1. Navigate to /edu/doubts -> Click 'Waiting' tab.\n2. Open student query referencing Lecture 3.\n3. Type comprehensive answer (with code snippet/image if needed).\n4. Click 'Send Answer'.",
                    "expected": "Doubt moves from 'Waiting' to 'Answered' queue. Student receives in-app notification and sees verified educator answer under lesson Q&A."
                },
                {
                    "id": "TC-EDU-13",
                    "module": "Certificates (/edu/certificates)",
                    "scenario": "Configure Automated Issuance Rules & Template Branding",
                    "pre": "Course with lessons and final quiz exists.",
                    "steps": "1. Open /edu/certificates -> Switch to 'Rules' tab.\n2. Configure threshold: 'Require 75% video completion' AND 'Pass final quiz with 70%'.\n3. Under 'Templates', select template and verify educator signature & badge.\n4. Save rules.",
                    "expected": "System binds auto-issue trigger. When student satisfies criteria, certificate is generated automatically without manual intervention."
                },
                {
                    "id": "TC-EDU-14",
                    "module": "Team & Tutors (/edu/team)",
                    "scenario": "Invite Tutor via Email with Course Selection Checkboxes",
                    "pre": "Educator logged in; SMTP email service operational.",
                    "steps": "1. Go to /edu/team -> Click '+ Invite Tutor'.\n2. Enter Tutor Full Name and Email Address.\n3. Observe 'Assign Courses' list: check checkboxes for specific courses.\n4. Set Tutor revenue share % and click 'Send Invite'.",
                    "expected": "Course checkboxes render cleanly with titles. Invitation email dispatches via SMTP. Tutor appears in team list under 'Invited' state with 'Resend' button."
                },
                {
                    "id": "TC-EDU-15",
                    "module": "Earnings & Bank Setup (/edu/earnings)",
                    "scenario": "Configure Bank Payout Credentials & Submit Payout Request",
                    "pre": "Educator has positive available balance from course sales.",
                    "steps": "1. Navigate to /edu/earnings -> Click 'Payment Setup' (/edu/payments-setup).\n2. Input Bank Account Name, Number, IFSC code, and UPI ID.\n3. Return to Earnings and click 'Request Payout'.\n4. Enter payout amount and confirm.",
                    "expected": "Bank credentials save securely. Payout request logs under 'Pending Payouts'. Request surfaces immediately in Super Admin /admin/money queue."
                },
                {
                    "id": "TC-EDU-16",
                    "module": "Subscription & Usage (/edu/subscription)",
                    "scenario": "Verify Usage Gauges and 70% / 85% / 100% Limit Policy Alerts",
                    "pre": "Educator on active subscription plan (e.g., Institute plan).",
                    "steps": "1. Navigate to /edu/subscription.\n2. Inspect resource gauges: Active Students, Video Storage GB, Live Room Hours, Tutor Seats.\n3. Verify warning banner when usage exceeds 70% ('Just a heads-up') and 85% ('Consider a top-up').",
                    "expected": "Gauges accurately calculate current tenant consumption against quota limits. Threshold banners display appropriate tone (warning/urgent)."
                },
                {
                    "id": "TC-EDU-17",
                    "module": "Subscription Plans (/edu/subscription)",
                    "scenario": "Verify Enterprise Plan 'Talk to us' Button Interaction",
                    "pre": "Educator on /edu/subscription page.",
                    "steps": "1. Scroll down to Plans comparison section (Starter, Creator, Growth, Institute, Enterprise).\n2. Locate 'Enterprise' tier card.\n3. Click 'Talk to us' button.\n4. Check if button triggers interactive inquiry contact modal or email trigger.",
                    "expected": "Button is fully clickable and interactive (NOT disabled or unresponsive). Opens enterprise sales inquiry dialog or direct contact callback."
                },
                {
                    "id": "TC-EDU-18",
                    "module": "Subscription Add-Ons (/edu/subscription)",
                    "scenario": "Purchase Storage or Student Quota Top-Up Add-Ons",
                    "pre": "Educator on /edu/subscription.",
                    "steps": "1. Locate Add-ons column (Student block, Video storage, Live room-hours, Tutor seats, Custom domain).\n2. Click 'Add' next to 'Video storage (+25 GB)'.\n3. Confirm top-up addition.",
                    "expected": "Quota ceiling increments immediately (+25 GB). Pro-rated charge appended to billing history. High usage warning banner recalculates."
                },
                {
                    "id": "TC-EDU-19",
                    "module": "Coupons & Discounts (/edu/coupons)",
                    "scenario": "Create Discount Coupon with Expiry Date and Redemption Limits",
                    "pre": "Educator in /edu/coupons.",
                    "steps": "1. Click '+ Create Coupon'.\n2. Enter Code (e.g. 'SUMMER30'), Discount Type (30% off), Max Redemptions (50), and Expiry Date.\n3. Save coupon.",
                    "expected": "Coupon activates. Can be applied during student checkout. System automatically rejects checkout if code is expired or reaches 50 redemptions."
                },
                {
                    "id": "TC-EDU-20",
                    "module": "Grow & Marketing (/edu/grow)",
                    "scenario": "Verify Desktop Layout Frame Alignment (1100px Width)",
                    "pre": "Educator accessing /edu/grow on desktop (1366px - 1920px).",
                    "steps": "1. Navigate to /edu/grow.\n2. Observe page content width and horizontal margins.\n3. Verify presence of social share links, referral settings, and lead capture links.",
                    "expected": "Page content container is strictly bounded to 1100px max width with balanced 32px side padding. No excessive empty side space or horizontal scrollbar."
                },
                {
                    "id": "TC-EDU-21",
                    "module": "Timetable View (/edu/timetable)",
                    "scenario": "Verify Weekly Meeting Timetable & Daily Filter Switching",
                    "pre": "Educator with scheduled live meetings across the week.",
                    "steps": "1. Navigate to /edu/timetable.\n2. Toggle through Monday to Sunday date pills.\n3. Verify classes scheduled for Friday 20 November display with exact time, batch, and status.",
                    "expected": "Timetable loads scheduled sessions per day. Meeting pills show 'Done', 'Live', or 'Upcoming' with direct join action."
                }
            ]
        },
        {
            "category": "SECTION 3: TUTOR PORTAL (/educator restricted)",
            "description": "Verification of Role-Based Access Control (RBAC), tutor live classes, batch grading, and student query management without access to administrative financial tabs.",
            "cases": [
                {
                    "id": "TC-TUT-01",
                    "module": "RBAC Security Barrier",
                    "scenario": "Verify Financial & Tenant Subscription Tab Restrictions",
                    "pre": "User authenticated with Tutor role credentials.",
                    "steps": "1. Log into portal with Tutor account.\n2. Inspect sidebar menu items.\n3. Attempt to visit /edu/earnings and /edu/subscription via direct URL entry.",
                    "expected": "Sidebar strictly hides 'Earnings', 'Payments Setup', and 'Subscription'. Direct URL navigation redirects to unauthorized or dashboard."
                },
                {
                    "id": "TC-TUT-02",
                    "module": "Assigned Live Classes",
                    "scenario": "Host Live Class Session for Assigned Batch",
                    "pre": "Tutor assigned to 'Batch A - SEO Masterclass'.",
                    "steps": "1. Navigate to /educator/live as Tutor.\n2. Click 'Start Class' on assigned batch session.\n3. Conduct session, share screen, admit students, and end session.",
                    "expected": "Tutor has full host room privileges for their assigned batch. Meeting attendance logs under the tutor's session."
                },
                {
                    "id": "TC-TUT-03",
                    "module": "Batch Grading Queue (/edu/grading)",
                    "scenario": "Grade Student Submissions Filtered by Assigned Courses",
                    "pre": "Students submitted assignments for Tutor's course.",
                    "steps": "1. Navigate to /edu/grading.\n2. Verify submission list displays only students from assigned batches.\n3. Open student assignment, score rubric criteria, add tutor feedback, and submit.",
                    "expected": "Tutor can only view and grade their assigned students. Published grade logs the Tutor's user ID as the reviewer."
                },
                {
                    "id": "TC-TUT-04",
                    "module": "Doubt Resolution (/edu/doubts)",
                    "scenario": "Answer Queries Filtered by Tutor's Assigned Courses",
                    "pre": "Student asked doubt in Tutor's assigned course.",
                    "steps": "1. Navigate to /edu/doubts.\n2. Inspect pending question list.\n3. Submit answer to question.",
                    "expected": "Tutor sees only queries related to their assigned courses. Answer posts with Tutor badge and full name."
                },
                {
                    "id": "TC-TUT-05",
                    "module": "Tutor Timetable View",
                    "scenario": "Verify Personalized Timetable Schedule",
                    "pre": "Tutor with multiple assigned batches.",
                    "steps": "1. Navigate to /edu/timetable as Tutor.\n2. Inspect scheduled classes for the current week.",
                    "expected": "Timetable shows only classes where user is assigned as the conducting tutor or co-host. Other academy classes are not shown."
                }
            ]
        },
        {
            "category": "SECTION 4: STUDENT PORTAL (Web & Mobile)",
            "description": "Verification of student onboarding, checkout with coupons, video player resume/quality, WebRTC live classroom, quizzes, assignment revisions, certificates, and mobile responsive profile.",
            "cases": [
                {
                    "id": "TC-STU-01",
                    "module": "Course Purchase & Checkout",
                    "scenario": "Enroll in Paid Course with Promo Coupon Application",
                    "pre": "Student registered and logged in; course priced at ₹4,000.",
                    "steps": "1. Browse course on /courses -> Click 'Enroll Now'.\n2. On checkout page, enter coupon code 'BODHIN50' and click 'Apply'.\n3. Verify discounted total (₹2,000).\n4. Complete payment simulation.",
                    "expected": "Price discounts by exactly 50%. Payment succeeds and generates invoice receipt. Course is instantly unlocked under 'My Courses'."
                },
                {
                    "id": "TC-STU-02",
                    "module": "Video Player & Progress Engine",
                    "scenario": "Verify Video Playback, Speed Controls, and Timestamp Resume",
                    "pre": "Student enrolled in video course.",
                    "steps": "1. Open Lecture 1 on /learn/[id].\n2. Play video, change speed to 1.5x, and watch up to 4 minutes 30 seconds.\n3. Refresh browser tab or close and reopen lesson.\n4. Observe video playback start position.",
                    "expected": "Player automatically resumes from 4:30. Progress bar tracks watch percentage. Passing 90% marks lecture with green completed checkmark."
                },
                {
                    "id": "TC-STU-03",
                    "module": "Downloadable Lesson Materials",
                    "scenario": "Access and Download Attached Lecture PDFs & Resources",
                    "pre": "Course lesson containing attached slides and code snippets.",
                    "steps": "1. In course player, click 'Resources / Attachments' tab.\n2. Click on 'Lecture_01_Cheatsheet.pdf'.\n3. Click external GitHub link if provided.",
                    "expected": "File downloads to local device cleanly without broken link error (404). External links open in safe new tab."
                },
                {
                    "id": "TC-STU-04",
                    "module": "Live Classroom Waiting Lobby",
                    "scenario": "Verify Waiting Room State Before Teacher Starts Session",
                    "pre": "Scheduled live session; teacher has NOT clicked 'Start Class' yet.",
                    "steps": "1. Student opens Live tab and clicks on scheduled class.\n2. Observe waiting room screen.\n3. Now teacher starts class in another tab/device. Observe student screen.",
                    "expected": "Student sees friendly 'Teacher has not started the class yet - room opens when host arrives'. Once teacher starts, screen updates to 'Join Class' button."
                },
                {
                    "id": "TC-STU-05",
                    "module": "Live Classroom WebRTC Stream",
                    "scenario": "Verify Real Audio/Video Stream, Chat, Polls & Hand Raise",
                    "pre": "Teacher is broadcasting live class.",
                    "steps": "1. Student joins live room.\n2. Verify teacher's live video and microphone feed are clear.\n3. Type message in class chat.\n4. Click 'Raise Hand'.\n5. Vote in active poll launched by teacher.",
                    "expected": "Teacher video/audio streams in real-time. Chat message appears instantly. Raised hand status alerts teacher. Poll vote registers in class tally."
                },
                {
                    "id": "TC-STU-06",
                    "module": "Mobile Live Classroom (WebRTC)",
                    "scenario": "Verify Live Meeting on Mobile Viewport (360x780)",
                    "pre": "Student accessing live class from mobile browser / responsive view.",
                    "steps": "1. Open live room in mobile view (360x780).\n2. Verify video player fits top half of screen.\n3. Switch tabs between Chat, Q&A, and People.\n4. Test bottom bar actions: Unmute, Video toggle, Raise hand, React, End call.",
                    "expected": "Layout remains compact and responsive. Bottom controls remain fully visible and clickable without being clipped or causing page scroll freeze."
                },
                {
                    "id": "TC-STU-07",
                    "module": "Quiz Attempt & Instant Scoring",
                    "scenario": "Complete Timed Quiz and Verify Detailed Score Report",
                    "pre": "Student enrolled in course with quiz assessment.",
                    "steps": "1. Open assigned Quiz.\n2. Observe active countdown timer (15 mins).\n3. Answer all questions and click 'Submit Quiz'.\n4. Review results screen.",
                    "expected": "Score calculates instantly. Correct/incorrect answers highlighted with explanations. Shows percentile rank among class peers."
                },
                {
                    "id": "TC-STU-08",
                    "module": "Assignment Submission & Revision",
                    "scenario": "Submit Multi-Deliverables (PDF/Link) & Handle Resubmission",
                    "pre": "Assignment due for enrolled course.",
                    "steps": "1. Open Assignment view.\n2. Attach PDF file ('Project_Deck.pdf') and external URL.\n3. Add submission note and click 'Submit'.\n4. (Educator requests resubmission) Open assignment again.\n5. Observe educator's return feedback note, attach updated file, and resubmit.",
                    "expected": "Status updates to 'Submitted'. On return, status changes to 'Draft' with return note. Resubmitting changes status back to 'Submitted'."
                },
                {
                    "id": "TC-STU-09",
                    "module": "Student Doubts & Q&A",
                    "scenario": "Post Lesson Doubt and View Verified Educator Response",
                    "pre": "Student enrolled in course.",
                    "steps": "1. Under Lecture 4, click 'Ask a Doubt'.\n2. Type question referencing timestamp 02:45.\n3. Submit query.\n4. Check Q&A tab once educator has posted an answer.",
                    "expected": "Question logs under user's active doubts. Notification triggered when answered. Answer displays educator badge and verified badge."
                },
                {
                    "id": "TC-STU-10",
                    "module": "Course Certificate Generation",
                    "scenario": "Claim and Download Official Course Certificate (PDF)",
                    "pre": "Student completed 100% of course lectures and passed final quiz.",
                    "steps": "1. Navigate to Certificates section in profile or course completion modal.\n2. Click 'Claim Certificate'.\n3. Click 'Download PDF' and inspect certificate document.",
                    "expected": "Digital certificate renders with Student Name, Course Title, Completion Date, Unique Verification ID, and Educator Signature."
                },
                {
                    "id": "TC-STU-11",
                    "module": "Desktop Profile Layout (/profile)",
                    "scenario": "Verify Desktop Quick Stats Cards (Fix for 0px Squished Bug)",
                    "pre": "Student logged in on Desktop viewport (1366px - 1920px).",
                    "steps": "1. Navigate to /profile on desktop.\n2. Inspect top banner and the 4 Quick Stats cards (Enrolled Courses, Completed, Certificates, Learning Hours).\n3. Check width, typography, and margins.",
                    "expected": "The 4 cards render in a balanced 2-column or 4-column responsive grid with full readable labels. The previous 0px width overlapping bug is fully resolved."
                },
                {
                    "id": "TC-STU-12",
                    "module": "Mobile Profile & Learning Hub",
                    "scenario": "Verify Learning Hub & Account Actions on Mobile View",
                    "pre": "Student on mobile device (<768px).",
                    "steps": "1. Open /profile on mobile browser.\n2. Scroll through Learning Hub, certificates list, and account settings.\n3. Test 'Change Password' action.",
                    "expected": "Mobile profile achieves 100% feature parity with desktop. Change Password modal opens cleanly with responsive text fields."
                },
                {
                    "id": "TC-STU-13",
                    "module": "Student Home Quick Action Grid",
                    "scenario": "Verify 8-Action Quick Grid on Student Mobile Home",
                    "pre": "Student on mobile Home tab.",
                    "steps": "1. Navigate to Home tab on mobile.\n2. Inspect quick action grid below Continue Learning card.\n3. Tap shortcuts (Live Classes, Quizzes, Assignments, Doubts, Certificates).",
                    "expected": "Grid presents clean 8-action icons that navigate directly to their respective sections without lag or dead links."
                },
                {
                    "id": "TC-STU-14",
                    "module": "1:1 Mentorship Booking",
                    "scenario": "Book 1:1 Mentorship Session with Available Mentor",
                    "pre": "Educator has opened mentorship slots.",
                    "steps": "1. Navigate to Mentorship section.\n2. Select Mentor and view available calendar slots.\n3. Select slot, enter topic note, and confirm booking.",
                    "expected": "Booking confirmed; appears in student's upcoming timetable and sends meeting link notification to educator and student."
                },
                {
                    "id": "TC-STU-15",
                    "module": "Authentication Security",
                    "scenario": "Verify Session Expiry & Password Change Enforcement",
                    "pre": "Student logged in.",
                    "steps": "1. Open Profile -> Change Password.\n2. Enter current password and new strong password.\n3. Save. Log out and log back in with old password. Then log in with new password.",
                    "expected": "Old password correctly rejected with 'Invalid credentials'. New password authenticates successfully."
                }
            ]
        },
        {
            "category": "SECTION 5: CROSS-ROLE & SYSTEM INTEGRATION",
            "description": "Verification of unified layout container standards (1100px width), responsive breakpoints, and full multi-tenant end-to-end user journeys.",
            "cases": [
                {
                    "id": "TC-SYS-01",
                    "module": "UI Alignment Standardization",
                    "scenario": "Verify 1100px Max-Width Standard across Tutor & Student Portals",
                    "pre": "Desktop browser open at full HD (1920x1080) and standard laptop (1366x768).",
                    "steps": "1. Open /edu/certificates (reference layout).\n2. Navigate consecutively to /edu/timetable, /edu/assess, /edu/doubts, /edu/grow, and /profile.\n3. Inspect side margins and content alignment.",
                    "expected": "All pages strictly adhere to unified 1100px max content width with 32px side padding. No page overflows or leaves awkward massive whitespace gaps."
                },
                {
                    "id": "TC-SYS-02",
                    "module": "End-to-End Ecosystem Lifecycle",
                    "scenario": "Complete End-to-End Cross-Portal Business Journey",
                    "pre": "All 4 roles active in test environment.",
                    "steps": "1. Super Admin approves Educator.\n2. Educator creates Course, Batch, and invites Tutor.\n3. Student purchases course, attends live class conducted by Tutor, and submits assignment.\n4. Tutor grades assignment using rubric.\n5. Student claims Certificate upon 100% completion.\n6. Super Admin disburses payout to Educator.",
                    "expected": "The complete multi-role platform lifecycle executes seamlessly. Data persists across all 4 dashboards without state corruption or missing linkages."
                },
                {
                    "id": "TC-SYS-03",
                    "module": "Responsive Breakpoints & Error Fallbacks",
                    "scenario": "Verify Fluid Transition across Mobile (360px), Tablet (768px), and Desktop (1366px)",
                    "pre": "DevTools responsive emulator active.",
                    "steps": "1. Slowly drag viewport width from 360px -> 768px -> 1366px on key pages.\n2. Disconnect internet briefly to test offline / retry banners.",
                    "expected": "Layout elements resize smoothly without content overlapping. Disconnecting network displays clean offline banner with retry button."
                }
            ]
        }
    ]

    # Render each test suite section
    for suite in test_suites:
        doc.add_page_break()
        sec_h = doc.add_heading(level=1)
        r_sec = sec_h.add_run(suite["category"])
        r_sec.font.name = "Arial"
        r_sec.font.size = Pt(14)
        r_sec.font.bold = True
        r_sec.font.color.rgb = PRIMARY_COLOR
        sec_h.paragraph_format.space_before = Pt(8)
        sec_h.paragraph_format.space_after = Pt(2)

        p_desc = doc.add_paragraph()
        p_desc.paragraph_format.space_after = Pt(8)
        r_d = p_desc.add_run(suite["description"])
        r_d.font.size = Pt(9.5)
        r_d.font.italic = True
        r_d.font.color.rgb = RGBColor(71, 85, 105)

        for tc in suite["cases"]:
            # Single Test Case Table (Box layout)
            tc_table = doc.add_table(rows=6, cols=2)
            tc_table.alignment = WD_TABLE_ALIGNMENT.CENTER
            tc_table.autofit = False
            set_table_borders(tc_table, "CBD5E1", "6")

            # Row 0: Header with TC ID, Module, and Status Checkboxes
            cell_hdr_left = tc_table.cell(0, 0)
            cell_hdr_left.width = Inches(4.5)
            set_cell_background(cell_hdr_left, HEADER_BG)
            set_cell_margins(cell_hdr_left, top=90, bottom=90, left=120, right=120)
            p_hl = cell_hdr_left.paragraphs[0]
            p_hl.paragraph_format.space_after = Pt(0)
            r_id = p_hl.add_run(f"[{tc['id']}]  {tc['module']}")
            r_id.font.bold = True
            r_id.font.size = Pt(10.5)
            r_id.font.color.rgb = RGBColor(255, 255, 255)

            cell_hdr_right = tc_table.cell(0, 1)
            cell_hdr_right.width = Inches(2.5)
            set_cell_background(cell_hdr_right, HEADER_BG)
            set_cell_margins(cell_hdr_right, top=90, bottom=90, left=80, right=80)
            p_hr = cell_hdr_right.paragraphs[0]
            p_hr.alignment = WD_ALIGN_PARAGRAPH.RIGHT
            p_hr.paragraph_format.space_after = Pt(0)
            r_st = p_hr.add_run("STATUS:  [  ] Pass   [  ] Fail")
            r_st.font.bold = True
            r_st.font.size = Pt(9.5)
            r_st.font.color.rgb = RGBColor(255, 255, 255)

            # Row 1: Scenario
            c1_l = tc_table.cell(1, 0)
            c1_l.width = Inches(1.5)
            set_cell_background(c1_l, SUBHEADER_BG)
            set_cell_margins(c1_l, top=60, bottom=60, left=100, right=100)
            p = c1_l.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            r = p.add_run("Test Scenario:")
            r.font.bold = True
            r.font.size = Pt(9)
            r.font.color.rgb = DARK_TEXT

            c1_r = tc_table.cell(1, 1)
            c1_r.width = Inches(5.5)
            set_cell_background(c1_r, "FFFFFF")
            set_cell_margins(c1_r, top=60, bottom=60, left=100, right=100)
            p = c1_r.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            r = p.add_run(tc["scenario"])
            r.font.bold = True
            r.font.size = Pt(9.5)
            r.font.color.rgb = PRIMARY_COLOR

            # Row 2: Preconditions
            c2_l = tc_table.cell(2, 0)
            c2_l.width = Inches(1.5)
            set_cell_background(c2_l, SUBHEADER_BG)
            set_cell_margins(c2_l, top=60, bottom=60, left=100, right=100)
            p = c2_l.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            r = p.add_run("Preconditions:")
            r.font.bold = True
            r.font.size = Pt(9)
            r.font.color.rgb = DARK_TEXT

            c2_r = tc_table.cell(2, 1)
            c2_r.width = Inches(5.5)
            set_cell_background(c2_r, "FFFFFF")
            set_cell_margins(c2_r, top=60, bottom=60, left=100, right=100)
            p = c2_r.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            r = p.add_run(tc["pre"])
            r.font.size = Pt(9)
            r.font.color.rgb = DARK_TEXT

            # Row 3: Step-by-Step Procedure
            c3_l = tc_table.cell(3, 0)
            c3_l.width = Inches(1.5)
            set_cell_background(c3_l, SUBHEADER_BG)
            set_cell_margins(c3_l, top=60, bottom=60, left=100, right=100)
            p = c3_l.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            r = p.add_run("Execution Steps:")
            r.font.bold = True
            r.font.size = Pt(9)
            r.font.color.rgb = DARK_TEXT

            c3_r = tc_table.cell(3, 1)
            c3_r.width = Inches(5.5)
            set_cell_background(c3_r, "F8FAFC")
            set_cell_margins(c3_r, top=60, bottom=60, left=100, right=100)
            p = c3_r.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            r = p.add_run(tc["steps"])
            r.font.size = Pt(9)
            r.font.color.rgb = DARK_TEXT

            # Row 4: Expected Result
            c4_l = tc_table.cell(4, 0)
            c4_l.width = Inches(1.5)
            set_cell_background(c4_l, SUBHEADER_BG)
            set_cell_margins(c4_l, top=60, bottom=60, left=100, right=100)
            p = c4_l.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            r = p.add_run("Expected Result:")
            r.font.bold = True
            r.font.size = Pt(9)
            r.font.color.rgb = DARK_TEXT

            c4_r = tc_table.cell(4, 1)
            c4_r.width = Inches(5.5)
            set_cell_background(c4_r, "FFFFFF")
            set_cell_margins(c4_r, top=60, bottom=60, left=100, right=100)
            p = c4_r.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            r = p.add_run(tc["expected"])
            r.font.size = Pt(9)
            r.font.color.rgb = RGBColor(16, 100, 50) # Dark green
            r.font.bold = True

            # Row 5: Actual Result & Notes
            c5_l = tc_table.cell(5, 0)
            c5_l.width = Inches(1.5)
            set_cell_background(c5_l, SUBHEADER_BG)
            set_cell_margins(c5_l, top=60, bottom=60, left=100, right=100)
            p = c5_l.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            r = p.add_run("Actual Result / Bug Notes:")
            r.font.bold = True
            r.font.size = Pt(9)
            r.font.color.rgb = DARK_TEXT

            c5_r = tc_table.cell(5, 1)
            c5_r.width = Inches(5.5)
            set_cell_background(c5_r, "FFFFFF")
            set_cell_margins(c5_r, top=60, bottom=60, left=100, right=100)
            p = c5_r.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            r = p.add_run("[   ] Pass    [   ] Fail    Tester Remarks: __________________________________________________")
            r.font.size = Pt(9)
            r.font.color.rgb = RGBColor(100, 116, 139)

            # Spacing between test case cards
            p_space = doc.add_paragraph()
            p_space.paragraph_format.space_before = Pt(0)
            p_space.paragraph_format.space_after = Pt(6)

    # Save Document
    doc.save(file_path)
    print(f"Successfully generated DOCX at: {file_path}")

if __name__ == "__main__":
    out_file = r"g:\thebodhin\Bodhin_Complete_Project_Manual_Test_Cases.docx"
    create_bodhin_test_cases_docx(out_file)
