/** Quizzes, exams and assignments of the courses a learner bought (My Learning → Assessments, and the Quizzes / Assignments sections). */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { assessments } from '@/api/client';
import type { AssessStatus } from '@/core/assess';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { Txt } from './Txt';
import { Button } from './Button';
import { Chip, ErrorState, Pill, Skeleton } from './kit';

type Kind = 'all' | 'quiz' | 'exam' | 'assignment';
type AsData = Awaited<ReturnType<typeof assessments.list>>;
const STATUS: Record<AssessStatus, { label: string; tone: 'warning' | 'info' | 'success' | 'neutral' | 'live' }> = {
  pending: { label: 'Pending', tone: 'warning' },
  in_progress: { label: 'Draft saved', tone: 'info' },
  overdue: { label: 'Overdue', tone: 'live' },
  scheduled: { label: 'Scheduled', tone: 'info' },
  submitted: { label: 'Submitted', tone: 'success' },
  graded: { label: 'Graded', tone: 'success' },
  completed: { label: 'Completed', tone: 'success' },
};

export function Assessments({ data, error, reload, only }: { data: AsData | null; error: string | null; reload: () => void; only?: 'quiz' | 'assignment' }) {
  const { c } = useTheme();
  const [kind, setKind] = useState<Kind>('all');
  const scoped = useMemo(() => (data?.rows ?? []).filter((r) => !only || (only === 'quiz' ? r.a.kind !== 'assignment' : r.a.kind === 'assignment')), [data, only]);
  const rows = useMemo(() => scoped.filter((r) => kind === 'all' || r.a.kind === kind), [scoped, kind]);
  if (error) return <ErrorState text={error} onRetry={reload} />;
  if (!data) return <View style={{ gap: 12, marginTop: 14 }}><Skeleton h={80} r={18} /><Skeleton h={100} r={18} /></View>;

  const scores = scoped.map((r) => r.best?.scorePct ?? r.sub?.grade?.pct).filter((x): x is number => x != null);
  const st = only ? { total: scoped.length, done: scoped.filter((r) => ['completed', 'graded', 'submitted'].includes(r.status)).length, pending: scoped.filter((r) => ['pending', 'in_progress', 'overdue'].includes(r.status)).length, avg: scores.length ? Math.round(scores.reduce((x, y) => x + y, 0) / scores.length) : 0 } : data.stats;
  const stats = [
    ['clipboard-outline', st.total, 'Total', c.primary],
    ['checkmark-circle-outline', st.done, 'Done', c.success],
    ['trophy-outline', `${st.avg}%`, 'Avg score', c.accent],
    ['time-outline', st.pending, 'Pending', c.danger],
  ] as const;

  const open = (r: AsData['rows'][number]) => {
    if (r.a.kind === 'assignment') return router.push({ pathname: '/assignment/[id]', params: { id: r.a.id } });
    if (r.status === 'completed' && r.best) return router.push({ pathname: '/result/[id]', params: { id: r.best.id } });
    router.push({ pathname: '/quiz/[lessonId]', params: { lessonId: r.a.id } });
  };

  return (
    <View style={{ gap: 12, marginTop: 14 }}>
      <View style={[styles.stats, { backgroundColor: c.surface, borderColor: c.border }]}>
        {stats.map(([icon, v, l, col]) => (
          <View key={l} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
            <Ionicons name={icon} size={22} color={col} />
            <Txt variant="heading">{v}</Txt>
            <Txt variant="caption" color={c.muted}>{l}</Txt>
          </View>
        ))}
      </View>
      {only !== 'assignment' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0 }}>
          {(only === 'quiz' ? ([['all', 'All'], ['quiz', 'Quizzes'], ['exam', 'Exams']] as const) : ([['all', 'All'], ['quiz', 'Quizzes'], ['exam', 'Exams'], ['assignment', 'Assignments']] as const)).map(([k, l]) => (
            <Chip key={k} label={l} active={kind === k} onPress={() => setKind(k)} />
          ))}
        </ScrollView>
      )}
      {rows.length === 0 && (
        <View style={{ alignItems: 'center', gap: 8, paddingVertical: 24 }}>
          <Ionicons name={only === 'assignment' ? 'document-text-outline' : 'help-circle-outline'} size={36} color={c.muted} />
          <Txt variant="bodyStrong">{only === 'assignment' ? 'No assignments yet' : only === 'quiz' ? 'No quizzes yet' : 'Nothing here yet'}</Txt>
          <Txt color={c.muted} center>When your tutor assigns one to a course you bought, it shows up here automatically.</Txt>
          {!data.rows.length && <Button title="Explore courses" size="md" variant="outline" onPress={() => router.navigate('/explore')} />}
        </View>
      )}
      {rows.map((r) => {
        const st = STATUS[r.status];
        const icon = r.a.kind === 'quiz' ? 'help-circle' : r.a.kind === 'exam' ? 'school' : 'document-text';
        const tint = r.a.kind === 'quiz' ? ['#EEF2FF', '#3B5BDB'] : r.a.kind === 'exam' ? ['#F1ECFC', '#7C3AED'] : [c.warningBg, c.warning];
        const meta =
          r.a.kind === 'assignment'
            ? r.status === 'graded' ? `Score ${r.sub?.grade?.pct}%` : r.a.dueAt ? `Due ${new Date(r.a.dueAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : ''
            : r.status === 'scheduled' ? `Opens ${new Date(r.a.opensAt!).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : `${r.a.questionIds?.length} questions · ${r.a.durationMin} min${r.best ? ` · Best ${r.best.scorePct}%` : ''}`;
        const cta = { pending: r.a.kind === 'assignment' ? 'Submit' : r.a.kind === 'exam' ? 'Start exam' : 'Start quiz', in_progress: 'Continue', overdue: 'Submit late', scheduled: 'View', submitted: 'View', graded: 'Feedback', completed: 'Result' }[r.status];
        return (
          <Pressable key={r.a.id} onPress={() => open(r)} style={({ pressed }) => [styles.as, { backgroundColor: c.surface, borderColor: r.status === 'overdue' ? c.danger : c.border }, pressed && { opacity: 0.92 }]} accessibilityRole="button" accessibilityLabel={`${r.a.title}, ${st.label}`}>
            <View style={[styles.asIcon, { backgroundColor: tint[0] }]}>
              <Ionicons name={icon} size={24} color={tint[1]} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <Pill text={st.label} tone={st.tone} />
              <Txt variant="bodyStrong" numberOfLines={2}>{r.a.title}</Txt>
              <Txt variant="caption" color={c.muted} numberOfLines={1}>{r.course.title}</Txt>
              <Txt variant="caption" color={r.status === 'overdue' ? c.danger : c.inkSoft} numberOfLines={1} style={{ fontWeight: '600' }}>{meta}</Txt>
            </View>
            <View style={[styles.cta, { backgroundColor: ['pending', 'in_progress', 'overdue'].includes(r.status) ? c.primary : c.surfaceMuted }]}>
              <Txt variant="caption" color={['pending', 'in_progress', 'overdue'].includes(r.status) ? '#fff' : c.primary} style={{ fontWeight: '700' }}>{cta}</Txt>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', paddingVertical: 14, borderRadius: radius.lg, borderWidth: 1 },
  as: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.lg, borderWidth: 1.2 },
  asIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cta: { paddingHorizontal: 12, minHeight: 36, borderRadius: radius.pill, justifyContent: 'center' },
});
