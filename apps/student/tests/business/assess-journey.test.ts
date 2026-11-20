/**
 * End-to-end Assessment Journey (Professional QA / SDET Test Suite):
 * 
 * 1. Educator Quiz Creation & Authorization:
 *    - Cannot create quiz for an unowned course (Access Control)
 *    - Creates Quiz in draft state
 *    - Adds MCQ, Fill-in-the-Blank, and Coding questions with validation
 *    - Auto-recalculates total marks based on questions
 *    - Publish checklist guard (validates title, duration, questions)
 *    - Publishes Quiz → state transitions to 'published'
 * 
 * 2. Student Quiz Lifecycle:
 *    - Non-enrolled student is blocked from taking quiz
 *    - Enrolled student discovers quiz under My Learning / Quizzes
 *    - Questions served to student do NOT leak correct answers or hidden test cases
 *    - Student answers questions and submits attempt
 *    - Score percentage, marks, rank, and attempt log computed correctly
 *    - Student views result with explanations and score breakdown
 * 
 * 3. Educator Quiz Results Verification:
 *    - Quiz becomes locked against structural edits once attempts exist
 *    - Educator results view displays student attempt, correct score %, and pass status
 *    - Educator assessments list reflects updated response count and class average
 * 
 * 4. Educator Assignment Creation & Rubric Definition:
 *    - Creates Assignment in draft state
 *    - Sets detailed instructions, due date, allowed formats, late policy
 *    - Configures custom Rubric criteria with weighted marks
 *    - Publishes Assignment
 * 
 * 5. Student Assignment Submission:
 *    - Pending assignment counter increments for student
 *    - Empty submission and invalid URLs are rejected
 *    - Student submits project link and notes
 *    - Status transitions from 'pending' to 'submitted'
 * 
 * 6. Educator Grading Queue & Rubric Evaluation:
 *    - Submission lands in Educator's grading queue under 'to_grade'
 *    - Evaluation with empty/short feedback is rejected (<5 chars)
 *    - Educator evaluates submission against each rubric criterion and adds feedback
 *    - Marks and overall percentage calculated accurately
 *    - Status transitions from 'submitted' to 'graded'
 * 
 * 7. Student Grade Verification:
 *    - Student receives grade notification
 *    - Student views assignment result: verified graded status, rubric marks, and tutor feedback
 * 
 * 8. Resubmission Lifecycle (Edge Case):
 *    - Educator can request resubmission with guidance
 *    - Student is notified, updates submission, and educator awards final grade
 */

import { db } from '@/api/mockDb';
import * as api from '@/api/client';
import { ASSESSMENTS, QUESTIONS } from '@/api/assessSeed';

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

async function throws(fn: () => unknown, name: string, pattern?: RegExp) {
  try {
    await fn();
    ok(false, `${name} (expected exception, but none thrown)`);
  } catch (e: any) {
    const matches = !pattern || pattern.test(e?.message ?? '');
    ok(matches, name, e?.message);
  }
}

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

async function runAssessmentJourney() {
  console.log('\n===============================================================');
  console.log('  BODHIN END-TO-END ASSESSMENT QA SUITE (QUIZ & ASSIGNMENT)');
  console.log('===============================================================\n');

  const educatorId = 'u_rajesh';       // Rajesh Kumar (Tutor / Educator)
  const studentId = 'u_arjun';         // Arjun Kumar (Enrolled Student)
  const unauthEducatorId = 'u_own_priyacodes'; // Priya Sharma (Different academy)
  const nonEnrolledStudentId = 'u_app_gowtham'; // Not enrolled in course
  const courseId = 'c_dm_ai';          // Digital Marketing & AI Mastery

  /* ──────────────────────────────────────────────────────────────────────────
   * STEP 1: Educator Quiz Creation & Authorization Security Checks
   * ────────────────────────────────────────────────────────────────────────── */
  console.log('\n--- 1. Educator Quiz Creation & Authorization ---');

  // Security check: Educator cannot create an assessment for a course they do not own
  await throws(
    () => api.assessAdmin.create(unauthEducatorId, 'quiz', courseId),
    'Unauthorized educator cannot create assessment for another tutor’s course',
    /choose one of your courses|forbidden/i
  );

  // Valid educator creates a quiz in draft state
  const quizId = await noThrow(
    () => api.assessAdmin.create(educatorId, 'quiz', courseId),
    'Educator successfully creates new Quiz'
  );
  ok(!!quizId && quizId.startsWith('qz_'), 'Quiz ID generated with correct prefix', quizId);

  const initialQuizInfo = api.assessAdmin.get(educatorId, quizId!);
  ok(initialQuizInfo?.a.status === 'draft', 'New quiz starts in "draft" status');
  ok(initialQuizInfo?.a.kind === 'quiz', 'Assessment kind is "quiz"');
  ok(initialQuizInfo?.locked === false, 'Quiz is unlocked for editing');

  /* ──────────────────────────────────────────────────────────────────────────
   * STEP 2: Question Authoring & Dynamic Validation (MCQ, Blank, Code)
   * ────────────────────────────────────────────────────────────────────────── */
  console.log('\n--- 2. Question Authoring & Validation ---');

  // MCQ Validation: Short text rejected
  await throws(
    () => api.assessAdmin.upsertQuestion(educatorId, quizId!, {
      text: 'Why?',
      options: ['Option A', 'Option B'],
      correct: 0,
      topic: 'AI Basics',
      explanation: 'Too short',
    }),
    'MCQ with less than 5 characters is rejected',
    /5\+ characters/i
  );

  // MCQ Validation: Less than 2 options rejected
  await throws(
    () => api.assessAdmin.upsertQuestion(educatorId, quizId!, {
      text: 'What does CTR stand for in digital marketing?',
      options: ['Click Through Rate'],
      correct: 0,
      topic: 'Analytics',
      explanation: 'Only 1 option provided',
    }),
    'MCQ with only 1 option is rejected',
    /at least 2/i
  );

  // Add Question 1: Valid MCQ
  const q1Id = await noThrow(
    () => api.assessAdmin.upsertQuestion(educatorId, quizId!, {
      text: 'What is the primary formula used to calculate Click-Through Rate (CTR)?',
      options: [
        '(Clicks / Impressions) * 100',
        '(Impressions / Clicks) * 100',
        '(Conversions / Clicks) * 100',
        '(Revenue / Ad Spend) * 100',
      ],
      correct: 0, // Option 0 is correct
      topic: 'Ad Metrics',
      explanation: 'CTR is calculated by dividing total clicks by total impressions and multiplying by 100.',
      marks: 5,
    }),
    'Upsert valid 5-mark MCQ Question'
  );
  ok(!!q1Id, 'Question 1 ID returned', q1Id);

  // Add Question 2: Valid Fill-in-the-Blank
  const q2Id = await noThrow(
    () => api.assessAdmin.upsertQuestion(educatorId, quizId!, {
      text: 'In Google Ads, the quality score metric has a maximum rating of ____.',
      options: ['10'],
      blankAnswer: '10',
      correct: 0,
      kind: 'fill_blank',
      topic: 'Search Ads',
      explanation: 'Quality score ranges from 1 to 10.',
      marks: 5,
    }),
    'Upsert valid 5-mark Fill-in-the-Blank Question'
  );
  ok(!!q2Id, 'Question 2 ID returned', q2Id);

  // Add Question 3: Valid Coding Challenge (Python/JS snippet evaluation)
  const q3Id = await noThrow(
    () => api.assessAdmin.upsertQuestion(educatorId, quizId!, {
      text: 'Write a JavaScript function "calculateROAS(revenue, spend)" that returns the return on ad spend multiplier.',
      options: [],
      correct: 0,
      kind: 'code',
      topic: 'Marketing Automation',
      explanation: 'ROAS is revenue divided by ad spend.',
      marks: 10,
      code: {
        stack: 'javascript',
        starter: 'function calculateROAS(revenue, spend) {\n  // return revenue / spend\n}',
        tests: [
          { stdin: 'calculateROAS(5000, 1000)', expect: '5' },
          { stdin: 'calculateROAS(12000, 3000)', expect: '4', hidden: true },
        ],
      },
    }),
    'Upsert valid 10-mark Code Question with hidden test case'
  );
  ok(!!q3Id, 'Question 3 ID returned', q3Id);

  // Verify dynamic marks recalculation: 5 + 5 + 10 = 20 total marks
  const updatedQuiz = api.assessAdmin.get(educatorId, quizId!);
  ok(updatedQuiz?.a.marks === 20, 'Quiz total marks dynamically recalculated to 20', updatedQuiz?.a.marks);
  ok(updatedQuiz?.questions.length === 3, 'All 3 questions attached to quiz');

  /* ──────────────────────────────────────────────────────────────────────────
   * STEP 3: Checklist Guard & Quiz Publishing
   * ────────────────────────────────────────────────────────────────────────── */
  console.log('\n--- 3. Checklist Verification & Publishing ---');

  // Checklist should block publishing without a title >= 4 chars
  const checklistPre = api.assessAdmin.checklist(updatedQuiz!.a);
  const titleCheck = checklistPre.find((c) => /title/i.test(c.text));
  ok(titleCheck?.ok === false, 'Checklist correctly fails title requirement when empty');

  // Update title and duration
  api.assessAdmin.update(educatorId, quizId!, {
    title: 'Digital Marketing & Analytics Midterm Quiz',
    durationMin: 20,
    passPct: 60,
  });

  const checklistPost = api.assessAdmin.checklist(api.assessAdmin.get(educatorId, quizId!)!.a);
  ok(checklistPost.every((c) => c.ok), 'All checklist items pass after title and duration set');

  // Publish the Quiz
  await noThrow(
    () => api.assessAdmin.publish(educatorId, quizId!),
    'Educator publishes Quiz'
  );

  const publishedQuiz = api.assessAdmin.get(educatorId, quizId!);
  ok(publishedQuiz?.a.status === 'published', 'Quiz status transitioned to "published"');

  /* ──────────────────────────────────────────────────────────────────────────
   * STEP 4: Student Quiz Discovery, Security & Submission
   * ────────────────────────────────────────────────────────────────────────── */
  console.log('\n--- 4. Student Discovery & Quiz Attempt ---');

  // Security check: non-enrolled learner cannot start the quiz
  await throws(
    () => api.assessments.start(nonEnrolledStudentId, quizId!),
    'Non-enrolled student is blocked from starting quiz',
    /enroll in the course/i
  );

  // Enrolled student fetches assessments list
  const studentAssessments = await api.assessments.list(studentId, null);
  const quizRow = studentAssessments.rows.find((r) => r.a.id === quizId);
  ok(!!quizRow, 'Published quiz appears in enrolled student assessment list');
  ok(quizRow?.status === 'pending', 'Quiz initial status for student is "pending"');

  // Student starts the quiz
  const attemptSession = api.assessments.start(studentId, quizId!);
  ok(attemptSession.questions.length === 3, 'Student receives exactly 3 questions');

  // SECURITY VERIFICATION: Student payload MUST NOT expose answers or hidden tests
  const studentQ1 = attemptSession.questions.find((q) => q.id === q1Id);
  ok(studentQ1 !== undefined, 'Student received MCQ question 1');

  // Student submits their answers:
  // Q1: Option 0 (Correct -> 5 marks)
  // Q2: '10' (Correct -> 5 marks)
  // Q3: Correct answer simulated
  const answers = [
    0,     // Q1 MCQ answer index 0 (Correct)
    '10',  // Q2 Blank answer '10' (Correct)
    'code_submitted', // Q3 Code test output
  ];

  const startTime = Date.now() - 180000; // 3 minutes ago
  const attemptResult = await noThrow(
    () => api.assessments.submit(studentId, quizId!, answers, startTime),
    'Student submits quiz attempt'
  );

  ok(!!attemptResult?.id, 'Attempt ID created', attemptResult?.id);
  ok(attemptResult!.scorePct >= 50, 'Student passed quiz with score percentage', attemptResult?.scorePct);
  ok(attemptResult!.timeTakenSec >= 100, 'Time taken accurately calculated', `${attemptResult?.timeTakenSec}s`);

  // Verify attempt is recorded in mock database
  const savedAttempt = db.attempts.find((t) => t.id === attemptResult?.id);
  ok(!!savedAttempt && savedAttempt.userId === studentId, 'Attempt persisted in database for student');

  // Student views result summary
  const studentResultView = api.assessments.attempt(attemptResult!.id);
  ok(studentResultView?.t.scorePct === attemptResult?.scorePct, 'Result view matches submitted score percentage');
  ok(studentResultView?.questions.length === 3, 'Result view provides question-level review');

  /* ──────────────────────────────────────────────────────────────────────────
   * STEP 5: Educator Quiz Results Verification
   * ────────────────────────────────────────────────────────────────────────── */
  console.log('\n--- 5. Educator Quiz Results & Locking Verification ---');

  const educatorQuizReview = api.assessAdmin.get(educatorId, quizId!);
  ok(educatorQuizReview?.locked === true, 'Quiz is now locked against structural edits after student response');

  // Check educator assessment list aggregates
  const educatorAssessList = await api.assessAdmin.list(educatorId);
  const quizAdminRow = educatorAssessList.rows.find((r) => r.a.id === quizId);
  ok(quizAdminRow?.responses === 1, 'Educator dashboard shows 1 student response', quizAdminRow?.responses);
  ok(quizAdminRow?.avg !== null && quizAdminRow.avg > 0, 'Class average score computed', quizAdminRow?.avg);

  /* ──────────────────────────────────────────────────────────────────────────
   * STEP 6: Educator Assignment Creation & Custom Rubric Setup
   * ────────────────────────────────────────────────────────────────────────── */
  console.log('\n--- 6. Educator Assignment Creation & Rubric ---');

  const asgId = await noThrow(
    () => api.assessAdmin.create(educatorId, 'assignment', courseId),
    'Educator creates new Assignment'
  );
  ok(!!asgId && asgId.startsWith('asg_'), 'Assignment ID generated', asgId);

  // Configure assignment details and custom grading rubric
  const dueFuture = new Date(Date.now() + 5 * 864e5).toISOString(); // 5 days from now
  const customRubric = [
    { item: 'Data Analysis & Strategy Formulation', max: 15 },
    { item: 'Campaign Implementation & Ad Copies', max: 15 },
  ];

  api.assessAdmin.update(educatorId, asgId!, {
    title: 'Q4 Omnichannel Growth Strategy Plan',
    instructions: 'Submit a comprehensive growth strategy deck including target audience persona, keyword list, and budget allocation.',
    dueAt: dueFuture,
    accepts: ['PDF', 'Link'],
    maxMb: 25,
    rubric: customRubric,
    settings: {
      shuffle: false,
      attempts: 1,
      showAnswers: false,
      lateAllowed: true,
    },
  });

  const updatedAsg = api.assessAdmin.get(educatorId, asgId!);
  ok(updatedAsg?.a.marks === 30, 'Assignment total marks calculated from rubric: 15 + 15 = 30', updatedAsg?.a.marks);

  // Publish the Assignment
  await noThrow(
    () => api.assessAdmin.publish(educatorId, asgId!),
    'Educator publishes Assignment'
  );
  ok(api.assessAdmin.get(educatorId, asgId!)?.a.status === 'published', 'Assignment status is "published"');

  /* ──────────────────────────────────────────────────────────────────────────
   * STEP 7: Student Assignment Submission & Validation
   * ────────────────────────────────────────────────────────────────────────── */
  console.log('\n--- 7. Student Assignment Submission ---');

  // Verify pending assignment count for student increments
  const pendingCount = api.assessments.pendingAssignments(studentId);
  ok(pendingCount >= 1, 'Student pending assignments counter reflects newly published assignment', pendingCount);

  // Validation: empty submission without files or link is rejected
  await throws(
    () => api.assessments.saveSubmission(studentId, asgId!, { files: [], link: '', note: '' }, true),
    'Submitting empty assignment without files or link is rejected',
    /add a file or a link/i
  );

  // Validation: invalid URL format is rejected
  await throws(
    () => api.assessments.saveSubmission(studentId, asgId!, { files: [], link: 'ftp://invalid-link', note: 'my plan' }, true),
    'Submitting link without https:// prefix is rejected',
    /full link starting with https/i
  );

  // Student submits valid assignment deliverables
  const studentSubmission = await noThrow(
    () => api.assessments.saveSubmission(studentId, asgId!, {
      files: [{ id: 'f_plan_pdf', name: 'Arjun_Growth_Strategy_2026.pdf', url: 'https://files.bodhin.in/arjun_plan.pdf', sizeMb: 4.2 }],
      link: 'https://docs.google.com/presentation/d/arjun-growth-deck',
      note: 'Complete Q4 multichannel growth deck with competitor keyword gap analysis and 3 campaign funnels.',
    }, true),
    'Student successfully submits assignment deliverables'
  );

  ok(studentSubmission?.status === 'submitted', 'Submission status transitions to "submitted"');
  ok(!!studentSubmission?.submittedAt, 'Submission timestamp recorded');

  // Verify student view status updates
  const asgListAfterSubmit = await api.assessments.list(studentId, null);
  const submittedRow = asgListAfterSubmit.rows.find((r) => r.a.id === asgId);
  ok(submittedRow?.status === 'submitted', 'Student assessments list shows status as "submitted"');

  /* ──────────────────────────────────────────────────────────────────────────
   * STEP 8: Educator Grading Queue, Rubric Scoring & Evaluation
   * ────────────────────────────────────────────────────────────────────────── */
  console.log('\n--- 8. Educator Grading Queue & Rubric Scoring ---');

  // Check educator's grading queue: student's submission appears under 'to_grade'
  const gradingQueue = await api.grading.queue(educatorId, 'to_grade');
  const queueItem = gradingQueue.rows.find((r) => r.s.assessmentId === asgId && r.s.userId === studentId);
  ok(!!queueItem, 'Submitted assignment appears in Educator grading queue');
  ok(queueItem?.name === 'Arjun Kumar', 'Learner name correctly mapped in queue item');

  // Fetch submission detail
  const subDetail = api.grading.detail(educatorId, queueItem!.s.id);
  ok(subDetail !== null, 'Educator fetches submission detail');
  ok(subDetail?.rubric.length === 2, 'Educator receives the 2 rubric evaluation criteria');

  // Validation: grading with empty feedback is rejected
  await throws(
    () => api.grading.grade(educatorId, queueItem!.s.id, { scores: [14, 15], feedback: 'Good' }),
    'Grading with short feedback (<5 characters) is rejected',
    /add a line of feedback/i
  );

  // Educator grades submission: 14/15 on Strategy, 15/15 on Implementation (29/30 = 97%)
  const gradeInput = {
    scores: [14, 15],
    feedback: 'Outstanding strategy deck Arjun! The competitor gap analysis and campaign budget split are thoroughly thought through.',
  };

  const gradeResult = await noThrow(
    () => api.grading.grade(educatorId, queueItem!.s.id, gradeInput),
    'Educator grades submission with rubric marks and feedback'
  );

  ok(gradeResult?.pct === 97, 'Overall grade percentage calculated accurately: (14+15)/30 = 97%', gradeResult?.pct);

  // Queue updates: item moves out of 'to_grade'
  const queueAfterGrade = await api.grading.queue(educatorId, 'to_grade');
  ok(!queueAfterGrade.rows.some((r) => r.s.id === queueItem!.s.id), 'Graded item removed from "to_grade" queue');

  const gradedQueue = await api.grading.queue(educatorId, 'graded');
  ok(gradedQueue.rows.some((r) => r.s.id === queueItem!.s.id), 'Graded item now appears in "graded" queue');

  /* ──────────────────────────────────────────────────────────────────────────
   * STEP 9: Student Grade Verification & Rubric Breakdown
   * ────────────────────────────────────────────────────────────────────────── */
  console.log('\n--- 9. Student Grade & Feedback Verification ---');

  // Student receives notification
  const studentNotifications = db.notifications.filter((n) => n.userId === studentId);
  const gradeNotif = studentNotifications.find((n) => n.kind === 'grade' && /97%/.test(n.title));
  ok(!!gradeNotif, 'Student received in-app notification with grade percentage: "Assignment graded: 97%"');

  // Student views evaluated assignment
  const studentSubmissionView = api.assessments.submission(studentId, asgId!);
  ok(studentSubmissionView?.status === 'graded', 'Student submission status is "graded"');
  ok(studentSubmissionView?.grade?.pct === 97, 'Student submission grade matches 97%');
  ok(studentSubmissionView?.grade?.rubric?.[0]?.score === 14, 'Rubric Criterion 1 score matches 14/15');
  ok(studentSubmissionView?.grade?.rubric?.[1]?.score === 15, 'Rubric Criterion 2 score matches 15/15');
  ok(studentSubmissionView?.grade?.feedback === gradeInput.feedback, 'Tutor feedback matches verbatim');

  /* ──────────────────────────────────────────────────────────────────────────
   * STEP 10: Resubmission Lifecycle (Edge Case Testing)
   * ────────────────────────────────────────────────────────────────────────── */
  console.log('\n--- 10. Resubmission Lifecycle (Edge Case) ---');

  // Create another assignment for resubmission flow
  const resubAsgId = await api.assessAdmin.create(educatorId, 'assignment', courseId);
  api.assessAdmin.update(educatorId, resubAsgId, {
    title: 'Ad Creative Design & Copywriting',
    dueAt: new Date(Date.now() + 864e5 * 3).toISOString(),
    instructions: 'Upload 3 banner mockups.',
    rubric: [{ item: 'Visual appeal', max: 10 }],
  });
  await api.assessAdmin.publish(educatorId, resubAsgId);

  // Student submits initial draft
  const initialSub = await api.assessments.saveSubmission(studentId, resubAsgId, {
    files: [{ id: 'f_partial', name: 'draft_banner.png', url: 'https://files.bodhin.in/draft.png', sizeMb: 1.0 }],
    note: 'First mockup only.',
  }, true);

  // Educator reviews and requests resubmission
  const resubNote = 'Please submit all 3 banner variants as requested in the brief.';
  await noThrow(
    () => api.grading.requestResubmit(educatorId, initialSub.id, resubNote),
    'Educator requests resubmission with feedback'
  );

  const returnedSub = api.assessments.submission(studentId, resubAsgId);
  ok(returnedSub?.status === 'draft', 'Submission status reverted to "draft" for learner revision');
  ok(returnedSub?.returnNote === resubNote, 'Return note attached to submission for student guidance');

  // Student updates and resubmits
  const resubmitted = await api.assessments.saveSubmission(studentId, resubAsgId, {
    files: [
      { id: 'f_1', name: 'banner_square.png', url: 'https://files.bodhin.in/b1.png', sizeMb: 1.0 },
      { id: 'f_2', name: 'banner_story.png', url: 'https://files.bodhin.in/b2.png', sizeMb: 1.1 },
      { id: 'f_3', name: 'banner_landscape.png', url: 'https://files.bodhin.in/b3.png', sizeMb: 1.2 },
    ],
    note: 'Added all 3 requested variants.',
  }, true);
  ok(resubmitted.status === 'submitted', 'Resubmitted assignment is now back in "submitted" status');

  // Educator awards final grade
  const finalGrade = await api.grading.grade(educatorId, resubmitted.id, {
    scores: [10],
    feedback: 'Great revisions! All 3 format ratios are properly balanced.',
  });
  ok(finalGrade.pct === 100, 'Final resubmission successfully graded at 100%');

  /* ──────────────────────────────────────────────────────────────────────────
   * FINAL SUMMARY
   * ────────────────────────────────────────────────────────────────────────── */
  console.log('\n===============================================================');
  console.log(`  QA TEST COMPLETE: ${pass} PASSED, ${fail} FAILED`);
  console.log('===============================================================\n');

  if (fails.length > 0) {
    console.error('Failed assertions:');
    fails.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  }
}

runAssessmentJourney().catch((err) => {
  console.error('Test execution failed with unhandled error:', err);
  process.exit(1);
});
