/**
 * 1:1 mentorship inbox (tutor / educator / Bodhin team). A learner's request arrives with a notification;
 * accept (keep or change the time) → the learner gets the confirmed time; reject with a reason → the learner is told why.
 */
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { mentorship } from '@/api/academy';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { BottomSheet, Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { DateTimeField, Page, ago, useAct, useDataAsync, when } from '@/ui/grow';
import { Card, shared } from '@/ui/section';

type Sheet = { kind: 'accept' | 'reject' | 'cancel'; id: string; name: string; at: string } | null;

export default function MentorshipInbox() {
  const { c } = useTheme();
  const { d, err, load, userId } = useDataAsync(mentorship.inbox);
  useEffect(() => {
    if (userId) {
      mentorship.markViewed(userId);
    }
  }, [userId]);
  const a = useAct();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [note, setNote] = useState('');
  const [at, setAt] = useState('');
  const admin = d?.ctx.tenant.id === 't_bodhin';
  const open = (s: NonNullable<Sheet>) => { setNote(''); setAt(s.at); a.setFe(null); setSheet(s); };

  const submit = async () => {
    if (!sheet) return;
    const ok = sheet.kind === 'accept'
      ? await a.run(() => mentorship.respond(userId, sheet.id, 'accept', { note, startsAt: at }), `Confirmed. ${sheet.name} has the time and the join link.`)
      : sheet.kind === 'reject'
        ? await a.run(() => mentorship.respond(userId, sheet.id, 'reject', { note }), `Declined. ${sheet.name} has your reason.`)
        : await a.run(() => mentorship.cancel(userId, sheet.id, note), `Cancelled. ${sheet.name} was told.`);
    if (ok) { setSheet(null); load(); }
  };

  return (
    <Page title="1:1 mentorship" sub="Requests from your students" err={err} fallback={admin ? '/admin/more' : '/educator/more'}>
      {d && (
        <>
          {a.msg && <Banner tone="success" text={a.msg} />}
          {a.general && <Banner text={a.general} />}
          <View style={shared.row}>
            <Pill text={`${d.pending.length} waiting`} tone={d.pending.length ? 'warning' : 'neutral'} />
            <Pill text={`${d.upcoming.length} upcoming`} tone="info" />
          </View>

          <Txt variant="label" color={c.muted}>WAITING FOR YOUR REPLY</Txt>
          {d.pending.length === 0 && <Card><Txt color={c.muted} center>No new requests. Students who bought your courses can book a 1:1 from their Live tab.</Txt></Card>}
          {d.pending.map(({ r, course, learner, mentor }) => (
            <Card key={r.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="person-circle-outline" size={28} color={c.primary} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt variant="bodyStrong" numberOfLines={1}>{learner?.name ?? 'Learner'}</Txt>
                  <Txt variant="caption" color={c.muted} numberOfLines={1}>{course.title} · for {mentor}</Txt>
                </View>
                <Pill text="New" tone="warning" />
              </View>
              <Txt color={c.inkSoft}>“{r.topic}”</Txt>
              <View style={shared.row}>
                <Pill text={when(r.preferredAt)} icon="calendar" tone="info" />
                <Pill text={`${r.durationMin} min`} icon="time" />
                <Txt variant="caption" color={c.muted}>asked {ago(r.createdAt)}</Txt>
              </View>
              <View style={shared.row}>
                <Button title="Accept" iconLeft="checkmark" size="md" style={{ flex: 1 }} onPress={() => open({ kind: 'accept', id: r.id, name: learner?.name ?? 'The learner', at: r.preferredAt })} />
                <Button title="Decline" iconLeft="close" size="md" variant="outline" style={{ flex: 1 }} onPress={() => open({ kind: 'reject', id: r.id, name: learner?.name ?? 'The learner', at: r.preferredAt })} />
              </View>
            </Card>
          ))}

          <Txt variant="label" color={c.muted}>UPCOMING SESSIONS</Txt>
          {d.upcoming.length === 0 && <Card><Txt color={c.muted} center>No confirmed sessions.</Txt></Card>}
          {d.upcoming.map(({ r, course, learner, label }) => (
            <Card key={r.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="videocam-outline" size={24} color={label === 'Live now' ? c.danger : c.primary} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt variant="bodyStrong" numberOfLines={1}>{learner?.name} · {when(r.startsAt!)}</Txt>
                  <Txt variant="caption" color={c.muted} numberOfLines={1}>{course.title} · {r.durationMin} min</Txt>
                </View>
                <Pill text={label} tone={label === 'Live now' ? 'live' : 'success'} />
              </View>
              <View style={shared.row}>
                <Button title="Join" iconLeft="enter-outline" size="md" style={{ flex: 1 }} disabled={label !== 'Live now'} onPress={() => router.push({ pathname: '/mentor-room/[id]', params: { id: r.id } })} />
                <Button title="Cancel" size="md" variant="outline" style={{ flex: 1 }} onPress={() => open({ kind: 'cancel', id: r.id, name: learner?.name ?? 'The learner', at: r.startsAt! })} />
              </View>
            </Card>
          ))}

          {d.past.length > 0 && (
            <Card title="History">
              {d.past.map(({ r, course, learner, label }) => (
                <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
                  <Txt variant="label" style={{ flex: 1 }} numberOfLines={1}>{learner?.name} · {course.title}</Txt>
                  <Pill text={label} tone={label === 'Done' ? 'success' : 'neutral'} />
                </View>
              ))}
            </Card>
          )}
        </>
      )}

      <BottomSheet open={!!sheet} onClose={() => setSheet(null)} title={sheet?.kind === 'accept' ? 'Confirm the 1:1' : sheet?.kind === 'reject' ? 'Decline the request' : 'Cancel the session'} footer={<Button title={sheet?.kind === 'accept' ? 'Confirm and notify' : sheet?.kind === 'reject' ? 'Decline and notify' : 'Cancel and notify'} size="md" style={{ flex: 1 }} loading={a.busy} onPress={submit} />}>
        {sheet && (
          <View style={{ gap: 10 }}>
            {sheet.kind === 'accept' && <DateTimeField label="Session time (change it if needed)" value={at} onChange={setAt} error={a.err('time')} />}
            <TextField label={sheet.kind === 'accept' ? 'Note for the student (optional)' : sheet.kind === 'reject' ? 'Reason (the student sees this)' : 'Reason (optional)'} placeholder={sheet.kind === 'accept' ? 'e.g. Bring your project file.' : 'e.g. I’m travelling that week. Please pick a date after the 20th.'} value={note} onChangeText={setNote} multiline error={a.err('note')} />
            {a.general && <Banner text={a.general} />}
          </View>
        )}
      </BottomSheet>
    </Page>
  );
}
