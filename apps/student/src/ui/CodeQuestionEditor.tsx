/** Tutor side of a coding question: language, starter code and input → expected-output test cases. */
import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MAX_CODE_TESTS, type CodeSpec } from '@/core/assess';
import { CODE_STACKS, starterFor } from '@/playground/runTests';
import { browserCapable } from '@/playground/runners';
import { stackOf } from '@/playground/stacks';
import { useTheme } from '@/theme/ThemeProvider';
import { CodeEditor } from './CodeEditor';
import { Txt } from './Txt';
import { Button } from './Button';
import { Chip } from './kit';
import { Checkbox } from './misc';

export const newCodeSpec = (stack = 'python'): CodeSpec => ({ stack, starter: starterFor(stack), tests: [{ stdin: '', expect: '' }] });

export function CodeQuestionEditor({ spec, onChange }: { spec: CodeSpec; onChange: (s: CodeSpec) => void }) {
  const { c } = useTheme();
  const stack = stackOf(spec.stack);
  const setTest = (i: number, patch: Partial<CodeSpec['tests'][number]>) => onChange({ ...spec, tests: spec.tests.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const field = [styles.input, { borderColor: c.border, color: c.ink }];

  return (
    <View style={{ gap: 12 }}>
      <Txt variant="label">Language</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {CODE_STACKS.map((s) => (
          <Chip
            key={s.id}
            label={s.name}
            active={spec.stack === s.id}
            // Switching language swaps in that language's starter only if the tutor hasn't written their own yet.
            onPress={() => onChange({ ...spec, stack: s.id, starter: spec.starter === starterFor(spec.stack) || !spec.starter.trim() ? starterFor(s.id) : spec.starter })}
          />
        ))}
      </View>
      {stack && !browserCapable(stack) && (
        <Txt variant="caption" color={c.muted}>{stack.name} runs on Bodhin’s code server. In the browser, Python, JavaScript and TypeScript run instantly on the learner’s device.</Txt>
      )}

      <Txt variant="label">Starter code (what learners see first)</Txt>
      <CodeEditor value={spec.starter} onChange={(v) => onChange({ ...spec, starter: v })} lang={stack?.files[0]?.lang ?? 'plain'} label="Starter code" minHeight={140} />

      <Txt variant="label">Test cases</Txt>
      <Txt variant="caption" color={c.muted}>The learner’s program gets the input and must print exactly the expected output (trailing spaces are ignored). Marks are shared across the tests that pass.</Txt>
      {spec.tests.map((t, i) => (
        <View key={i} style={[styles.test, { borderColor: c.border, backgroundColor: c.surface }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Txt variant="label" style={{ flex: 1 }}>Test {i + 1}</Txt>
            {spec.tests.length > 1 && (
              <Pressable onPress={() => onChange({ ...spec, tests: spec.tests.filter((_, j) => j !== i) })} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove test ${i + 1}`}>
                <Ionicons name="trash-outline" size={18} color={c.danger} />
              </Pressable>
            )}
          </View>
          <TextInput value={t.stdin} onChangeText={(v) => setTest(i, { stdin: v })} multiline placeholder="Input (optional), e.g. 2 3" placeholderTextColor={c.muted} style={[...field, styles.mono]} accessibilityLabel={`Test ${i + 1} input`} autoCapitalize="none" autoCorrect={false} />
          <TextInput value={t.expect} onChangeText={(v) => setTest(i, { expect: v })} multiline placeholder="Expected output, e.g. 5" placeholderTextColor={c.muted} style={[...field, styles.mono]} accessibilityLabel={`Test ${i + 1} expected output`} autoCapitalize="none" autoCorrect={false} />
          <Checkbox checked={!!t.hidden} onChange={(v) => setTest(i, { hidden: v })} label="Hidden test">
            <Txt variant="caption" color={c.inkSoft}>Hidden — learners see only pass / fail, not the input or output</Txt>
          </Checkbox>
        </View>
      ))}
      {spec.tests.length < MAX_CODE_TESTS && (
        <Button title="Add test case" iconLeft="add" size="md" variant="outline" onPress={() => onChange({ ...spec, tests: [...spec.tests, { stdin: '', expect: '' }] })} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, minHeight: 44 },
  mono: { fontFamily: 'monospace' },
  test: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 },
});
