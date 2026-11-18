/** Add / edit a Playground challenge (Super Admin). Program challenges: input → expected output in any languages. SQL: tables + expected result. */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ApiError, playgroundAdmin } from '@/api/client';
import type { Level } from '@/playground/challenges';
import { CUSTOM_LIMITS, type CustomChallenge } from '@/playground/custom';
import { runCodeTests } from '@/playground/runTests';
import { browserCapable, runInBrowser } from '@/playground/runners';
import { stackOf } from '@/playground/stacks';
import type { TestResult } from '@/playground/checks';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { Chip } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { CodeEditor } from '@/ui/CodeEditor';
import { Card, ScreenTop, ToggleRow, shared } from '@/ui/section';

type Draft = Omit<CustomChallenge, 'id' | 'status' | 'createdBy' | 'createdAt' | 'updatedAt'>;
const LEVELS: Level[] = ['Beginner', 'Intermediate', 'Advanced'];
const POINTS = [5, 10, 15, 20, 25, 30, 50];

export default function EditChallenge() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const existing = useMemo(() => (id && id !== 'new' ? playgroundAdmin.get(userId, id) : null), [id, userId]);
  const [d, setD] = useState<Draft>(() => existing ?? {
    kind: 'io', title: '', level: 'Beginner', points: 10, prompt: '',
    langs: [{ stack: 'python', starter: playgroundAdmin.starterFor('python') }],
    tests: [{ name: 'Test 1', stdin: '', expect: '' }],
    setup: '', expect: [], ordered: true, sqlStarter: 'SELECT * FROM ', sqlSolution: '',
  });
  const [tab, setTab] = useState(d.langs[0]?.stack ?? 'python'); // which language's starter / solution is shown
  const [solution, setSolution] = useState('');
  const [check, setCheck] = useState<TestResult[] | null>(null);
  const [busy, setBusy] = useState<null | 'check' | 'sql' | 'save'>(null);
  const [err, setErr] = useState<{ field?: string; msg: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const langs = playgroundAdmin.ioLanguages();
  const set = (patch: Partial<Draft>) => { setD((x) => ({ ...x, ...patch })); setNote(null); if ('tests' in patch || 'langs' in patch) setCheck(null); };
  const fe = (f: string) => (err?.field === f ? err.msg : undefined);

  if (id !== 'new' && !existing) {
    return (
      <View style={{ flex: 1, backgroundColor: c.ivory }}>
        <SafeAreaView style={{ flex: 1 }}><ScreenTop title="Challenge not found" fallback="/admin/playground" /></SafeAreaView>
      </View>
    );
  }

  const toggleLang = (stack: string) => {
    const on = d.langs.some((l) => l.stack === stack);
    if (on && d.langs.length === 1) return;
    const next = on ? d.langs.filter((l) => l.stack !== stack) : [...d.langs, { stack, starter: playgroundAdmin.starterFor(stack) }];
    set({ langs: next });
    if (on && tab === stack) setTab(next[0].stack);
    if (!on) setTab(stack);
    setCheck(null);
  };
  const starter = d.langs.find((l) => l.stack === tab);
  const setTest = (i: number, patch: Partial<Draft['tests'][number]>) => set({ tests: d.tests.map((t, j) => (j === i ? { ...t, ...patch } : t)) });

  /** Runs the admin's own answer against the tests (languages that run in the browser). */
  const runCheck = async () => {
    setBusy('check'); setErr(null); setCheck(null);
    try {
      const rs = await runCodeTests(userId, { stack: tab, starter: '', tests: d.tests.map((t) => ({ stdin: t.stdin, expect: t.expect })) }, solution);
      setCheck(rs);
    } catch (e) { setErr({ msg: e instanceof Error ? e.message : 'Could not run your answer.' }); }
    finally { setBusy(null); }
  };
  /** SQL: run the setup + the admin's answer in the browser and keep its last table as the expected result. */
  const runSql = async () => {
    setBusy('sql'); setErr(null);
    try {
      const sql = stackOf('sql')!;
      const r = await runInBrowser(sql, [{ ...sql.files[0], code: `${d.setup ?? ''}\n${d.sqlSolution ?? ''}` }], '');
      if (r.stderr) throw new Error(r.stderr.trim());
      const last = r.tables?.[r.tables.length - 1];
      if (!last) throw new Error('Your answer did not return a table. End it with a SELECT.');
      set({ expect: last.rows.slice(0, CUSTOM_LIMITS.rowsMax) });
      setNote(`Expected result set: ${last.rows.length} row${last.rows.length === 1 ? '' : 's'} (${last.columns.join(', ')}).`);
    } catch (e) { setErr({ field: 'expect', msg: e instanceof Error ? e.message : 'Could not run the query.' }); }
    finally { setBusy(null); }
  };
  const save = (publish: boolean) => {
    if (publish && check && !check.every((r) => r.pass)) {
      setErr({ msg: 'Your own answer fails some tests, so learners couldn’t solve this. Fix the tests or the answer and run it again, then publish.' });
      return;
    }
    setBusy('save'); setErr(null);
    try {
      const rec = playgroundAdmin.save(userId, { ...d, id: existing?.id }, publish);
      router.replace({ pathname: '/admin/playground', params: { saved: rec.title } });
    } catch (e) {
      const a = e as ApiError;
      setErr({ field: a.field, msg: a.message ?? 'Could not save.' });
    } finally { setBusy(null); }
  };

  const area = [styles.area, { borderColor: c.border, color: c.ink }];
  const sqlRunsHere = browserCapable(stackOf('sql')!);

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <ScreenTop title={existing ? 'Edit challenge' : 'New challenge'} sub={existing ? (existing.status === 'published' ? 'Published · changes go live when you save' : 'Draft') : 'Playground'} fallback="/admin/playground" />
        <ScrollView contentContainerStyle={shared.scroll} keyboardShouldPersistTaps="handled">
          <View style={shared.inner}>
            {err && !err.field && <Banner text={err.msg} />}
            <Card title="Basics">
              <Txt variant="label">Type</Txt>
              <View style={styles.wrap}>
                <Chip label="Program (input → output)" icon="code-slash" active={d.kind === 'io'} onPress={() => set({ kind: 'io' })} />
                <Chip label="SQL query" icon="server-outline" active={d.kind === 'sql'} onPress={() => set({ kind: 'sql' })} />
              </View>
              <TextField label="Title" value={d.title} onChangeText={(v) => set({ title: v.slice(0, CUSTOM_LIMITS.titleMax) })} placeholder="e.g. Reverse a string" error={fe('title')} />
              <Txt variant="label">Task (what learners must do)</Txt>
              <TextInput value={d.prompt} onChangeText={(v) => set({ prompt: v.slice(0, CUSTOM_LIMITS.promptMax) })} multiline placeholder={d.kind === 'sql' ? 'e.g. Table orders(id, customer, amount). Show each customer and their total, highest first.' : 'e.g. Read a word and print it backwards.'} placeholderTextColor={c.muted} style={area} accessibilityLabel="Task" />
              {fe('prompt') && <Txt variant="caption" color={c.danger}>{fe('prompt')}</Txt>}
              <Txt variant="label">Level</Txt>
              <View style={styles.wrap}>{LEVELS.map((l) => <Chip key={l} label={l} active={d.level === l} onPress={() => set({ level: l })} />)}</View>
              <Txt variant="label">Points</Txt>
              <View style={styles.wrap}>{POINTS.map((p) => <Chip key={p} label={`${p} pts`} active={d.points === p} onPress={() => set({ points: p })} />)}</View>
            </Card>

            {d.kind === 'io' ? (
              <>
                <Card title="Languages">
                  <Txt variant="caption" color={c.muted}>Learners see one card and pick any of these languages inside it. Each gets its own starter code.</Txt>
                  <View style={styles.wrap}>{langs.map((s) => <Chip key={s.id} label={s.name} active={d.langs.some((l) => l.stack === s.id)} onPress={() => toggleLang(s.id)} />)}</View>
                  {fe('langs') && <Txt variant="caption" color={c.danger}>{fe('langs')}</Txt>}
                  <Txt variant="label">Starter code</Txt>
                  <View style={styles.wrap}>{d.langs.map((l) => <Chip key={l.stack} label={stackOf(l.stack)?.name ?? l.stack} active={tab === l.stack} onPress={() => { setTab(l.stack); setCheck(null); }} />)}</View>
                  {starter && <CodeEditor key={tab} value={starter.starter} onChange={(v) => set({ langs: d.langs.map((l) => (l.stack === tab ? { ...l, starter: v } : l)) })} lang={stackOf(tab)?.files[0]?.lang ?? 'plain'} label={`Starter code, ${stackOf(tab)?.name}`} minHeight={160} />}
                </Card>

                <Card title={`Tests (${d.tests.length}/${CUSTOM_LIMITS.tests})`}>
                  <Txt variant="caption" color={c.muted}>The program gets the input and must print exactly the expected output (trailing spaces ignored). The same tests apply to every language. A learner solves it when every test passes.</Txt>
                  <Banner tone="info" text="Input is read line by line: each input() (Python), readLine() (Kotlin), Console.ReadLine() (C#)… reads ONE line. Put each value on its own line — or, if the task says “three numbers on one line”, learners must split that line. Say the format in the task." />
                  {d.tests.map((t, i) => (
                    <View key={i} style={[styles.test, { borderColor: c.border }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <TextInput value={t.name} onChangeText={(v) => setTest(i, { name: v.slice(0, 40) })} placeholder={`Test ${i + 1}`} placeholderTextColor={c.muted} style={[styles.name, { color: c.ink }]} accessibilityLabel={`Test ${i + 1} name`} />
                        {d.tests.length > 1 && (
                          <Pressable onPress={() => set({ tests: d.tests.filter((_, j) => j !== i) })} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove test ${i + 1}`}>
                            <Ionicons name="trash-outline" size={18} color={c.danger} />
                          </Pressable>
                        )}
                      </View>
                      <Txt variant="label" color={c.inkSoft}>Input <Txt variant="caption" color={c.muted}>({t.stdin ? `${t.stdin.replace(/\n+$/, '').split('\n').length} line${t.stdin.replace(/\n+$/, '').split('\n').length === 1 ? '' : 's'}` : 'empty'})</Txt></Txt>
                      <TextInput value={t.stdin} onChangeText={(v) => setTest(i, { stdin: v })} multiline placeholder={'Input (optional), e.g.\n10\n20\n30'} placeholderTextColor={c.muted} style={[...area, styles.mono]} autoCapitalize="none" autoCorrect={false} accessibilityLabel={`Test ${i + 1} input`} />
                      <Txt variant="label" color={c.inkSoft}>Expected output</Txt>
                      <TextInput value={t.expect} onChangeText={(v) => setTest(i, { expect: v })} multiline placeholder="Expected output, e.g. 5" placeholderTextColor={c.muted} style={[...area, styles.mono]} autoCapitalize="none" autoCorrect={false} accessibilityLabel={`Test ${i + 1} expected output`} />
                    </View>
                  ))}
                  {fe('tests') && <Txt variant="caption" color={c.danger}>{fe('tests')}</Txt>}
                  {d.tests.length < CUSTOM_LIMITS.tests && <Button title="Add test" iconLeft="add" size="md" variant="outline" onPress={() => set({ tests: [...d.tests, { name: `Test ${d.tests.length + 1}`, stdin: '', expect: '' }] })} />}
                </Card>

                <Card title="Check with your answer (recommended)">
                  <Txt variant="caption" color={c.muted}>Write a correct {stackOf(tab)?.name} answer and run it against your tests, so you know learners can solve it. It isn’t shown to learners.{browserCapable(stackOf(tab)!) ? '' : ` ${stackOf(tab)?.name} runs on Bodhin’s code server.`}</Txt>
                  <CodeEditor key={`sol-${tab}`} value={solution || starter?.starter || ''} onChange={(v) => { setSolution(v); setCheck(null); }} lang={stackOf(tab)?.files[0]?.lang ?? 'plain'} label="Your answer" minHeight={140} />
                  <Button title={`Run my ${stackOf(tab)?.name} answer`} iconLeft="play" size="md" variant="outline" loading={busy === 'check'} onPress={runCheck} />
                  {check && (
                    <View style={{ gap: 6 }}>
                      <Banner tone={check.every((r) => r.pass) ? 'success' : 'danger'} text={check.every((r) => r.pass) ? `All ${check.length} tests pass — learners can solve this.` : `${check.filter((r) => r.pass).length} of ${check.length} tests pass. Fix the tests or your answer.`} />
                      {check.map((r, k) => (r.pass ? null : (
                        <View key={k} style={[styles.fail, { borderColor: c.danger }]}>
                          <Txt variant="label" color={c.danger}>{d.tests[k]?.name || `Test ${k + 1}`} failed</Txt>
                          <Txt variant="caption" color={c.inkSoft}>Input given:</Txt>
                          <Txt variant="caption" style={styles.mono}>{d.tests[k]?.stdin.replace(/\n+$/, '') || '(empty)'}</Txt>
                          {r.error ? (
                            <>
                              <Txt variant="caption" color={c.inkSoft}>Your answer stopped with an error:</Txt>
                              <Txt variant="caption" color={c.danger} style={styles.mono}>{r.error.split('\n').slice(-2).join('\n')}</Txt>
                              {/invalid literal|NumberFormat|ValueError|parse/i.test(r.error) && <Txt variant="caption" color={c.warning}>Tip: the answer read a whole line as one number. Put each value on its own line in the test input, or split the line in the answer.</Txt>}
                            </>
                          ) : (
                            <Txt variant="caption" color={c.inkSoft}>Expected “{r.expected}” · got “{r.got || '(nothing)'}”</Txt>
                          )}
                        </View>
                      )))}
                    </View>
                  )}
                </Card>
              </>
            ) : (
              <>
                <Card title="Tables">
                  <Txt variant="caption" color={c.muted}>CREATE TABLE and INSERT statements. They run before every learner query, so each learner starts with the same data.</Txt>
                  <CodeEditor value={d.setup ?? ''} onChange={(v) => set({ setup: v, expect: [] })} lang="sql" label="Table setup" minHeight={160} />
                  {fe('setup') && <Txt variant="caption" color={c.danger}>{fe('setup')}</Txt>}
                  <Txt variant="label">Starter query (what learners see first)</Txt>
                  <CodeEditor value={d.sqlStarter ?? ''} onChange={(v) => set({ sqlStarter: v })} lang="sql" label="Starter query" minHeight={80} />
                </Card>
                <Card title="Expected result">
                  <Txt variant="caption" color={c.muted}>Write the correct query and run it. Its result becomes the answer learners must match.</Txt>
                  <CodeEditor value={d.sqlSolution ?? ''} onChange={(v) => set({ sqlSolution: v, expect: [] })} lang="sql" label="Your answer query" minHeight={100} />
                  <Button title="Run my answer & set the expected result" iconLeft="play" size="md" variant="outline" loading={busy === 'sql'} disabled={!sqlRunsHere} onPress={runSql} />
                  {!sqlRunsHere && <Txt variant="caption" color={c.muted}>Open this page on the web to run SQL.</Txt>}
                  {note && <Banner tone="success" text={note} />}
                  {fe('expect') && <Banner text={fe('expect')!} />}
                  {!!d.expect?.length && (
                    <View style={[styles.table, { borderColor: c.border }]}>
                      {d.expect.slice(0, 8).map((row, i) => <Txt key={i} variant="caption" style={styles.mono}>{row.map((v) => (v === null ? 'NULL' : String(v))).join('  |  ')}</Txt>)}
                      {d.expect.length > 8 && <Txt variant="caption" color={c.muted}>…and {d.expect.length - 8} more rows</Txt>}
                    </View>
                  )}
                  <ToggleRow title="Row order matters" sub="On: rows must come in this order (use when the task says “ordered by …”)" value={!!d.ordered} onChange={(v) => set({ ordered: v })} />
                </Card>
              </>
            )}
          </View>
        </ScrollView>
        <View style={[shared.footer, { borderTopColor: c.border, backgroundColor: c.surface, flexDirection: 'row', gap: 8 }]}>
          <Button title={existing?.status === 'published' ? 'Save changes' : 'Save draft'} variant="outline" size="md" style={{ flex: 1 }} loading={busy === 'save'} onPress={() => save(false)} />
          {existing?.status !== 'published' && <Button title="Publish" iconLeft="rocket-outline" size="md" style={{ flex: 1.3 }} onPress={() => save(true)} />}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  area: { borderWidth: 1, borderRadius: 12, padding: 10, minHeight: 64, textAlignVertical: 'top', fontSize: 15 },
  mono: { fontFamily: 'monospace' },
  test: { borderWidth: 1, borderRadius: 14, padding: 10, gap: 8 },
  name: { flex: 1, fontWeight: '700', fontSize: 14, paddingVertical: 4 },
  table: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 4 },
  fail: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 3 },
});
