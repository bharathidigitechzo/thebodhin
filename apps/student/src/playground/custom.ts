/**
 * Playground challenges added by the Bodhin team (Super Admin → Playground challenges).
 * One record per task; it becomes one Challenge per language it is offered in, so it behaves exactly like the
 * built-in ones (same list card, language picker, runner, checking, points and "solved").
 * Pure TypeScript — no React imports.
 */
import type { Challenge, IoTest, Level } from './challenges';
import { stackOf, type PFile } from './stacks';

export interface CustomChallenge {
  /** Task id, e.g. "x7k2pq". Each language's challenge id is `${stack}-${id}` (see twinChallenge). */
  id: string;
  kind: 'io' | 'sql';
  title: string;
  level: Level;
  points: number;
  prompt: string;
  /** io: languages offered, each with its starter code. */
  langs: { stack: string; starter: string }[];
  tests: IoTest[];
  /** sql: schema + data run before the learner's query, the expected last result table, and the starter query. */
  setup?: string;
  expect?: (string | number | null)[][];
  ordered?: boolean;
  sqlStarter?: string;
  sqlSolution?: string;
  status: 'draft' | 'published';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export const CUSTOM_LIMITS = { titleMin: 4, titleMax: 60, promptMin: 15, promptMax: 1500, tests: 10, ioMax: 2000, codeMax: 20000, setupMax: 20000, rowsMax: 200, pointsMin: 5, pointsMax: 100 };

/** Languages a program challenge can use: every playground language that reads input and prints output. */
export const IO_STACKS = ['python', 'javascript', 'typescript', 'java', 'c', 'cpp', 'csharp', 'go', 'rust', 'php', 'ruby', 'kotlin'];

/**
 * Starter code for a new challenge: an empty program that reads input, per language.
 * (The playground's own starters are "Hello, Bodhin!" demos — wrong for a task.)
 */
const STARTERS: Record<string, string> = {
  python: '# Each input() reads one line of the input.\n# Read what the task needs, then print the answer.\n\n',
  javascript: '// input() returns the next line of the input as text.\n// Read what the task needs, then print the answer with console.log.\n\n',
  typescript: '// input() returns the next line of the input as text.\n// Read what the task needs, then print the answer with console.log.\n\n',
  java: 'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        // read the input, then print the answer\n    }\n}\n',
  c: '#include <stdio.h>\n\nint main(void) {\n    // read the input with scanf, then print the answer\n    return 0;\n}\n',
  cpp: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    // read the input with cin, then print the answer\n    return 0;\n}\n',
  csharp: 'using System;\n\nclass Program {\n    static void Main() {\n        // read the input with Console.ReadLine(), then print the answer\n    }\n}\n',
  go: 'package main\n\nimport "fmt"\n\nfunc main() {\n\t// read the input with fmt.Scan, then print the answer\n\tfmt.Print("")\n}\n',
  rust: 'use std::io::{self, Read};\n\nfn main() {\n    let mut input = String::new();\n    io::stdin().read_to_string(&mut input).unwrap();\n    // use `input`, then print the answer\n}\n',
  php: '<?php\n// read the input with fgets(STDIN), then print the answer\n',
  ruby: '# read the input with gets, then print the answer\n',
  kotlin: 'fun main() {\n    // read the input with readLine(), then print the answer\n}\n',
};
export const starterTemplate = (stack: string) => STARTERS[stack] ?? '';

const file = (stack: string, code: string): PFile => {
  const base = stackOf(stack)?.files[0] ?? { name: 'main.txt', lang: 'plain' as const, code: '' };
  return { ...base, code };
};

/** The playable challenges for one record (one per language). */
export function expandCustom(c: CustomChallenge): Challenge[] {
  const base = { title: c.title, level: c.level, points: c.points, prompt: c.prompt, custom: true as const };
  if (c.kind === 'sql') {
    return [{ ...base, id: `sql-${c.id}`, stack: 'sql', kind: 'sql', setup: c.setup ?? '', expect: c.expect ?? [], ordered: !!c.ordered, files: [file('sql', c.sqlStarter ?? 'SELECT 1;\n')], solution: c.sqlSolution ? [file('sql', c.sqlSolution)] : [] }];
  }
  return c.langs.filter((l) => stackOf(l.stack)).map((l) => ({ ...base, id: `${l.stack}-${c.id}`, stack: l.stack, kind: 'io' as const, tests: c.tests, files: [file(l.stack, l.starter)], solution: [] }));
}

/** Everything wrong with a challenge (empty = OK). `publish` adds the checks a learner-facing challenge needs. */
export function customErrors(c: Omit<CustomChallenge, 'id' | 'status' | 'createdBy' | 'createdAt' | 'updatedAt'>, publish: boolean): { field: string; msg: string }[] {
  const L = CUSTOM_LIMITS;
  const e: { field: string; msg: string }[] = [];
  if (c.title.trim().length < L.titleMin || c.title.trim().length > L.titleMax) e.push({ field: 'title', msg: `Title: ${L.titleMin}–${L.titleMax} characters.` });
  if (c.prompt.trim().length < L.promptMin || c.prompt.length > L.promptMax) e.push({ field: 'prompt', msg: `Describe the task in ${L.promptMin}–${L.promptMax} characters.` });
  if (!['Beginner', 'Intermediate', 'Advanced'].includes(c.level)) e.push({ field: 'level', msg: 'Pick a level.' });
  if (!(c.points >= L.pointsMin && c.points <= L.pointsMax)) e.push({ field: 'points', msg: `Points: ${L.pointsMin}–${L.pointsMax}.` });
  if (c.kind === 'io') {
    if (!c.langs.length) e.push({ field: 'langs', msg: 'Pick at least one language.' });
    if (c.langs.some((l) => !IO_STACKS.includes(l.stack))) e.push({ field: 'langs', msg: 'One of the languages isn’t available.' });
    if (c.langs.some((l) => l.starter.length > L.codeMax)) e.push({ field: 'langs', msg: 'Starter code is too long.' });
    if (c.tests.length > L.tests) e.push({ field: 'tests', msg: `Up to ${L.tests} tests.` });
    if (c.tests.some((t) => t.stdin.length > L.ioMax || t.expect.length > L.ioMax)) e.push({ field: 'tests', msg: `Test input/output: up to ${L.ioMax} characters each.` });
    if (publish && !c.tests.length) e.push({ field: 'tests', msg: 'Add at least one test before publishing.' });
    if (c.tests.some((t) => !t.expect.trim())) e.push({ field: 'tests', msg: 'Every test needs the expected output.' });
  } else {
    if ((c.setup ?? '').length > L.setupMax) e.push({ field: 'setup', msg: 'Table setup is too long.' });
    if ((c.sqlStarter ?? '').length > L.codeMax || (c.sqlSolution ?? '').length > L.codeMax) e.push({ field: 'setup', msg: 'Query is too long.' });
    if ((c.expect ?? []).length > L.rowsMax) e.push({ field: 'expect', msg: `Expected result: up to ${L.rowsMax} rows.` });
    if (publish && !(c.setup ?? '').trim()) e.push({ field: 'setup', msg: 'Add the table setup (CREATE TABLE + INSERT).' });
    if (publish && !(c.expect ?? []).length) e.push({ field: 'expect', msg: 'Run your answer to set the expected result before publishing.' });
  }
  return e;
}
