/** Coding question (quiz / exam): write a program, run it against the tutor's tests, marks follow the tests passed. */
import React, { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ApiError } from '@/api/client';
import { decodeCodeAnswer, encodeCodeAnswer, type CodeSpec } from '@/core/assess';
import { runCodeTests } from '@/playground/runTests';
import type { TestResult } from '@/playground/checks';
import { stackOf } from '@/playground/stacks';
import { useTheme } from '@/theme/ThemeProvider';
import { CodeEditor } from './CodeEditor';
import { Txt } from './Txt';
import { Button } from './Button';
import { Pill } from './kit';
import { Banner } from './misc';

export function CodeQuestion({ spec, value, onChange, userId }: { spec: CodeSpec; value: number | string | undefined; onChange: (v: string) => void; userId: string }) {
  const { c } = useTheme();
  const stack = stackOf(spec.stack);
  const ans = decodeCodeAnswer(value) ?? { code: spec.starter, passed: 0, total: spec.tests.length, ran: false };
  const [results, setResults] = useState<TestResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const edit = (code: string) => {
    setResults(null);
    onChange(encodeCodeAnswer({ code, passed: 0, total: spec.tests.length, ran: false }));
  };
  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      const rs = await runCodeTests(userId, spec, ans.code);
      setResults(rs);
      onChange(encodeCodeAnswer({ code: ans.code, passed: rs.filter((r) => r.pass).length, total: spec.tests.length, ran: true }));
    } catch (e) {
      setErr(e instanceof ApiError || e instanceof Error ? e.message : 'Could not run your code.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <Pill text={stack?.name ?? spec.stack} icon="code-slash" tone="info" />
        <Pill text={`${spec.tests.length} test${spec.tests.length === 1 ? '' : 's'}`} />
        {ans.ran && <Pill text={`${ans.passed}/${ans.total} passed`} tone={ans.passed === ans.total ? 'success' : 'warning'} />}
      </View>
      <CodeEditor value={ans.code} onChange={edit} lang={stack?.files[0]?.lang ?? 'plain'} label="Your code" minHeight={220} />
      <Txt variant="caption" color={c.muted}>Read input and print the answer. Run the tests before you submit — your marks come from the tests that pass on your last run.</Txt>
      <Button title={ans.ran ? 'Run tests again' : 'Run tests'} iconLeft="play" size="md" variant="outline" loading={busy} onPress={run} />
      {err && <Banner text={err} />}
      {results && (
        <View style={{ gap: 6 }}>
          {results.map((r, k) => {
            const hidden = spec.tests[k]?.hidden;
            return (
              <View key={k} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 10, borderRadius: 12, borderWidth: 1, borderColor: r.pass ? c.success : c.border, backgroundColor: c.surface }}>
                <Ionicons name={r.pass ? 'checkmark-circle' : 'close-circle'} size={20} color={r.pass ? c.success : c.danger} />
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Txt variant="label">{r.name}</Txt>
                  {!r.pass && !hidden && (r.error ? <Txt variant="caption" color={c.danger}>{r.error}</Txt> : <Txt variant="caption" color={c.inkSoft}>Expected “{r.expected}” · got “{r.got || '(nothing)'}”</Txt>)}
                  {!r.pass && hidden && <Txt variant="caption" color={c.muted}>A hidden test failed. Check edge cases.</Txt>}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
