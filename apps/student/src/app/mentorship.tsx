/**
 * Learner: book a 1:1 mentorship with a tutor of a course you bought (or the Bodhin team for Bodhin courses).
 * The tutor is notified; their reply (confirmed time, or a reason) comes back as a notification and shows here.
 */
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { mentorship } from '@/api/academy';
import { MENTOR_DURATIONS } from '@/core/academy';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { BottomSheet, Chip, Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { DateTimeField, Page, useAct, useDataAsync, when } from '@/ui/grow';
import { Card, shared } from '@/ui/section';

const tomorrow10 = () => { const d = new Date(Date.now() + 864e5); d.setHours(10, 0, 0, 0); return d.toISOString(); };
const TONE: Record<string, 'warning' | 'success' | 'live' | 'neutral' | 'info'> = { 'Waiting for reply': 'warning', Confirmed: 'success', 'Live now': 'live', Done: 'info', 'Not accepted': 'neutral', Cancelled: 'neutral' };

export default function MyMentorship() {
  const { c } = useTheme();
  const { course: courseParam } = useLocalSearchParams<{ course?: string }>();
  const { d, err, load, userId } = useDataAsync(mentorship.mine);
  const a = useAct();
  const [form, setForm] = useState<{ courseId: string; mentorUserId: string | null; topic: string; preferredAt: string; durationMin: number } | null>(null);
  const [cancel, setCancel] = useState<string | null>(null);
  const startFor = (courseId: string) => {
    const row = d?.courses.find((x) => x.course.id === courseId);
    setForm({ courseId, mentorUserId: row?.mentors[0]?.userId ?? null, topic: '', preferredAt: tomorrow10(), durationMin: 30 });
    a.setFe(null);
  };
  const row = useMemo(() => d?.courses.find((x) => x.course.id === form?.courseId), [d, form?.courseId]);
  React.useEffect(() => { if (courseParam && d && !form) startFor(courseParam); }, [courseParam, d]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Page title="1:1 mentorship" sub="Book time with your tutor" err={err} fallback="/live" footer={d && d.courses.length > 0 && <Button title="Book a 1:1" iconLeft="add" size="md" style={{ flex: 1 }} onPress={() => startFor(d.courses[0].course.id)} />}>
      {d && (
        <>
          {a.msg && <Banner tone="success" text={a.msg} />}
          {a.general && !form && <Banner text={a.general} />}
          {d.courses.length === 0 && (
            <Card>
              <View style={{ alignItems: 'center', gap: 8, paddingVertical: 12 }}>
                <Ionicons name="person-circle-outline" size={36} color={c.primary} />
                <Txt variant="bodyStrong">Buy a course to book a 1:1</Txt>
                <Txt color={c.muted} center>Mentorship is for courses you have bought. Your tutor confirms a time or suggests another.</Txt>
                <Button title="Explore courses" size="md" onPress={() => router.navigate('/explore')} />
              </View>
            </Card>
          )}
          {d.requests.length > 0 && <Txt variant="label" color={c.muted}>YOUR REQUESTS</Txt>}
          {d.requests.map(({ r, course, mentor, label }) => (
            <Card key={r.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name={label === 'Live now' ? 'videocam' : 'person-circle-outline'} size={26} color={label === 'Live now' ? c.danger : c.primary} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt variant="bodyStrong" numberOfLines={1}>{mentor}</Txt>
                  <Txt variant="caption" color={c.muted} numberOfLines={1}>{course.title}</Txt>
                </View>
                <Pill text={label} tone={TONE[label] ?? 'neutral'} />
              </View>
              <Txt color={c.inkSoft} numberOfLines={3}>“{r.topic}”</Txt>
              <Txt variant="caption" color={c.muted}>{r.status === 'accepted' ? `Confirmed: ${when(r.startsAt!)} · ${r.durationMin} min` : `You asked for ${when(r.preferredAt)} · ${r.durationMin} min`}</Txt>
              {r.note ? <Banner tone={r.status === 'rejected' ? 'info' : 'success'} text={`${r.status === 'rejected' ? 'Reason' : 'Note'}: ${r.note}`} /> : null}
              {(label === 'Live now' || label === 'Confirmed' || label === 'Waiting for reply') && (
                <View style={shared.row}>
                  {label !== 'Waiting for reply' && <Button title="Join" iconLeft="enter-outline" size="md" style={{ flex: 1 }} disabled={label !== 'Live now'} onPress={() => router.push({ pathname: '/mentor-room/[id]', params: { id: r.id } })} />}
                  <Button title="Cancel" size="md" variant="outline" style={{ flex: 1 }} onPress={() => setCancel(r.id)} />
                </View>
              )}
              {label === 'Not accepted' && <Button title="Ask again" size="md" variant="outline" onPress={() => startFor(r.courseId)} />}
            </Card>
          ))}
          {d.courses.length > 0 && d.requests.length === 0 && <Card><Txt color={c.muted} center>No requests yet. Tap “Book a 1:1”, pick your course and tutor, a time and what you need help with.</Txt></Card>}
        </>
      )}

      <BottomSheet open={!!form} onClose={() => setForm(null)} title="Book a 1:1" footer={<Button title="Send request" iconLeft="paper-plane-outline" size="md" style={{ flex: 1 }} loading={a.busy} onPress={async () => { if (form && (await a.run(() => mentorship.request(userId, form), 'Request sent. You’ll get a notification when your tutor replies.'))) { setForm(null); load(); } }} />}>
        {form && d && (
          <View style={{ gap: 10 }}>
            <Txt variant="label">Course</Txt>
            <View style={shared.chips}>{d.courses.map((x) => <Chip key={x.course.id} label={x.course.title.slice(0, 26)} active={form.courseId === x.course.id} onPress={() => setForm({ ...form, courseId: x.course.id, mentorUserId: x.mentors[0]?.userId ?? null })} />)}</View>
            <Txt variant="label">Tutor</Txt>
            <View style={shared.chips}>{row?.mentors.map((m) => <Chip key={m.userId ?? 'team'} label={`${m.name} · ${m.role}`} active={form.mentorUserId === m.userId} onPress={() => setForm({ ...form, mentorUserId: m.userId })} />)}</View>
            {a.err('mentor') && <Txt variant="caption" color={c.danger}>{a.err('mentor')}</Txt>}
            <DateTimeField label="Preferred time" value={form.preferredAt} onChange={(v) => setForm({ ...form, preferredAt: v })} error={a.err('time')} />
            <Txt variant="label">Length</Txt>
            <View style={shared.chips}>{MENTOR_DURATIONS.map((m) => <Chip key={m} label={`${m} min`} active={form.durationMin === m} onPress={() => setForm({ ...form, durationMin: m })} />)}</View>
            <TextField label="What do you need help with?" placeholder="e.g. I’m stuck on module 3 – Meta ads targeting. Can we go through my campaign?" value={form.topic} onChangeText={(v) => setForm({ ...form, topic: v.slice(0, 500) })} multiline error={a.err('topic')} />
            {a.general && <Banner text={a.general} />}
          </View>
        )}
      </BottomSheet>

      <BottomSheet open={!!cancel} onClose={() => setCancel(null)} title="Cancel this 1:1?" footer={<><Button title="Keep it" size="md" variant="outline" style={{ flex: 1 }} onPress={() => setCancel(null)} /><Button title="Cancel request" size="md" style={{ flex: 1, backgroundColor: c.danger }} onPress={async () => { if (cancel && (await a.run(() => mentorship.cancel(userId, cancel), 'Cancelled. Your tutor was told.'))) { setCancel(null); load(); } }} /></>}>
        <Txt color={c.inkSoft}>Your tutor gets a notification. You can book again any time.</Txt>
      </BottomSheet>
    </Page>
  );
}
