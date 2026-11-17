/**
 * Students by course (educator, tutor, and the Bodhin team for Bodhin courses). Only courses this person manages,
 * so each role sees only its own students. Per student: name, email, purchase status, progress, quiz and assignment status.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { studentsApi } from '@/api/academy';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { TextField } from '@/ui/TextField';
import { Chip, Pill, ProgressBar } from '@/ui/kit';
import { Page, useDataAsync } from '@/ui/grow';
import { Card, shared } from '@/ui/section';

export default function StudentsByCourse() {
  const { c } = useTheme();
  const { d, err } = useDataAsync(studentsApi.byCourse);
  const [q, setQ] = useState('');
  const [courseId, setCourseId] = useState<string | 'all'>('all');
  const [open, setOpen] = useState<string | null>(null);
  const admin = d?.ctx.tenant.id === 't_bodhin';
  const list = useMemo(() => (d?.courses ?? []).filter((x) => courseId === 'all' || x.course.id === courseId).map((x) => ({ ...x, students: x.students.filter((s) => !q.trim() || `${s.name} ${s.email}`.toLowerCase().includes(q.trim().toLowerCase())) })), [d, q, courseId]);
  const total = d?.courses.reduce((n, x) => n + x.students.length, 0) ?? 0;

  return (
    <Page title="Students" sub={`${total} enrolled across ${d?.courses.length ?? 0} course${d?.courses.length === 1 ? '' : 's'}`} err={err} fallback={admin ? '/admin/more' : '/educator/more'} wide>
      {d && (
        <>
          <TextField label="Search students" placeholder="Name or email" value={q} onChangeText={setQ} />
          <View style={shared.chips}>
            <Chip label="All courses" active={courseId === 'all'} onPress={() => setCourseId('all')} />
            {d.courses.map((x) => <Chip key={x.course.id} label={`${x.course.title.slice(0, 22)} · ${x.students.length}`} active={courseId === x.course.id} onPress={() => setCourseId(x.course.id)} />)}
          </View>
          {d.courses.length === 0 && <Card><Txt color={c.muted} center>No courses yet. Students appear here under each course as soon as they enrol.</Txt></Card>}
          {list.map(({ course, students, avgProgress }) => (
            <Card key={course.id} title={course.title} right={<Pill text={`${students.length} · avg ${avgProgress}%`} tone="info" />}>
              {students.length === 0 && <Txt color={c.muted}>{q ? 'No match.' : 'No students enrolled yet.'}</Txt>}
              {students.map((s) => {
                const k = `${course.id}:${s.userId}`;
                const on = open === k;
                return (
                  <View key={k} style={{ borderTopWidth: 1, borderTopColor: c.border, paddingVertical: 8, gap: 6 }}>
                    <Pressable onPress={() => setOpen(on ? null : k)} accessibilityRole="button" accessibilityState={{ expanded: on }} accessibilityLabel={`${s.name}, ${s.progressPct}% done`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Txt variant="bodyStrong" numberOfLines={1}>{s.name}</Txt>
                        <Txt variant="caption" color={c.muted} numberOfLines={1}>{s.email}</Txt>
                      </View>
                      <Pill text={s.purchase} tone={s.purchase === 'Paid' ? 'success' : s.purchase === 'Refunded' || s.purchase === 'Access expired' ? 'warning' : 'neutral'} />
                      <Ionicons name={on ? 'chevron-up' : 'chevron-down'} size={18} color={c.muted} />
                    </Pressable>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ flex: 1 }}><ProgressBar pct={s.progressPct} /></View>
                      <Txt variant="caption" color={c.inkSoft} style={{ width: 40, textAlign: 'right' }}>{s.progressPct}%</Txt>
                    </View>
                    {on && (
                      <View style={shared.row}>
                        <Pill icon="help-circle" text={s.quiz.total ? `Quizzes ${s.quiz.passed}/${s.quiz.total} passed${s.quiz.attempted > s.quiz.passed ? ` · ${s.quiz.attempted - s.quiz.passed} to retry` : ''}` : 'No quizzes'} tone={s.quiz.total && s.quiz.passed === s.quiz.total ? 'success' : 'neutral'} />
                        <Pill icon="document-text" text={s.assignment.total ? `Assignments ${s.assignment.submitted}/${s.assignment.total} submitted · ${s.assignment.graded} graded` : 'No assignments'} tone={s.assignment.total && s.assignment.submitted === s.assignment.total ? 'success' : 'neutral'} />
                        {s.certificate && <Pill icon="ribbon" text={`Certificate: ${s.certificate}`} tone={s.certificate === 'Issued' ? 'gold' : 'warning'} />}
                        {s.amountInr > 0 && <Pill text={`₹${s.amountInr.toLocaleString('en-IN')}`} />}
                        {s.lastActiveAt && <Txt variant="caption" color={c.muted}>Last active {new Date(s.lastActiveAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Txt>}
                      </View>
                    )}
                  </View>
                );
              })}
            </Card>
          ))}
        </>
      )}
    </Page>
  );
}
