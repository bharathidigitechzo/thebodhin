/** Assignment "Write code" answer: pick a language, write the program, try it with your own input. The tutor grades it. */
import React, { useState } from 'react';
import { TextInput, View } from 'react-native';
import { ApiError } from '@/api/client';
import { CODE_STACKS, runOnce, starterFor } from '@/playground/runTests';
import { stackOf } from '@/playground/stacks';
import type { RunResult } from '@/playground/types';
import { useTheme } from '@/theme/ThemeProvider';
import { CodeEditor } from './CodeEditor';
import { Txt } from './Txt';
import { Button } from './Button';
import { Chip } from './kit';
import { Banner } from './misc';

export type CodeDraft = { stack: string; code: string };
export const newCodeDraft = (): CodeDraft => ({ stack: 'python', code: starterFor('python') });

export function CodeAnswerBox({ value, onChange, userId, readOnly }: { value: CodeDraft; onChange: (v: CodeDraft) => void; userId: string; readOnly?: boolean }) {
  const { c } = useTheme();
  const stack = stackOf(value.stack);
  const [stdin, setStdin] = useState('');
  const [out, setOut] = useState<RunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      setOut(await runOnce(userId, value.stack, value.code, stdin));
    } catch (e) {
      setErr(e instanceof ApiError || e instanceof Error ? e.message : 'Could not run your code.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 10 }}>
      {!readOnly && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {CODE_STACKS.map((s) => (
            <Chip key={s.id} label={s.name} active={value.stack === s.id} onPress={() => onChange({ stack: s.id, code: value.code === starterFor(value.stack) || !value.code.trim() ? starterFor(s.id) : value.code })} />
          ))}
        </View>
      )}
      <CodeEditor value={value.code} onChange={(code) => onChange({ ...value, code })} readOnly={readOnly} lang={stack?.files[0]?.lang ?? 'plain'} label={`Your ${stack?.name ?? ''} code`} minHeight={240} />
      {!readOnly && (
        <>
          <TextInput value={stdin} onChangeText={setStdin} multiline placeholder="Input to try it with (optional)" placeholderTextColor={c.muted} autoCapitalize="none" autoCorrect={false} accessibilityLabel="Program input" style={{ borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 10, minHeight: 44, color: c.ink, fontFamily: 'monospace' }} />
          <Button title="Run" iconLeft="play" size="md" variant="outline" loading={busy} onPress={run} />
        </>
      )}
      {err && <Banner text={err} />}
      {out && (
        <View style={{ backgroundColor: '#1f2328', borderRadius: 12, padding: 12, gap: 4 }}>
          <Txt variant="caption" color="#9ca3af">Output{out.ms ? ` · ${out.ms} ms` : ''}</Txt>
          <Txt style={{ fontFamily: 'monospace', fontSize: 13 }} color={out.ok ? '#e6e6e6' : '#fca5a5'}>{(out.stdout + (out.stderr ? `\n${out.stderr}` : '')).trim() || '(no output)'}</Txt>
        </View>
      )}
    </View>
  );
}
