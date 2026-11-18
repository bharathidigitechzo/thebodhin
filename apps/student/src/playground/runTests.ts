/** Runs a learner's program against input → expected-output tests (coding questions in quizzes and exams). */
import { playground } from '@/api/client';
import type { CodeSpec } from '@/core/assess';
import { browserCapable, runInBrowser } from './runners';
import { gradeIo, type TestResult } from './checks';
import { stackOf, STACKS, type Stack } from './stacks';

/** Languages a coding question can use: every playground language that reads input and prints output. */
export const CODE_STACKS: Stack[] = STACKS.filter((s) => s.stdin);

export const starterFor = (stackId: string) => stackOf(stackId)?.files[0]?.code ?? '';

export async function runCodeTests(userId: string, spec: CodeSpec, code: string): Promise<TestResult[]> {
  const stack = stackOf(spec.stack);
  if (!stack) throw new Error('This language isn’t available.');
  const files = [{ ...stack.files[0], code }];
  const tests = spec.tests.map((t, i) => ({ name: t.hidden ? `Hidden test ${i + 1}` : `Test ${i + 1}`, stdin: t.stdin, expect: t.expect }));
  const out: TestResult[] = [];
  if (browserCapable(stack)) {
    for (const t of tests) {
      const r = await runInBrowser(stack, files, t.stdin);
      out.push(gradeIo(t, r.stdout, r.ok ? undefined : r.stderr.trim() || 'Your program stopped with an error.'));
      if (!r.ok && r.timedOut) {
        for (const rest of tests.slice(out.length)) out.push({ name: rest.name, pass: false, error: 'Skipped: an earlier test ran too long.' });
        break;
      }
    }
    return out;
  }
  const res = await playground.runRemote(userId, stack.id, files, tests.map((t) => t.stdin));
  return tests.map((t, i) => gradeIo(t, res[i]?.stdout ?? '', res[i]?.ok ? undefined : (res[i]?.stderr || 'Your program stopped with an error.').trim()));
}

/** One run with the learner's own input (assignment "Write code" answers). */
export async function runOnce(userId: string, stackId: string, code: string, stdin: string) {
  const stack = stackOf(stackId);
  if (!stack) throw new Error('This language isn’t available.');
  const files = [{ ...stack.files[0], code }];
  if (browserCapable(stack)) return runInBrowser(stack, files, stdin);
  const [r] = await playground.runRemote(userId, stack.id, files, [stdin]);
  return r;
}
