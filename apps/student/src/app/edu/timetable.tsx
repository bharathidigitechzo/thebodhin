/**
 * Educator timetable, two parts kept apart (Nov 16 change request):
 *  - Meetings: every live class and 1:1 the user hosts, week by week (clashes flagged; tap to manage).
 *  - Reminders: the educator's own teaching tasks (course updates, quizzes, assignment deadlines …) — add, edit, tick off.
 * Creating a course, quiz or assignment is never shown as a meeting.
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, liveAdmin } from '@/api/client';
import { mentorship, reminders as remindersApi } from '@/api/academy';
import { REMINDER_KINDS, type Reminder, type ReminderKind } from '@/core/academy';
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { TextField } from '@/ui/TextField';
import { BottomSheet, Chip, Pill } from '@/ui/kit';
import { PillTabs } from '@/ui/pickers';
import { DateTimeField, when } from '@/ui/grow';
import { haptic } from '@/ui/haptics';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout } from '@/theme/tokens';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { IconButton } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { WeekTimetable } from '@/ui/WeekTimetable';

export default function Timetable() {
  const { c } = useTheme();
  const userId = useAuth().session?.user.id ?? '';
  const [wk, setWk] = useState(0);
  const [rev, setRev] = useState(0);
  useFocusEffect(React.useCallback(() => setRev((x) => x + 1), []));
  const data = useMemo(() => liveAdmin.week(userId, wk), [userId, wk, rev]);
  const items = data.days.flatMap((d) => d.items).map((s) => ({ id: s.id, title: s.title, sub: [s.batchName, s.instructor].filter(Boolean).join(' · '), startsAt: s.startsAt, endsAt: s.endsAt, mode: s.mode, clash: s.clash, state: s.state === 'cancelled' ? undefined : s.state }))
    .concat(mentorship.sessionsFor(userId).map((m) => ({ id: m.id, title: m.title, sub: m.sub, startsAt: m.startsAt, endsAt: m.endsAt, mode: 'online' as const, clash: false, state: undefined })));
  const [tab, setTab] = useState<'meetings' | 'reminders'>('meetings');
  const rem = useMemo(() => { try { return remindersApi.list(userId); } catch { return null; } }, [userId, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const [form, setForm] = useState<{ id?: string; kind: ReminderKind; title: string; note: string; dueAt: string; courseId?: string } | null>(null);
  const [fe, setFe] = useState<{ field?: string; msg: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const openNew = () => { const d = new Date(Date.now() + 864e5); d.setHours(9, 0, 0, 0); setFe(null); setForm({ kind: 'course_update', title: '', note: '', dueAt: d.toISOString() }); };
  const save = async () => {
    if (!form) return;
    try {
      if (form.id) await remindersApi.update(userId, form.id, { kind: form.kind, title: form.title, note: form.note, dueAt: form.dueAt, courseId: form.courseId });
      else await remindersApi.add(userId, form);
      haptic('success'); setMsg(form.id ? 'Reminder updated.' : 'Reminder added.'); setForm(null); setRev((x) => x + 1);
    } catch (e) { haptic('error'); setFe(e instanceof ApiError ? { field: e.field, msg: e.message } : { msg: 'Something went wrong.' }); }
  };
  const toggle = async (r: Reminder) => { await remindersApi.update(userId, r.id, { done: !r.done }); haptic(r.done ? 'toggleOff' : 'toggle'); setRev((x) => x + 1); };
  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <View style={styles.top}>
          <IconButton icon="arrow-back" label="Back" tone="filled" onPress={() => (router.canGoBack() ? router.back() : router.replace('/educator/live'))} />
          <Txt variant="heading" style={{ flex: 1 }}>Timetable</Txt>
          {tab === 'meetings' ? <Button title="Schedule" iconLeft="add" size="md" onPress={() => router.push('/edu/schedule')} /> : <Button title="Reminder" iconLeft="add" size="md" onPress={openNew} />}
        </View>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.inner}>
            <PillTabs<'meetings' | 'reminders'> value={tab} onChange={setTab} tabs={[{ id: 'meetings', label: `Meetings · ${data.total}`, icon: 'videocam-outline' }, { id: 'reminders', label: `Reminders${rem ? ` · ${rem.overdue.length + rem.today.length + rem.upcoming.length}` : ''}`, icon: 'alarm-outline' }]} />
            {msg && tab === 'reminders' && <Banner tone="success" text={msg} />}
            {tab === 'reminders' && rem && (
              <>
                {([['overdue', 'Overdue', rem.overdue], ['today', 'Today', rem.today], ['upcoming', 'Coming up', rem.upcoming], ['done', 'Done', rem.done]] as const).map(([k, label, list]) => list.length > 0 && (
                  <View key={k} style={{ gap: 8 }}>
                    <Txt variant="label" color={k === 'overdue' ? c.danger : c.muted}>{label.toUpperCase()}</Txt>
                    {list.map((r) => {
                      const kind = REMINDER_KINDS.find((x) => x.id === r.kind)!;
                      return (
                        <View key={r.id} style={[styles.rem, { backgroundColor: c.surface, borderColor: k === 'overdue' ? c.danger : c.border }]}>
                          <Pressable onPress={() => toggle(r)} accessibilityRole="checkbox" accessibilityState={{ checked: r.done }} accessibilityLabel={`Done: ${r.title}`} hitSlop={8} style={{ minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name={r.done ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={r.done ? c.success : c.muted} />
                          </Pressable>
                          <Pressable style={{ flex: 1, minWidth: 0 }} onPress={() => { setFe(null); setForm({ id: r.id, kind: r.kind, title: r.title, note: r.note ?? '', dueAt: r.dueAt, courseId: r.courseId }); }} accessibilityRole="button" accessibilityLabel={`Edit ${r.title}`}>
                            <Txt variant="bodyStrong" numberOfLines={2} style={r.done ? { textDecorationLine: 'line-through', color: c.muted } : undefined}>{r.title}</Txt>
                            <Txt variant="caption" color={k === 'overdue' ? c.danger : c.muted} numberOfLines={1}>{kind.label} · {when(r.dueAt)}{r.courseId ? ` · ${rem.courses.find((x) => x.id === r.courseId)?.title ?? ''}` : ''}</Txt>
                          </Pressable>
                          <Ionicons name={kind.icon as keyof typeof Ionicons.glyphMap} size={20} color={c.primary} />
                        </View>
                      );
                    })}
                  </View>
                ))}
                {rem.overdue.length + rem.today.length + rem.upcoming.length + rem.done.length === 0 && (
                  <View style={{ alignItems: 'center', gap: 8, paddingVertical: 24 }}>
                    <Ionicons name="alarm-outline" size={36} color={c.muted} />
                    <Txt variant="bodyStrong">No reminders yet</Txt>
                    <Txt color={c.muted} center>Add reminders for course updates, quizzes to create, assignment deadlines and other teaching tasks. You get a notification a day before.</Txt>
                    <Button title="Add a reminder" iconLeft="add" size="md" onPress={openNew} />
                  </View>
                )}
              </>
            )}
            {tab === 'meetings' && <>
            {data.clashes > 0 && <Banner tone="danger" text={`${data.clashes} class${data.clashes === 1 ? '' : 'es'} this week overlap another class of the same instructor. Open the class and change its time.`} />}
            <WeekTimetable
              items={items}
              offset={wk}
              onOffset={setWk}
              empty="No classes this day. Tap Schedule to add one."
              onPress={(it) => {
                const s = data.days.flatMap((d) => d.items).find((x) => x.id === it.id);
                if (!s) return router.push('/edu/mentorship');
                if (s?.batchId) router.push({ pathname: '/edu/batch/[id]', params: { id: s.batchId, tab: 'schedule' } });
                else router.push({ pathname: '/edu/prejoin/[id]', params: { id: it.id } });
              }}
            />
            <Txt variant="caption" color={c.muted}>Live classes and 1:1 sessions only. Times are shown in your phone’s time zone. Students see the same timetable in their Live tab.</Txt>
            </>}
          </View>
        </ScrollView>
      </SafeAreaView>
      <BottomSheet open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Edit reminder' : 'New reminder'} footer={<>
        {form?.id && <Button title="Delete" size="md" variant="outline" style={{ flex: 1 }} onPress={async () => { await remindersApi.remove(userId, form.id!); setForm(null); setMsg('Reminder deleted.'); setRev((x) => x + 1); }} />}
        <Button title={form?.id ? 'Save' : 'Add reminder'} size="md" style={{ flex: 1 }} onPress={save} />
      </>}>
        {form && (
          <View style={{ gap: 10 }}>
            <Txt variant="label">Type</Txt>
            <View style={styles.chips}>{REMINDER_KINDS.map((k) => <Chip key={k.id} label={k.label} icon={k.icon as never} active={form.kind === k.id} onPress={() => setForm({ ...form, kind: k.id })} />)}</View>
            <TextField label="What to do" placeholder="e.g. Upload module 4 videos" value={form.title} onChangeText={(v) => setForm({ ...form, title: v.slice(0, 80) })} error={fe?.field === 'title' ? fe.msg : undefined} />
            <DateTimeField label="Remind me on" value={form.dueAt} onChange={(v) => setForm({ ...form, dueAt: v })} error={fe?.field === 'dueAt' ? fe.msg : undefined} />
            {rem && rem.courses.length > 0 && (
              <>
                <Txt variant="label">Course (optional)</Txt>
                <View style={styles.chips}>
                  <Chip label="None" active={!form.courseId} onPress={() => setForm({ ...form, courseId: undefined })} />
                  {rem.courses.map((x) => <Chip key={x.id} label={x.title.slice(0, 24)} active={form.courseId === x.id} onPress={() => setForm({ ...form, courseId: x.id })} />)}
                </View>
              </>
            )}
            <TextField label="Note (optional)" value={form.note} onChangeText={(v) => setForm({ ...form, note: v.slice(0, 300) })} multiline />
            {fe && !fe.field && <Banner text={fe.msg} />}
          </View>
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { alignSelf: 'center', width: '100%', maxWidth: 752, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  scroll: { alignItems: 'center', paddingHorizontal: 16, paddingBottom: 32 },
  inner: { width: '100%', maxWidth: layout.contentMaxWidth, gap: 14 },
  rem: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 8, minHeight: 56 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
