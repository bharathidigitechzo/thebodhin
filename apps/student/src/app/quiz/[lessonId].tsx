/**
 * Quiz / exam attempt. One question per screen, big option targets, Prev/Next in the thumb zone,
 * question grid + review in bottom sheets, timer auto-submits at zero.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, assessments } from '@/api/client';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout, radius } from '@/theme/tokens';
import { TwoTone, Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { BottomSheet, IconButton, Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { CodeQuestion } from '@/ui/CodeQuestion';

const LETTERS = ['A', 'B', 'C', 'D', 'E'];
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.max(0, s % 60)).padStart(2, '0')}`;

export default function QuizAttempt() {
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>();
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';

  const setup = useMemo(() => {
    try {
      return { ok: true as const, ...assessments.start(userId, lessonId) };
    } catch (e) {
      return { ok: false as const, error: (e as ApiError).message };
    }
  }, [userId, lessonId]);

  const [phase, setPhase] = useState<'intro' | 'running'>('intro');
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<(number | string)[]>([]);
  const [flags, setFlags] = useState<Set<number>>(new Set());
  const [hint, setHint] = useState(false);
  const [left, setLeft] = useState(0);
  const [sheet, setSheet] = useState<null | 'grid' | 'review' | 'leave'>(null);
  const [busy, setBusy] = useState(false);
  const startedAt = useRef(0);
  const submitted = useRef(false);

  const total = setup.ok ? setup.questions.length : 0;

  const isAnswered = (ans: number | string | undefined) => (typeof ans === 'number' ? ans >= 0 : typeof ans === 'string' ? ans.trim().length > 0 : false);

  const begin = () => {
    if (!setup.ok) return;
    setAnswers(Array(total).fill(-1));
    setLeft((setup.a.durationMin ?? 15) * 60);
    startedAt.current = Date.now();
    setPhase('running');
  };

  const submit = async () => {
    if (!setup.ok || submitted.current) return;
    submitted.current = true;
    setBusy(true);
    const t = await assessments.submit(userId, setup.a.id, answers, startedAt.current);
    router.replace({ pathname: '/result/[id]', params: { id: t.id } });
  };

  // timer
  useEffect(() => {
    if (phase !== 'running') return;
    const id = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [phase]);
  useEffect(() => {
    if (phase === 'running' && left <= 0) submit();
  }, [left]); // eslint-disable-line react-hooks/exhaustive-deps

  // Android back → confirm (avoid BackHandler error on Web)
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (phase === 'running') {
        setSheet('leave');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [phase]);

  useEffect(() => setHint(false), [i]);

  if (!setup.ok) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.ivory, padding: 20, gap: 16, justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ maxWidth: 480, width: '100%', gap: 16 }}>
          <Banner text={setup.error} />
          <Button title="Go back" variant="outline" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }
  const { a, course, questions, previous } = setup;

  /* ── intro ── */
  if (phase === 'intro') {
    const facts = [
      { icon: 'help-circle-outline' as const, label: 'Questions', value: `${total} questions` },
      { icon: 'time-outline' as const, label: 'Time limit', value: `${a.durationMin} minutes` },
      { icon: 'ribbon-outline' as const, label: 'Pass criteria', value: `${a.marks} marks (${a.passPct}%)` },
      { icon: 'refresh-outline' as const, label: 'Attempts', value: 'Unlimited retakes' },
    ];
    return (
      <View style={{ flex: 1, backgroundColor: c.ivory }}>
        <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={[styles.introModal, { backgroundColor: c.surface, borderColor: c.border }]}>
            {/* Top Bar inside modal */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: c.borderSoft }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={[styles.introIcon, { backgroundColor: a.kind === 'exam' ? '#F1ECFC' : '#EEF2FF', width: 42, height: 42, borderRadius: 12 }]}>
                  <Ionicons name={a.kind === 'exam' ? 'school' : 'help-circle'} size={22} color={a.kind === 'exam' ? '#7C3AED' : '#3B5BDB'} />
                </View>
                <Pill text={a.kind === 'exam' ? 'Course Examination' : 'Module Assessment'} tone={a.kind === 'exam' ? 'live' : 'info'} />
              </View>
              <IconButton icon="close" label="Close" tone="filled" onPress={() => router.back()} />
            </View>

            {/* Title & Course */}
            <View style={{ gap: 6, paddingTop: 14 }}>
              <Txt variant="heading" style={{ fontSize: 22, lineHeight: 28 }}>{a.title}</Txt>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="book-outline" size={15} color={c.muted} />
                <Txt variant="caption" color={c.inkSoft} style={{ fontWeight: '600' }}>
                  {course.title}{a.moduleTitle ? ` · ${a.moduleTitle}` : ''}
                </Txt>
              </View>
            </View>

            {/* 2x2 Grid of Assessment Facts */}
            <View style={styles.factGrid}>
              {facts.map((f) => (
                <View key={f.label} style={[styles.factTile, { backgroundColor: c.surfaceMuted, borderColor: c.borderSoft }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name={f.icon} size={18} color={c.primary} />
                    <Txt variant="caption" color={c.muted}>{f.label}</Txt>
                  </View>
                  <Txt variant="bodyStrong" style={{ fontSize: 14, marginTop: 4 }}>{f.value}</Txt>
                </View>
              ))}
            </View>

            {previous && (
              <Banner tone="info" text={`Last attempt: ${previous.scorePct}% (${previous.correct}/${previous.total}). Best score is kept.`} />
            )}

            {/* Instructions box */}
            <View style={[styles.infoBox, { backgroundColor: c.surfaceMuted, borderColor: c.borderSoft }]}>
              <Ionicons name="information-circle-outline" size={18} color={c.primary} />
              <Txt variant="caption" color={c.inkSoft} style={{ flex: 1, lineHeight: 18 }}>
                The timer begins automatically when you tap Start. Answers auto-submit when the countdown ends.
              </Txt>
            </View>

            {/* Action Buttons */}
            <View style={{ gap: 10, paddingTop: 6 }}>
              <Button
                title={previous ? 'Retake assessment' : a.kind === 'exam' ? 'Start exam' : 'Start quiz'}
                iconRight="arrow-forward"
                size="lg"
                onPress={begin}
              />
              {previous && (
                <Button
                  title="View last result"
                  variant="outline"
                  size="md"
                  onPress={() => router.replace({ pathname: '/result/[id]', params: { id: previous.id } })}
                />
              )}
            </View>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  /* ── running ── */
  const q = questions[i];
  const answered = answers.filter(isAnswered).length;
  const low = left <= 60;
  const choose = (k: number) => setAnswers((arr) => arr.map((v, j) => (j === i ? k : v)));

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <View style={[styles.center, { paddingHorizontal: 16, paddingTop: Platform.OS === 'web' ? 12 : 0 }]}>
          <View style={styles.head}>
            <IconButton icon="close" label="Leave quiz" tone="filled" onPress={() => setSheet('leave')} />
            <View style={{ flex: 1, minWidth: 0, paddingHorizontal: 8 }}>
              <Txt variant="bodyStrong" numberOfLines={1}>{a.title}</Txt>
              <Txt variant="caption" color={c.muted}>Question {i + 1} of {total}</Txt>
            </View>
            <View style={[styles.timer, { backgroundColor: low ? c.dangerBg : c.primaryDeep }]} accessibilityLabel={`Time left ${mmss(left)}`} accessibilityLiveRegion={low ? 'polite' : 'none'}>
              <Ionicons name="hourglass-outline" size={16} color={low ? c.danger : c.accent} />
              <Txt variant="bodyStrong" color={low ? c.danger : '#fff'} style={{ fontVariant: ['tabular-nums'] }}>{mmss(left)}</Txt>
            </View>
          </View>
          <View style={[styles.bar, { backgroundColor: c.border }]}>
            <View style={{ width: `${((i + 1) / total) * 100}%`, height: 6, borderRadius: 3, backgroundColor: c.primary }} />
          </View>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
          <View style={[styles.center, { gap: 16, paddingTop: 18 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Pill text={`Q${i + 1} of ${total}`} tone="info" />
              <Pill text={q.topic} />
              <Pill text={`${q.marks ?? 2} ${q.marks === 1 ? 'mark' : 'marks'}`} tone="gold" />
              <View style={{ flex: 1 }} />
              <Pressable
                onPress={() => setFlags((f) => { const n = new Set(f); n.has(i) ? n.delete(i) : n.add(i); return n; })}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityState={{ selected: flags.has(i) }}
                style={[
                  styles.flag,
                  {
                    borderColor: flags.has(i) ? c.accent : c.border,
                    backgroundColor: flags.has(i) ? c.accentSoft : c.surface,
                    cursor: 'pointer' as any,
                  },
                ]}
              >
                <Ionicons name={flags.has(i) ? 'bookmark' : 'bookmark-outline'} size={15} color={flags.has(i) ? c.warning : c.inkSoft} />
                <Txt variant="caption" style={{ fontWeight: '700' }}>{flags.has(i) ? 'Marked' : 'Mark for review'}</Txt>
              </Pressable>
            </View>

            <Txt variant="heading" style={{ fontSize: 21, lineHeight: 28 }} accessibilityRole="header">{q.text}</Txt>

            {q.kind === 'code' && q.code ? (
              <CodeQuestion key={q.id} spec={q.code} value={answers[i]} userId={userId} onChange={(val) => setAnswers((arr) => arr.map((v, j) => (j === i ? val : v)))} />
            ) : q.kind === 'fill_blank' ? (
              <View style={{ gap: 8, marginTop: 4 }}>
                <Txt variant="label" color={c.muted}>Type your answer in the blank below:</Txt>
                <TextInput
                  value={typeof answers[i] === 'string' ? (answers[i] as string) : ''}
                  onChangeText={(val) => setAnswers((arr) => arr.map((v, j) => (j === i ? val : v)))}
                  placeholder="Type your answer here..."
                  placeholderTextColor={c.muted}
                  style={[styles.input, { borderColor: isAnswered(answers[i]) ? c.primary : c.border, color: c.ink, backgroundColor: c.surface }]}
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel="Fill in the blank answer"
                />
              </View>
            ) : (
              <View style={{ gap: 10 }} accessibilityRole="radiogroup">
                {q.options.map((o, k) => {
                  const on = answers[i] === k;
                  return (
                    <Pressable
                      key={o}
                      onPress={() => choose(k)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on }}
                      style={({ pressed }) => [
                        styles.opt,
                        {
                          borderColor: on ? c.primary : c.border,
                          backgroundColor: on ? c.primarySoft : c.surface,
                          cursor: 'pointer' as any,
                        },
                        on && { borderWidth: 2 },
                        pressed && { opacity: 0.88 },
                      ]}
                    >
                      <View style={[styles.letter, { backgroundColor: on ? c.primary : c.surfaceMuted, borderColor: on ? c.primary : c.borderSoft }]}>
                        <Txt variant="label" color={on ? '#fff' : c.ink} style={{ fontWeight: '700' }}>{LETTERS[k]}</Txt>
                      </View>
                      <Txt style={{ flex: 1, fontSize: 16, lineHeight: 22 }} variant={on ? 'bodyStrong' : 'body'} color={on ? c.primaryDeep : c.ink}>
                        {o}
                      </Txt>
                      {on && <Ionicons name="checkmark-circle" size={24} color={c.primary} />}
                    </Pressable>
                  );
                })}
              </View>
            )}

            {q.hint && (
              hint ? (
                <View style={[styles.hint, { backgroundColor: c.accentSoft }]}>
                  <Ionicons name="bulb-outline" size={20} color={c.warning} />
                  <Txt variant="label" color={c.inkSoft} style={{ flex: 1, fontWeight: '500' }}>{q.hint}</Txt>
                </View>
              ) : (
                <Pressable onPress={() => setHint(true)} style={[styles.hintBtn, { cursor: 'pointer' as any }]} accessibilityRole="button" hitSlop={8}>
                  <Ionicons name="bulb-outline" size={18} color={c.warning} />
                  <Txt variant="label" color={c.warning}>Show hint</Txt>
                </Pressable>
              )
            )}
          </View>
        </ScrollView>

        {/* thumb / action bar */}
        <View style={[styles.foot, { backgroundColor: c.surface, borderTopColor: c.border }]}>
          <View style={[styles.center, { flexDirection: 'row', gap: 12, alignItems: 'center' }]}>
            <Pressable
              onPress={() => setSheet('grid')}
              style={[styles.round, { borderColor: c.border, backgroundColor: c.surfaceMuted, cursor: 'pointer' as any }]}
              accessibilityRole="button"
              accessibilityLabel={`All questions, ${answered} of ${total} answered`}
            >
              <Ionicons name="grid-outline" size={20} color={c.ink} />
              <Txt variant="caption" style={{ fontSize: 11, fontWeight: '700' }}>{answered}/{total}</Txt>
            </Pressable>
            <Pressable
              disabled={i === 0}
              onPress={() => setI((x) => x - 1)}
              style={[styles.round, { borderColor: c.border, opacity: i === 0 ? 0.35 : 1, cursor: i === 0 ? 'default' : 'pointer' as any }]}
              accessibilityRole="button"
              accessibilityLabel="Previous question"
            >
              <Ionicons name="chevron-back" size={22} color={c.ink} />
            </Pressable>
            {i < total - 1 ? (
              <Button
                title={isAnswered(answers[i]) ? 'Next Question' : 'Skip for now'}
                iconRight="arrow-forward"
                size="lg"
                style={{ flex: 1 }}
                onPress={() => setI((x) => x + 1)}
              />
            ) : (
              <Button
                title="Review & Submit"
                iconRight="send"
                size="lg"
                style={{ flex: 1 }}
                onPress={() => setSheet('review')}
              />
            )}
          </View>
        </View>
      </SafeAreaView>

      <BottomSheet open={sheet === 'grid'} onClose={() => setSheet(null)} title="All questions" footer={<Button title="Review & submit" style={{ flex: 1 }} onPress={() => setSheet('review')} />}>
        <View style={styles.grid}>
          {questions.map((_, k) => {
            const done = isAnswered(answers[k]);
            const cur = k === i;
            return (
              <Pressable key={k} onPress={() => { setI(k); setSheet(null); }} accessibilityRole="button" accessibilityLabel={`Question ${k + 1}${done ? ', answered' : ''}${flags.has(k) ? ', marked' : ''}`} style={[styles.cell, { borderColor: cur ? c.primary : done ? c.success : c.border, backgroundColor: done ? c.successBg : c.surface }, cur && { borderWidth: 2 }]}>
                <Txt variant="bodyStrong" color={done ? c.success : c.ink}>{k + 1}</Txt>
                {flags.has(k) && <Ionicons name="bookmark" size={12} color={c.warning} style={{ position: 'absolute', top: 3, right: 4 }} />}
              </Pressable>
            );
          })}
        </View>
        <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
          <Legend color={c.success} label="Answered" />
          <Legend color={c.borderStrong} label="Not answered" />
          <Legend color={c.warning} label="Marked" />
        </View>
      </BottomSheet>

      <BottomSheet
        open={sheet === 'review'}
        onClose={() => setSheet(null)}
        title="Submit your answers?"
        footer={
          <>
            <Button title="Keep going" variant="outline" size="md" style={{ flex: 1 }} onPress={() => setSheet(null)} />
            <Button title="Submit" size="md" loading={busy} style={{ flex: 1 }} onPress={submit} />
          </>
        }
      >
        <View style={[styles.card, { backgroundColor: c.surfaceMuted, borderColor: c.border }]}>
          <Row k="Answered" v={`${answered} of ${total}`} />
          <Row k="Not answered" v={String(total - answered)} warn={total - answered > 0} />
          <Row k="Marked for review" v={String(flags.size)} />
          <Row k="Time left" v={mmss(left)} />
        </View>
        {total - answered > 0 && <Txt variant="caption" color={c.warning}>Unanswered questions count as incorrect.</Txt>}
      </BottomSheet>

      <BottomSheet
        open={sheet === 'leave'}
        onClose={() => setSheet(null)}
        title="Leave this quiz?"
        footer={
          <>
            <Button title="Stay" variant="outline" size="md" style={{ flex: 1 }} onPress={() => setSheet(null)} />
            <Button title="Leave" size="md" style={{ flex: 1, backgroundColor: c.danger }} onPress={() => router.back()} />
          </>
        }
      >
        <Txt color={c.inkSoft}>Your answers will not be saved. You can start again any time.</Txt>
      </BottomSheet>
    </View>
  );
}

function Row({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Txt color={c.inkSoft}>{k}</Txt>
      <Txt variant="bodyStrong" color={warn ? c.warning : c.ink}>{v}</Txt>
    </View>
  );
}
function Legend({ color, label }: { color: string; label: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 12, height: 12, borderRadius: 4, borderWidth: 2, borderColor: color }} />
      <Txt variant="caption" color={c.inkSoft}>{label}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { width: '100%', maxWidth: 760, alignSelf: 'center' },
  introModal: { width: '100%', maxWidth: 580, borderRadius: 20, borderWidth: 1, padding: 24, gap: 16 },
  introIcon: { alignItems: 'center', justifyContent: 'center' },
  factGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  factTile: { flex: 1, minWidth: '45%', padding: 12, borderRadius: 14, borderWidth: 1 },
  infoBox: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  card: { padding: 16, borderRadius: radius.lg, borderWidth: 1, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  timer: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 40, borderRadius: radius.pill },
  bar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  flag: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 36, borderRadius: radius.pill, borderWidth: 1.2 },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14, minHeight: 64, borderRadius: radius.lg, borderWidth: 1.2 },
  input: { borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  letter: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  hint: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radius.md },
  hintBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 40 },
  foot: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 },
  round: { width: 50, height: 50, borderRadius: 25, borderWidth: 1.2, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: { width: 54, height: 54, borderRadius: radius.md, borderWidth: 1.4, alignItems: 'center', justifyContent: 'center' },
});
