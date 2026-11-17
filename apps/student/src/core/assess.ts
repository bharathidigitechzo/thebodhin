/** Assessment domain: quizzes, exams, assignments + pure scoring. No React imports. */

export type AssessKind = 'quiz' | 'exam' | 'assignment';

export interface Question {
  id: string;
  text: string;
  options: string[];
  correct: number;
  topic: string;
  hint?: string;
  explanation: string;
  kind?: 'mcq' | 'fill_blank';
  blankAnswer?: string;
  marks?: number;
}

export interface Assessment {
  id: string;
  courseId: string;
  kind: AssessKind;
  title: string;
  moduleTitle?: string;
  lessonId?: string; // quiz that sits inside the curriculum
  durationMin?: number;
  marks: number;
  passPct: number;
  dueAt?: string; // assignments
  opensAt?: string; // scheduled exams
  questionIds?: string[];
  // assignment content
  instructions?: string;
  requirements?: string[];
  resources?: { name: string; kind: 'pdf' | 'link'; size?: string }[];
  accepts?: string[]; // file extensions
  maxMb?: number;
  // educator authoring (E5)
  status?: 'draft' | 'published'; // seed assessments are published
  batchId?: string | null; // null/undefined = everyone in the course
  rubric?: { item: string; max: number }[];
  settings?: { shuffle: boolean; attempts: number; showAnswers: boolean; lateAllowed: boolean }; // attempts 0 = unlimited
  createdBy?: string;
  updatedAt?: string;
}

/** Rubric used for grading: the assignment's own, else marks split across its requirements. */
export function rubricOf(a: Assessment): { item: string; max: number }[] {
  if (a.rubric?.length) return a.rubric;
  const items = a.requirements?.length ? a.requirements.slice(0, 5) : ['Quality of work'];
  const each = Math.floor(a.marks / items.length);
  return items.map((item, i) => ({ item, max: i === items.length - 1 ? a.marks - each * (items.length - 1) : each }));
}

export interface Attempt {
  id: string;
  userId: string;
  assessmentId: string;
  answers: (number | string)[]; // -1 = skipped, or string for fill in the blank
  startedAt: string;
  submittedAt: string;
  timeTakenSec: number;
  correct: number;
  total: number;
  scorePct: number;
  marks: number;
  byTopic: { topic: string; pct: number }[];
  rank: number;
  of: number;
}

export interface Submission {
  id: string;
  userId: string;
  assessmentId: string;
  status: 'draft' | 'submitted' | 'graded';
  files: { name: string; sizeMb?: number; uri?: string }[];
  link?: string;
  note: string;
  updatedAt: string;
  submittedAt?: string;
  personId?: string; // workspace student (for learners without a linked demo account)
  returnNote?: string; // set when the educator asks for a resubmission
  grade?: { pct: number; feedback: string; rubric: { item: string; score: number; max: number }[]; by: string; at: string };
}

export function score(questions: Question[], answers: (number | string)[], marks: number) {
  let earnedMarks = 0;
  let totalMarks = 0;
  let correctCount = 0;

  const results = questions.map((q, i) => {
    const qMarks = q.marks ?? 2;
    totalMarks += qMarks;
    let isCorrect = false;
    const ans = answers[i];

    if (q.kind === 'fill_blank') {
      const target = (q.blankAnswer ?? q.options[q.correct] ?? '').trim().toLowerCase();
      const userAns = typeof ans === 'string' ? ans.trim().toLowerCase() : (typeof ans === 'number' && ans >= 0 ? (q.options[ans] ?? '').trim().toLowerCase() : '');
      isCorrect = target.length > 0 && userAns === target;
    } else {
      isCorrect = typeof ans === 'number' && ans === q.correct;
    }

    if (isCorrect) {
      correctCount++;
      earnedMarks += qMarks;
    }
    return { isCorrect, qMarks };
  });

  const finalTotalMarks = totalMarks || marks || questions.length * 2;
  const pct = finalTotalMarks ? Math.round((earnedMarks / finalTotalMarks) * 100) : 0;
  const topics = [...new Set(questions.map((q) => q.topic))];
  const byTopic = topics.map((t) => {
    const qs = questions.map((q, i) => ({ q, i })).filter((x) => x.q.topic === t);
    const tMarks = qs.reduce((sum, x) => sum + (x.q.marks ?? 2), 0);
    const tEarned = qs.filter((x) => results[x.i].isCorrect).reduce((sum, x) => sum + (x.q.marks ?? 2), 0);
    return { topic: t, pct: tMarks ? Math.round((tEarned / tMarks) * 100) : 0 };
  });
  return { correct: correctCount, total: questions.length, scorePct: pct, marks: earnedMarks, byTopic };
}

/** Plain-language verdict for the result header. */
export function verdict(pct: number, passPct: number) {
  if (pct >= 90) return { title: 'Outstanding!', body: 'You have a strong grip on this topic. Keep going.' };
  if (pct >= 75) return { title: 'Great job!', body: 'Solid understanding. Review the misses below to lock it in.' };
  if (pct >= passPct) return { title: 'You passed', body: 'Good effort. A quick review of the weak topics will help.' };
  return { title: 'Not quite yet', body: `You need ${passPct}% to pass. Review the explanations and try again.` };
}

export type AssessStatus = 'pending' | 'in_progress' | 'submitted' | 'graded' | 'completed' | 'scheduled' | 'overdue';
