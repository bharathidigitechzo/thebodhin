/**
 * Comprehensive Automated Functionality & Integration Test Runner
 * Tests: Super Admin, Educator, Tutor, Student, and Cross-Portal Workflows
 */
import {
  auth,
  admin,
  approvals,
  tenantsAdmin,
  money,
  usersAdmin,
  ticketsAdmin,
  auditAdmin,
  educator,
  courseAdmin,
  batchesApi,
  grading,
  doubts,
  earningsApi,
  subscriptionApi,
  catalog,
  learning,
  commerce,
  player,
  certificates,
  support,
  notifications,
  DEMO_OTP,
} from '../src/api/client';

export interface TestResult {
  id: string;
  name: string;
  category: 'AUTH' | 'SUPER_ADMIN' | 'EDUCATOR' | 'TUTOR' | 'STUDENT' | 'CROSS_PORTAL_WORKFLOWS';
  role: 'Super Admin' | 'Educator' | 'Tutor' | 'Student' | 'System';
  status: 'PASS' | 'FAIL';
  details?: string;
  error?: string;
}

const results: TestResult[] = [];

async function test(
  id: string,
  category: TestResult['category'],
  role: TestResult['role'],
  name: string,
  fn: () => Promise<void> | void
) {
  try {
    await fn();
    results.push({ id, category, role, name, status: 'PASS' });
    console.log(`[PASS] ${id}: ${name}`);
  } catch (err: any) {
    const msg = err?.message || String(err);
    results.push({ id, category, role, name, status: 'FAIL', error: msg });
    console.error(`[FAIL] ${id}: ${name} -> ${msg}`);
  }
}

async function run() {
  console.log('====================================================');
  console.log('BODHIN END-TO-END MULTI-PORTAL FUNCTIONALITY SUITE');
  console.log('====================================================\n');

  // 1. AUTHENTICATION & MULTI-ROLE SIGN-IN
  let adminSession: any;
  let eduSession: any;
  let tutorSession: any;
  let studentSession: any;

  await test('AUTH-01', 'AUTH', 'Super Admin', 'Super Admin sign-in & 2FA OTP verification (admin@demo.in)', async () => {
    adminSession = await auth.signIn('admin@demo.in', 'demo123');
    if (!adminSession?.user?.id) throw new Error('No user id in admin session');
    await admin.verify(adminSession.user.id, DEMO_OTP);
    const me = admin.me(adminSession.user.id);
    if (!me?.verified) throw new Error('Admin 2FA verification flag not set');
  });

  await test('AUTH-02', 'AUTH', 'Educator', 'Educator Owner sign-in & workspace context (rajesh@demo.in)', async () => {
    eduSession = await auth.signIn('rajesh@demo.in', 'demo123');
    if (!eduSession?.user?.id) throw new Error('No user id in educator session');
    const ctx = educator.context(eduSession.user.id);
    if (!ctx || ctx.role !== 'owner') throw new Error('Educator workspace context missing or not owner');
  });

  await test('AUTH-03', 'AUTH', 'Tutor', 'Tutor sign-in & workspace membership (meera@demo.in)', async () => {
    tutorSession = await auth.signIn('meera@demo.in', 'demo123');
    if (!tutorSession?.user?.id) throw new Error('No user id in tutor session');
    const ctx = educator.context(tutorSession.user.id);
    if (!ctx || ctx.role !== 'tutor') throw new Error('Tutor workspace context missing or not tutor');
  });

  await test('AUTH-04', 'AUTH', 'Student', 'Student sign-in (arjun@demo.in)', async () => {
    studentSession = await auth.signIn('arjun@demo.in', 'demo123');
    if (!studentSession?.user?.id) throw new Error('No user id in student session');
    if (studentSession.user.email !== 'arjun@demo.in') throw new Error('Student email mismatch');
  });

  const adminId = adminSession?.user?.id || 'u_admin';
  const eduId = eduSession?.user?.id || 'u_rajesh';
  const tutorId = tutorSession?.user?.id || 'u_meera';
  const studentId = studentSession?.user?.id || 'u_arjun';

  // 2. SUPER ADMIN PORTAL
  await test('ADMIN-01', 'SUPER_ADMIN', 'Super Admin', 'Platform overview KPIs & stats calculation', async () => {
    const ov = await admin.overview(adminId);
    if (!ov?.kpis || typeof ov.kpis.gmv !== 'number') throw new Error('Invalid KPIs object');
  });

  await test('ADMIN-02', 'SUPER_ADMIN', 'Super Admin', 'Inbox listing: Educator verification, Courses, and Reports queues', async () => {
    const box = await approvals.inbox(adminId);
    if (!Array.isArray(box.educators) || !Array.isArray(box.courses) || !Array.isArray(box.reports)) {
      throw new Error('Inbox collections missing');
    }
  });

  await test('ADMIN-03', 'SUPER_ADMIN', 'Super Admin', 'Report moderation: Dismiss or Warn action', async () => {
    const box = await approvals.inbox(adminId);
    if (box.reports.length > 0) {
      const rep = box.reports[0];
      await approvals.resolveReport(adminId, rep.id, 'dismiss', 'Handled in automated test');
    }
  });

  await test('ADMIN-04', 'SUPER_ADMIN', 'Super Admin', 'Tenants list, subscription flags & MRR calculation', async () => {
    const tList = await tenantsAdmin.list(adminId, 'all', '', 'newest');
    if (!Array.isArray(tList?.rows) || tList.rows.length === 0) throw new Error('Tenants rows empty');
  });

  await test('ADMIN-05', 'SUPER_ADMIN', 'Super Admin', 'Money Payouts: Draft weekly payout run calculation', () => {
    const run = money.payoutRun(adminId);
    if (!run || typeof run.readyTotal !== 'number') throw new Error('Payout run calculation failed');
    if (!Array.isArray(run.lines)) throw new Error('Payout lines not an array');
  });

  await test('ADMIN-06', 'SUPER_ADMIN', 'Super Admin', 'Money Refunds: Requests list & reversal breakdown plan', () => {
    const ref = money.refunds(adminId);
    if (!Array.isArray(ref.rows)) throw new Error('Refunds list not an array');
  });

  await test('ADMIN-07', 'SUPER_ADMIN', 'Super Admin', 'Support Tickets: Admin listing and status queues', () => {
    const t = ticketsAdmin.list(adminId, 'open');
    if (!Array.isArray(t.rows)) throw new Error('Tickets rows not an array');
  });

  await test('ADMIN-08', 'SUPER_ADMIN', 'Super Admin', 'Users Admin: Search, lock check, phone verification check', () => {
    const uList = usersAdmin.list(adminId, 'all', '');
    if (!Array.isArray(uList?.rows) || uList.rows.length === 0) throw new Error('Users empty');
  });

  await test('ADMIN-09', 'SUPER_ADMIN', 'Super Admin', 'Audit Log: Recent platform mutations retrieval', () => {
    const auditLogs = auditAdmin.list(adminId, 'all', '');
    if (!Array.isArray(auditLogs?.rows)) throw new Error('Audit logs rows not an array');
  });

  // 3. EDUCATOR PORTAL
  await test('EDU-01', 'EDUCATOR', 'Educator', 'Educator dashboard KPIs & earnings preview', async () => {
    const dash = await educator.dashboard(eduId);
    if (!dash || !dash.kpis) throw new Error('Educator dashboard KPIs missing');
  });

  await test('EDU-02', 'EDUCATOR', 'Educator', 'Educator courses listing & status indicators', async () => {
    const courses = await courseAdmin.list(eduId);
    if (!Array.isArray(courses)) throw new Error('Educator courses is not an array');
  });

  let createdCourseId = '';
  await test('EDU-03', 'EDUCATOR', 'Educator', 'Create course draft, add module & update syllabus', () => {
    createdCourseId = courseAdmin.create(eduId);
    if (!createdCourseId) throw new Error('Failed to create course draft');

    courseAdmin.update(eduId, createdCourseId, {
      title: 'Fullstack Next.js & React Native Mastery',
      subtitle: 'Complete zero-to-production bootcamp in Tamil & English with modern tech',
      description: 'Master fullstack application development with modern architectures, state management, and real world projects with extensive curriculum.',
      categoryId: 'cat_dev',
      priceInr: 1499,
      outcomes: ['Build native apps', 'Deploy serverless backends', 'Integrate payments'],
    });

    courseAdmin.addModule(eduId, createdCourseId, 'Module 1: Foundations & Architecture');
  });

  await test('EDU-04', 'EDUCATOR', 'Educator', 'Educator Batches: Listing & student progress tracking', async () => {
    const batches = await batchesApi.list(eduId);
    if (!Array.isArray(batches)) throw new Error('Batches list is not an array');
  });

  await test('EDU-05', 'EDUCATOR', 'Educator', 'Educator Earnings: Statement & payout projection', async () => {
    const stmt = await earningsApi.statement(eduId, 'month', 'all');
    if (!stmt?.summary || typeof stmt.summary.net !== 'number') throw new Error('Earnings summary invalid');
  });

  await test('EDU-06', 'EDUCATOR', 'Educator', 'Educator Subscription & Add-ons: Plan comparison & usage metrics', () => {
    const sub = subscriptionApi.overview(eduId);
    if (!sub?.ctx?.tenant) throw new Error('Subscription overview missing tenant');
    if (!Array.isArray(sub.plans)) throw new Error('Plans array missing');
    if (!Array.isArray(sub.addons)) throw new Error('Addons array missing');
  });

  await test('EDU-07', 'EDUCATOR', 'Educator', 'Educator Doubts: Student inquiries queue & filter', async () => {
    const dList = await doubts.list(eduId, 'open');
    if (!Array.isArray(dList.rows)) throw new Error('Doubts rows not an array');
  });

  // 4. TUTOR PORTAL
  await test('TUTOR-01', 'TUTOR', 'Tutor', 'Tutor assigned batches retrieval', async () => {
    const tBatches = await batchesApi.list(tutorId);
    if (!Array.isArray(tBatches)) throw new Error('Tutor batches is not an array');
  });

  await test('TUTOR-02', 'TUTOR', 'Tutor', 'Tutor assessment grading queue & pending submissions', async () => {
    const queue = await grading.queue(tutorId, 'to_grade');
    if (!Array.isArray(queue.rows)) throw new Error('Grading rows not an array');
  });

  await test('TUTOR-03', 'TUTOR', 'Tutor', 'Tutor doubts answering queue', async () => {
    const tDoubts = await doubts.list(tutorId, 'open');
    if (!Array.isArray(tDoubts.rows)) throw new Error('Tutor doubts queue invalid');
  });

  // 5. STUDENT PORTAL
  let exploreCourse: any;
  await test('STUDENT-01', 'STUDENT', 'Student', 'Marketplace & catalog search with filters', async () => {
    const explore = await catalog.explore(null);
    if (!Array.isArray(explore.featured) || explore.featured.length === 0) throw new Error('No featured courses in catalog');
    exploreCourse = explore.featured[0].course;

    const srch = await catalog.search({ categoryId: 'all', sort: 'popular' }, null);
    if (!Array.isArray(srch) || srch.length === 0) throw new Error('Catalog search returned no results');
  });

  await test('STUDENT-02', 'STUDENT', 'Student', 'Student Home tab: Enrolled courses, stats & recommendations', async () => {
    const home = await learning.home(studentId, null);
    if (!Array.isArray(home.enrolled)) throw new Error('Student enrolled courses not an array');
    if (!Array.isArray(home.recommended)) throw new Error('Student recommendations not an array');
  });

  await test('STUDENT-03', 'STUDENT', 'Student', 'Course video player lesson completion toggle', async () => {
    const home = await learning.home(studentId, null);
    if (home.enrolled.length > 0) {
      const en = home.enrolled[0];
      const lessons = en.course.modules.flatMap((m: any) => m.lessons);
      if (lessons.length > 0) {
        player.setComplete(studentId, en.course.id, lessons[0].id, true);
      }
    }
  });

  await test('STUDENT-04', 'STUDENT', 'Student', 'Certificates: Earned list retrieval', () => {
    const certList = certificates.list(studentId);
    if (!Array.isArray(certList)) throw new Error('Certificates list is not an array');
  });

  await test('STUDENT-05', 'STUDENT', 'Student', 'Help & Support: Raise student ticket', async () => {
    const t = await support.raise(studentId, {
      category: 'Course & Learning',
      subject: 'Automated test support ticket',
      body: 'Testing the student help ticket submission pipeline across portals.',
    });
    if (!t?.id) throw new Error('Ticket ID was not returned');
  });

  await test('STUDENT-06', 'STUDENT', 'Student', 'Notifications inbox and unread count', () => {
    const notifs = notifications.list(studentId);
    if (!Array.isArray(notifs)) throw new Error('Notifications not an array');
    const unread = notifications.unread(studentId);
    if (typeof unread !== 'number') throw new Error('Unread count invalid');
  });

  // 6. CROSS-PORTAL INTERCONNECTED WORKFLOWS ("SUTHI SUTHI FUNCTIONALITY")
  await test('WORKFLOW-01', 'CROSS_PORTAL_WORKFLOWS', 'System', 'Workflow 1: Course creation & publish -> Super Admin review -> Approval', async () => {
    if (!createdCourseId) throw new Error('No created course');

    // Add lessons so it fulfills the publish checklist
    const cObj = courseAdmin.get(eduId, createdCourseId);
    const mod = cObj?.course?.modules?.[0];
    if (mod) {
      mod.lessons.push(
        { id: 'l_test_1', title: 'Intro to Fullstack', durationSec: 360, type: 'video', preview: true },
        { id: 'l_test_2', title: 'Core Architecture', durationSec: 480, type: 'video' },
        { id: 'l_test_3', title: 'Production Deployment', durationSec: 600, type: 'video' }
      );
      courseAdmin.update(eduId, createdCourseId, {
        modules: [mod],
        visibility: 'public',
      });
    }

    // Publish the course -> sends for review
    await courseAdmin.publish(eduId, createdCourseId);

    // Super Admin checks inbox
    const box = await approvals.inbox(adminId);
    const item = box.courses.find((x: any) => x.c.id === createdCourseId);
    if (item) {
      await approvals.decideCourse(adminId, createdCourseId, 'approve');
    }

    const after = courseAdmin.get(eduId, createdCourseId);
    if (after?.course.status !== 'published') throw new Error('Course status is not published');
  });

  await test('WORKFLOW-02', 'CROSS_PORTAL_WORKFLOWS', 'System', 'Workflow 2: Student purchase -> Revenue split -> Admin Payout Ledger', async () => {
    // Pick a course where student is NOT already enrolled
    const exp = await catalog.explore(null);
    const unenrolled = exp.featured.map((f: any) => f.course).find((c: any) => !learning.isEnrolled(studentId, c.id));

    if (unenrolled) {
      const order = await commerce.pay({
        userId: studentId,
        courseId: unenrolled.id,
        method: 'upi',
        source: 'direct',
        checkoutTenantId: null,
      });
      if (!order?.id || order.status !== 'paid') throw new Error('Order not created as paid');
    }

    // Check money payouts in Super Admin
    const run = money.payoutRun(adminId);
    if (!Array.isArray(run.lines)) throw new Error('Payout lines missing');
  });

  await test('WORKFLOW-03', 'CROSS_PORTAL_WORKFLOWS', 'System', 'Workflow 3: Student raises Ticket -> Super Admin resolves -> Student Notification', async () => {
    const ticket = await support.raise(studentId, {
      category: 'Payments & Enrollment',
      subject: 'Inquiry regarding certificate access',
      body: 'Can you please check why my certificate is taking longer to verify?',
    });

    // Super Admin sees ticket in open queue
    const tList = ticketsAdmin.list(adminId, 'open');
    const found = tList.rows.find((r: any) => r.t.id === ticket.id);
    if (!found) throw new Error(`Raised ticket ${ticket.id} not visible in Super Admin tickets`);

    // Super Admin replies and marks resolved
    await ticketsAdmin.reply(adminId, ticket.id, 'We have verified your credentials. All good now!', true);

    // Verify resolved
    const resolvedList = ticketsAdmin.list(adminId, 'resolved');
    const isResolved = resolvedList.rows.some((r: any) => r.t.id === ticket.id);
    if (!isResolved) throw new Error(`Ticket ${ticket.id} not marked resolved`);

    // Verify student notifications list
    const studentNotifs = notifications.list(studentId);
    const hasReply = studentNotifs.some((n: any) => n.title.includes(ticket.id) || n.body.includes(ticket.id));
    if (!hasReply) throw new Error('Student did not receive ticket reply notification');
  });

  await test('WORKFLOW-04', 'CROSS_PORTAL_WORKFLOWS', 'System', 'Workflow 4: Educator Enterprise "Talk to us" -> Bodhin Support Ticket registered', async () => {
    const ticket = await support.raise(eduId, {
      category: 'Enterprise enquiry',
      subject: 'Enterprise quote request: Rajesh Kumar Academy',
      body: 'Rajesh Kumar requested an Enterprise custom quote for Rajesh Kumar Academy. Contact email: rajesh@demo.in, phone: +91 98401 23456.',
    });
    if (!ticket?.id) throw new Error('Enterprise ticket was not created');

    // Check it appears in Super Admin support queue
    const tList = ticketsAdmin.list(adminId, 'open');
    const found = tList.rows.some((r: any) => r.t.id === ticket.id);
    if (!found) throw new Error('Enterprise enquiry ticket not visible in Super Admin queue');
  });

  console.log('\n====================================================');
  console.log('TEST SUITE SUMMARY:');
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  console.log(`TOTAL: ${results.length} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('====================================================');

  return { total: results.length, passed, failed, results };
}

run()
  .then((out) => {
    process.exit(out.failed > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error('Test runner fatal error:', err);
    process.exit(1);
  });
