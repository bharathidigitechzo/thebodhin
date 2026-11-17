/**
 * Admin portal → Live: live classes for Bodhin's own courses. Schedule for a course (every buyer is notified and sees it
 * in their Live tab), start (host), cancel with a reason. Mentorship requests and the timetable are one tap away.
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { courseLive } from '@/api/academy';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { BottomSheet, Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { Page, useAct, useDataAsync, when } from '@/ui/grow';
import { Card, shared } from '@/ui/section';

export default function AdminClasses() {
  const { c } = useTheme();
  const { d, err, load, userId } = useDataAsync(courseLive.list);
  const a = useAct();
  const [cancel, setCancel] = useState<{ id: string; title: string } | null>(null);
  const [reason, setReason] = useState('');

  const Row = ({ r }: { r: NonNullable<typeof d>['upcoming'][number] }) => (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ionicons name={r.state === 'live' ? 'radio' : 'calendar-outline'} size={24} color={r.state === 'live' ? c.danger : c.primary} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="bodyStrong" numberOfLines={1}>{r.s.title}</Txt>
          <Txt variant="caption" color={c.muted} numberOfLines={1}>{r.course.title} · {when(r.s.startsAt)}</Txt>
        </View>
        <Pill text={r.state === 'live' ? 'Live now' : r.state === 'upcoming' ? 'Scheduled' : r.state === 'cancelled' ? 'Cancelled' : 'Ended'} tone={r.state === 'live' ? 'live' : r.state === 'upcoming' ? 'info' : 'neutral'} />
      </View>
      <Txt variant="caption" color={c.muted}>{r.buyers} student{r.buyers === 1 ? '' : 's'} bought this course</Txt>
      {(r.state === 'live' || r.state === 'upcoming') && (
        <View style={shared.row}>
          <Button title={r.state === 'live' ? 'Go live' : 'Open'} iconLeft="videocam-outline" size="md" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/edu/prejoin/[id]', params: { id: r.s.id } })} />
          {r.state === 'upcoming' && <Button title="Cancel" size="md" variant="outline" style={{ flex: 1 }} onPress={() => { setReason(''); a.setFe(null); setCancel({ id: r.s.id, title: r.s.title }); }} />}
        </View>
      )}
    </Card>
  );

  return (
    <Page title="Live classes" sub="Bodhin courses" err={err} fallback="/admin/more" footer={<Button title="Schedule live class" iconLeft="add" size="md" style={{ flex: 1 }} onPress={() => router.push('/edu/schedule')} />}>
      {a.msg && <Banner tone="success" text={a.msg} />}
      {d && (
        <>
          <View style={shared.row}>
            <Button title="1:1 mentorship" iconLeft="person-circle-outline" size="md" variant="outline" style={{ flex: 1 }} onPress={() => router.push('/edu/mentorship')} />
            <Button title="Timetable" iconLeft="calendar-outline" size="md" variant="outline" style={{ flex: 1 }} onPress={() => router.push('/edu/timetable')} />
          </View>
          {d.live.length > 0 && <Txt variant="label" color={c.danger}>LIVE NOW</Txt>}
          {d.live.map((r) => <Row key={r.s.id} r={r} />)}
          <Txt variant="label" color={c.muted}>UPCOMING</Txt>
          {d.upcoming.length === 0 && <Card><Txt color={c.muted} center>Nothing scheduled. Schedule a class for one of Bodhin’s courses; every buyer is notified.</Txt></Card>}
          {d.upcoming.map((r) => <Row key={r.s.id} r={r} />)}
          {d.past.length > 0 && <Txt variant="label" color={c.muted}>PAST</Txt>}
          {d.past.map((r) => <Row key={r.s.id} r={r} />)}
        </>
      )}
      <BottomSheet open={!!cancel} onClose={() => setCancel(null)} title="Cancel this class?" footer={<Button title="Cancel and notify students" size="md" style={{ flex: 1, backgroundColor: c.danger }} loading={a.busy} onPress={async () => { if (cancel && (await a.run(() => courseLive.cancel(userId, cancel.id, reason), 'Class cancelled. Students were told.'))) { setCancel(null); load(); } }} />}>
        {cancel && (
          <View style={{ gap: 10 }}>
            <Txt color={c.inkSoft}>{cancel.title}</Txt>
            <TextField label="Reason (students see this)" placeholder="e.g. Moved to next Saturday, same time." value={reason} onChangeText={setReason} error={a.err('reason')} />
            {a.general && <Banner text={a.general} />}
          </View>
        )}
      </BottomSheet>
    </Page>
  );
}
