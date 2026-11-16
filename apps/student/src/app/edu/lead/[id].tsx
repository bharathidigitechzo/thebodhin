/** One lead: call/WhatsApp-free contact, stage moves, notes timeline, follow-up and demo booking. */
import React, { useState } from 'react';
import { Linking, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { leadsApi } from '@/api/growth';
import { LEAD_SOURCES, LEAD_STAGES, LOST_REASONS, type LeadStage } from '@/core/growth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { BottomSheet, Chip, Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { DateTimeField, Page, ago, useAct, useData, when } from '@/ui/grow';
import { Card, KV, shared } from '@/ui/section';

export default function LeadDetail() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { d, err, load, userId } = useData((u) => leadsApi.get(u, id));
  const a = useAct();
  const [note, setNote] = useState('');
  const [sheet, setSheet] = useState<null | 'follow' | 'demo' | 'lost'>(null);
  const [at, setAt] = useState(() => new Date(Date.now() + 864e5).toISOString());
  const [reason, setReason] = useState('');
  if (!d) return <Page title="Lead" err={err} fallback="/edu/leads" />;
  const { l } = d;
  const move = async (s: LeadStage, extra?: { lostReason?: string }) => { if (await a.run(() => leadsApi.move(userId, l.id, s, extra), `Moved to ${LEAD_STAGES.find((x) => x.id === s)!.label}.`)) { setSheet(null); load(); } };
  return (
    <Page title={l.name} sub={`${LEAD_SOURCES.find((s) => s.id === l.source)?.label} · added ${ago(l.createdAt)}`} fallback="/edu/leads">
      {a.msg && <Banner tone="success" text={a.msg} />}
      {a.general && <Banner text={a.general} />}
      <Card>
        <KV k="Mobile" v={`+91 ${l.phone.slice(0, 5)} ${l.phone.slice(5)}`} />
        {l.email && <KV k="Email" v={l.email} />}
        <KV k="Course" v={d.course || 'Not decided'} />
        {l.demoAt && <KV k="Demo" v={when(l.demoAt)} />}
        {l.nextFollowUpAt && <KV k="Next follow-up" v={when(l.nextFollowUpAt)} tone={d.follow === 'overdue' ? c.danger : undefined} />}
        {l.lostReason && <KV k="Lost because" v={l.lostReason} />}
        <View style={shared.row}>
          <Button title="Call" iconLeft="call" size="md" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:+91${l.phone}`)} />
          {l.email && <Button title="Email" iconLeft="mail-outline" variant="outline" size="md" style={{ flex: 1 }} onPress={() => Linking.openURL(`mailto:${l.email}`)} />}
        </View>
      </Card>
      <Card title="Stage">
        <View style={shared.chips}>
          {LEAD_STAGES.map((s) => (
            <Chip key={s.id} label={s.label} active={l.stage === s.id} onPress={() => (s.id === l.stage ? null : s.id === 'lost' ? setSheet('lost') : s.id === 'demo' ? setSheet('demo') : move(s.id))} />
          ))}
        </View>
        {l.stage === 'won' && <Txt variant="caption" color={c.muted}>Joined. Enroll them from the batch page or send the course link — the sale is recorded as your own (no marketplace commission).</Txt>}
        <View style={shared.row}>
          <Button title="Set follow-up" iconLeft="alarm-outline" variant="outline" size="md" style={{ flex: 1 }} onPress={() => setSheet('follow')} />
          <Button title="Book demo" iconLeft="videocam-outline" variant="outline" size="md" style={{ flex: 1 }} onPress={() => setSheet('demo')} />
        </View>
      </Card>
      <Card title="Notes & history">
        <TextField label="Add a note" placeholder="What did they say? When to call back?" value={note} onChangeText={setNote} multiline error={a.err('note')} />
        <Button title="Save note" size="md" variant="outline" onPress={async () => { if (await a.run(() => leadsApi.note(userId, l.id, note), 'Note saved.')) { setNote(''); load(); } }} />
        {[...l.notes].reverse().map((n, i) => (
          <View key={i} style={{ borderTopWidth: 1, borderTopColor: c.border, paddingTop: 8, gap: 2 }}>
            <Txt>{n.text}</Txt>
            <Txt variant="caption" color={c.muted}>{n.by} · {ago(n.at)}</Txt>
          </View>
        ))}
        {!l.notes.length && <Txt variant="caption" color={c.muted}>No notes yet.</Txt>}
      </Card>
      <Button title="Delete lead" variant="outline" size="md" iconLeft="trash-outline" onPress={async () => { if (await a.run(() => leadsApi.remove(userId, l.id))) router.back(); }} />

      <BottomSheet open={sheet === 'follow' || sheet === 'demo'} onClose={() => setSheet(null)} title={sheet === 'demo' ? 'Book a demo class' : 'Next follow-up'} footer={<>
        {sheet === 'follow' && l.nextFollowUpAt && <Button title="Clear" variant="outline" size="md" onPress={async () => { if (await a.run(() => leadsApi.followUp(userId, l.id, null), 'Follow-up cleared.')) { setSheet(null); load(); } }} />}
        <Button title="Save" size="md" style={{ flex: 1 }} onPress={async () => { if (await a.run(() => (sheet === 'demo' ? leadsApi.bookDemo(userId, l.id, at) : leadsApi.followUp(userId, l.id, at)), sheet === 'demo' ? 'Demo booked. We’ll remind you.' : 'Follow-up set.')) { setSheet(null); load(); } }} />
      </>}>
        <View style={{ gap: 10 }}>
          <View style={shared.chips}>
            {[['In 2 h', 2 / 24], ['Tomorrow', 1], ['In 3 days', 3], ['Next week', 7]].map(([lb, days]) => <Chip key={lb as string} label={lb as string} onPress={() => setAt(new Date(Date.now() + (days as number) * 864e5).toISOString())} />)}
          </View>
          <DateTimeField label="Date" value={at} onChange={setAt} error={a.err('date')} />
          {sheet === 'demo' && <Txt variant="caption" color={c.muted}>Tip: run demos as a free live class and send them the link — the lead moves to “Demo”.</Txt>}
        </View>
      </BottomSheet>
      <BottomSheet open={sheet === 'lost'} onClose={() => setSheet(null)} title="Why was this lead lost?" footer={<Button title="Mark as lost" size="md" style={{ flex: 1 }} onPress={() => move('lost', { lostReason: reason })} />}>
        <View style={shared.chips}>{LOST_REASONS.map((r) => <Chip key={r} label={r} active={reason === r} onPress={() => setReason(r)} />)}</View>
        {a.err('reason') && <Banner text={a.err('reason')!} />}
      </BottomSheet>
      <Pill text="Leads stay private to your workspace" tone="neutral" icon="lock-closed" />
    </Page>
  );
}
