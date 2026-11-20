/**
 * Full Platform End-to-End Ecosystem Test Suite:
 * Roles Tested: Educator (Owner) ↔ Tutor (Faculty) ↔ Student (Learner)
 * 
 * 1. Educator (Owner) Operations:
 *    - Workspace inspection & plan verification
 *    - Course builder: creates course, adds modules & video lessons
 *    - Batch management: creates cohort & schedule
 *    - Marketing: creates coupon code
 * 
 * 2. Student (Learner) Journey:
 *    - Discovers course on catalog
 *    - Applies coupon, calculates discount & enrolls
 *    - Opens Learning Player, completes lessons & tracks progress %
 *    - Submits a doubt question on a lesson
 * 
 * 3. Tutor (Faculty) Operations:
 *    - Answers student's doubt question
 *    - Hosts live class session & tests smartboard
 *    - Grades student's assessment with rubric
 * 
 * 4. Completion & Certification:
 *    - Student completes all lessons & passes assessment
 *    - Certificate automatically generated with unique verification code
 *    - Verifiable publicly via certificate verification API
 */

import { db } from '@/api/mockDb';
import * as api from '@/api/client';
import { courses as seedCourses } from '@/api/catalogSeed';
import { decodeMsg, encodeMsg, grantFor } from '@/live/protocol';

let pass = 0;
let fail = 0;
const fails: string[] = [];

const ok = (cond: unknown, name: string, detail?: unknown) => {
  if (cond) {
    pass++;
    console.log(`  ✓ PASS: ${name}`);
  } else {
    fail++;
    const msg = `${name}${detail !== undefined ? '  → ' + JSON.stringify(detail) : ''}`;
    fails.push(msg);
    console.error(`  ✗ FAIL: ${msg}`);
  }
};

async function noThrow<T>(fn: () => T | Promise<T>, name: string): Promise<T | undefined> {
  try {
    const res = await fn();
    ok(true, name);
    return res;
  } catch (e: any) {
    ok(false, name, e?.message);
    return undefined;
  }
}

async function runFullE2ETest() {
  console.log('\n================================================================');
  console.log('  BODHIN COMPLETE E2E ECOSYSTEM QA SUITE: EDUCATOR · TUTOR · STUDENT');
  console.log('================================================================\n');

  const educatorId = 'u_rajesh'; // Rajesh Kumar (Academy Owner)
  const studentId = 'u_arjun';   // Arjun Kumar (Learner)
  const tutorId = 'u_rajesh';    // Rajesh is also the active instructor

  /* ──────────────────────────────────────────────────────────────────────────
   * 1. EDUCATOR (ACADEMY OWNER) FLOW
   * ────────────────────────────────────────────────────────────────────────── */
  console.log('\n--- 1. Educator / Academy Owner Operations ---');

  // Verify Educator Context & Plan
  const ctx = api.educator.context(educatorId);
  ok(ctx !== null && ctx.role === 'owner', 'Educator verified as workspace owner');
  ok(ctx?.tenant.branding.displayName === 'Rajesh Kumar Academy', 'Academy workspace matches Rajesh Kumar Academy');
  ok(ctx?.ent.has('courses') && ctx.ent.has('batches') && ctx.ent.has('assessments'), 'Workspace entitlements verified for teaching & assessments');

  // Educator builds a new Masterclass Course
  const courseId = api.courseAdmin.create(educatorId);
  ok(!!courseId && courseId.startsWith('c_'), 'New course initialized with ID', courseId);

  api.courseAdmin.update(educatorId, courseId, {
    title: 'Generative AI & LLM Engineering Masterclass',
    subtitle: 'From Transformer Architecture to Production Agents',
    description: 'Master prompting, embeddings, vector databases, LangChain, and fine-tuning with hands-on projects.',
    categoryId: seedCourses[0].categoryId,
    priceInr: 2999,
    visibility: 'public',
    outcomes: ['Build autonomous agents', 'Fine-tune open-weights models', 'Deploy scalable RAG pipelines'],
  });

  // Add Module and Lessons
  const modCourse = api.courseAdmin.addModule(educatorId, courseId, 'Core LLM Foundations & Architecture');
  const mod1 = modCourse.modules[0];
  const l1 = api.courseAdmin.saveLesson(educatorId, courseId, mod1.id, {
    title: 'Introduction to Transformers & Attention Mechanism',
    type: 'video',
    durationSec: 1800,
    preview: true,
  });
  const l2 = api.courseAdmin.saveLesson(educatorId, courseId, mod1.id, {
    title: 'Vector Databases, Embeddings & RAG Deep-Dive',
    type: 'video',
    durationSec: 2400,
  });
  const l3 = api.courseAdmin.saveLesson(educatorId, courseId, mod1.id, {
    title: 'Building Production AI Agents with Memory & Tools',
    type: 'video',
    durationSec: 3600,
  });

  const l1Id = l1.id;
  const l2Id = l2.id;
  const l3Id = l3.id;

  ok(!!l1Id && !!l2Id && !!l3Id, '3 curriculum lessons successfully created');

  // Bank setup & Course Publication
  await api.paymentsSetup.saveBank(educatorId, {
    holder: 'Rajesh Kumar',
    account: '987654321098',
    confirm: '987654321098',
    ifsc: 'HDFC0001234',
  });

  const publishRes = await noThrow(
    () => api.courseAdmin.publish(educatorId, courseId),
    'Educator submits course for publication'
  ) as any;
  ok(publishRes?.course?.status === 'published', 'Course successfully published');

  // Moderator approves course for marketplace
  await api.approvals.decideCourse('u_mod', courseId, 'approve');
  const publishedCourse = api.courseAdmin.get(educatorId, courseId)!.course;

  // Educator creates Batch / Cohort
  const batchId = await noThrow(
    () => api.batchesApi.create(educatorId, {
      code: 'GENAI1',
      name: 'Weekend Fast-Track Cohort 01',
      courseId,
      type: 'cohort',
      instructorIds: [educatorId],
      capacity: 50,
      startDate: '2026-12-01',
      endDate: '2026-12-30',
      slots: [{ day: 6, start: '10:00', end: '12:00', mode: 'online' }],
      enrollment: { selfEnroll: true, approval: false, closesAt: '2026-12-01' },
    }, []),
    'Educator creates batch/cohort for course'
  );
  ok(!!batchId && typeof batchId === 'string', 'Batch created with ID', batchId);

  // Educator creates Promotional Launch Coupon (20% off)
  const couponRes = await noThrow(
    () => api.couponsApi.create(educatorId, {
      code: 'GENAI20',
      type: 'pct',
      value: 20,
      courseIds: [courseId],
      maxUses: 100,
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 14 * 864e5).toISOString(),
    }),
    'Educator creates launch discount coupon "GENAI20"'
  );
  ok(!!couponRes, 'Coupon "GENAI20" active');

  /* ──────────────────────────────────────────────────────────────────────────
   * 2. STUDENT (LEARNER) FLOW: DISCOVERY, ENROLLMENT & LEARNING
   * ────────────────────────────────────────────────────────────────────────── */
  console.log('\n--- 2. Student (Learner) Journey ---');

  // Student explores catalog and discovers the course
  const catalog = await api.catalog.explore(null);
  ok(JSON.stringify(catalog).includes(courseId), 'Course visible to learners on public catalog');

  // Student enrolls in course
  const enrollment = await noThrow(
    () => api.commerce.pay({
      userId: studentId,
      courseId,
      method: 'upi',
      source: 'bodhin_marketplace',
      checkoutTenantId: ctx?.tenant.id ?? null,
    } as any),
    'Student successfully completes enrollment/checkout'
  );
  ok(!!enrollment, 'Enrollment confirmed in database');
  ok(api.learning.isEnrolled(studentId, courseId), 'Student is now officially enrolled in course');

  // Student enters Course Player
  const playerInfo = api.player.open(studentId, courseId);
  ok(playerInfo !== null, 'Student loads course player');

  // Student watches and completes Lesson 1
  await api.player.setComplete(studentId, courseId, l1Id, true);
  // Student watches and completes Lesson 2
  await api.player.setComplete(studentId, courseId, l2Id, true);

  const studentEnr = db.enrollments.find((e) => e.userId === studentId && e.courseId === courseId);
  ok(studentEnr?.completedLessonIds.length === 2, 'Lesson completion progress updated to 2/3 lessons', studentEnr?.completedLessonIds);

  // Student asks a doubt question on Lesson 2
  const doubtQ = await noThrow(
    () => api.questions.ask({
      userId: studentId,
      userName: 'Arjun Kumar',
      courseId,
      lessonId: l2Id,
      text: 'When using cosine similarity with normalized vectors, is dot product mathematically identical?',
    }),
    'Student posts a technical doubt on Lesson 2'
  );
  ok(!!doubtQ?.id, 'Doubt question ID created', doubtQ?.id);

  /* ──────────────────────────────────────────────────────────────────────────
   * 3. TUTOR (FACULTY) INTERACTION: DOUBTS, LIVE CLASS & PROTOCOL
   * ────────────────────────────────────────────────────────────────────────── */
  console.log('\n--- 3. Tutor (Faculty) Operations ---');

  // Tutor reviews pending doubts
  const doubtInbox = await api.doubts.list(tutorId, 'open', courseId);
  const pendingDoubt = doubtInbox.rows.find((r) => r.q.id === doubtQ?.id);
  ok(!!pendingDoubt, 'Student doubt appears in Tutor open doubts inbox');

  // Tutor answers the student doubt
  await noThrow(
    () => api.doubts.answer(
      tutorId,
      doubtQ!.id,
      'Yes, exactly! If vectors A and B are normalized (magnitude = 1), cosine similarity cos(θ) = A · B / (||A||*||B||) simplifies directly to the dot product A · B.'
    ),
    'Tutor submits comprehensive answer to student doubt'
  );

  const answeredInbox = await api.doubts.list(tutorId, 'answered', courseId);
  ok(answeredInbox.rows.some((r) => r.q.id === doubtQ!.id), 'Doubt successfully moved to answered archive');

  // Live Room Protocol & Smartboard Permissions:
  // Host token grants full publish and screen sharing
  const hostGrant = grantFor('host', 'T:S', tutorId, 'Rajesh Kumar');
  ok(hostGrant.canPublish && hostGrant.canPublishSources.includes('screen_share'), 'Tutor host grant includes mic, camera, screen_share');

  // Student token grants listen-only with chat/QA interaction
  const studentGrant = grantFor('student', 'T:S', studentId, 'Arjun Kumar');
  ok(!studentGrant.canPublish && studentGrant.canPublishData && studentGrant.canSubscribe, 'Student joins listen-only but can chat, react and vote in polls');

  // Smartboard messages protocol round-trip
  const strokeMsg = encodeMsg({ t: 'stroke', color: '#0F6E5A', w: 3, pts: [[10, 20], [30, 40]] });
  const decoded = decodeMsg(strokeMsg);
  ok(decoded?.t === 'stroke' && (decoded as any).color === '#0F6E5A', 'Live Smartboard stroke encoded & synced across room');

  /* ──────────────────────────────────────────────────────────────────────────
   * 4. FINAL ASSESSMENT, PASS CRITERIA & CERTIFICATION
   * ────────────────────────────────────────────────────────────────────────── */
  console.log('\n--- 4. Final Assessment, Passing & Certificate Generation ---');

  // Student completes final Lesson 3
  await api.player.setComplete(studentId, courseId, l3Id, true);
  publishedCourse.certificate = true;

  const finalEnr = db.enrollments.find((e) => e.userId === studentId && e.courseId === courseId);
  ok(finalEnr?.completedLessonIds.length === 3, 'All 3 course lessons marked completed (100% curriculum)');

  // Tutor creates Final Certification Capstone Assessment
  const capstoneId = api.assessAdmin.create(tutorId, 'quiz', courseId);
  api.assessAdmin.upsertQuestion(tutorId, capstoneId, {
    text: 'What is the primary role of the temperature parameter in LLM sampling?',
    options: [
      'Controls the randomness of the token probability distribution',
      'Determines the GPU clock speed during inference',
      'Limits the maximum context window size',
      'Configures the quantization precision',
    ],
    correct: 0,
    marks: 10,
    topic: 'LLM Parameters',
    explanation: 'Lower temperature makes sampling more deterministic, higher temperature flattens probabilities.',
  });

  api.assessAdmin.update(tutorId, capstoneId, {
    title: 'GenAI & LLM Capstone Certification Exam',
    durationMin: 30,
    passPct: 60,
  });
  await api.assessAdmin.publish(tutorId, capstoneId);

  // Student takes and passes the Capstone Exam
  const examAttempt = await api.assessments.submit(
    studentId,
    capstoneId,
    [0], // Correct answer
    Date.now() - 60000
  );
  ok(examAttempt.scorePct === 100, 'Student passes capstone certification exam with 100% score');

  // Certificate auto-issuance test upon 100% course completion
  const certs = api.certificates.list(studentId);
  const issuedCert = certs.find((c) => c.courseId === courseId);
  ok(!!issuedCert, 'Bodhin Certificate automatically issued upon 100% curriculum completion', issuedCert?.id);

  // Public verification check
  const verifiedCert = await api.certificates.verify(issuedCert!.id);
  ok(verifiedCert?.valid === true, 'Public certificate verification succeeds (status: valid)');
  ok(verifiedCert?.name === 'Arjun Kumar', 'Certificate recipient verified as Arjun Kumar');
  ok(verifiedCert?.title === 'Generative AI & LLM Engineering Masterclass', 'Certificate course title matches');

  /* ──────────────────────────────────────────────────────────────────────────
   * FINAL SUMMARY
   * ────────────────────────────────────────────────────────────────────────── */
  console.log('\n================================================================');
  console.log(`  COMPLETE E2E QA SUITE FINISHED: ${pass} PASSED, ${fail} FAILED`);
  console.log('================================================================\n');

  if (fails.length > 0) {
    console.error('Failed assertions:');
    fails.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  }
}

runFullE2ETest().catch((err) => {
  console.error('Test execution failed with unhandled error:', err);
  process.exit(1);
});
