/** Broadcasts: email + push to all students, a course, a batch, webinar registrants or leads; now or scheduled. */
import React, { useState } from 'react';
import { View } from 'react-native';
import { broadcastsApi } from '@/api/growth';
import type { Audience, Channel } from '@/core/growth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { BottomSheet, Chip, Pill } from '@/ui/kit';
import { Banner, Checkbox } from '@/ui/misc';
import { DateTimeField, Page, useAct, useData, when } from '@/ui/grow';
import { Card, shared } from '@/ui/section';

const blank = () => ({ title: '', body: '', channel: 'both' as Channel, audience: { kind: 'all_students' } as Audience, marketing: false, later: false, at: new Date(Date.now() + 3600e3).toISOString() });

export default function Broadcasts() {
  const { c } = useTheme();
  const { d, err, load, userId } = useData(broadcastsApi.list);
  const a = useAct();
  const [f, setF] = useState<ReturnType<typeof blank> | null>(null);
  const count = f && d ? (() => { try { return broadcastsApi.count(userId, f.audience, f.marketing); } catch { return null; } })() : null;
  const aud = (x: Audience) => {
    if (!d) return '';
    switch (x.kind) {
      case 'all_students': return 'All students';
      case 'course': return d.courses.find((co) => co.id === x.courseId)?.title ?? 'Course';
      case 'batch': return d.batches.find((b) => b.id === x.batchId)?.name ?? 'Batch';
      case 'webinar': return `Webinar: ${d.webinars.find((w) => w.id === x.webinarId)?.title ?? ''}`;
      case 'leads': return 'Leads with email';
    }
  };
  const same = (x: Audience, y: Audience) => JSON.stringify(x) === JSON.stringify(y);
  const send = async () => {
    if (!f) return;
    if (await a.run(() => { const b = broadcastsApi.create(userId, { ...f, scheduledAt: f.later ? f.at : undefined }); a.setMsg(b.status === 'sent' ? `Sent to ${b.recipients} people${b.skippedOptOut ? ` (${b.skippedOptOut} skipped — offers off)` : ''}.` : `Scheduled for ${when(b.scheduledAt)}.`); })) { setF(null); load(); }
  };
  return (
    <Page title="Broadcasts" sub="Email & app push to your learners" err={err} footer={d && <Button title="New broadcast" iconLeft="megaphone-outline" size="md" style={{ flex: 1 }} disabled={d.ctx.role !== 'owner'} onPress={() => { setF(blank()); a.setFe(null); }} />}>
      {d && (
        <>
          {a.msg && <Banner tone="success" text={a.msg} />}
          <Txt variant="caption" color={c.muted}>{d.sentToday}/5 broadcasts used today. Marketing messages include an unsubscribe line and skip people who turned off offers.</Txt>
          {d.rows.length === 0 && <Card><Txt color={c.muted} center>No broadcasts yet.</Txt></Card>}
          {d.rows.map((b) => (
            <Card key={b.id} right={<Pill text={b.status === 'sent' ? 'Sent' : b.status === 'scheduled' ? 'Scheduled' : 'Cancelled'} tone={b.status === 'sent' ? 'success' : b.status === 'scheduled' ? 'info' : 'neutral'} />} title={aud(b.audience)}>
              <Txt variant="bodyStrong">{b.title}</Txt>
              <Txt variant="caption" color={c.inkSoft} numberOfLines={2}>{b.body}</Txt>
              <Txt variant="caption" color={c.muted}>{b.status === 'sent' ? `${when(b.sentAt!)} · ${b.recipients} reached${b.skippedOptOut ? ` · ${b.skippedOptOut} opted out` : ''}` : when(b.scheduledAt)}</Txt>
              {b.status === 'scheduled' && <Button title="Cancel" variant="outline" size="md" onPress={async () => { if (await a.run(() => broadcastsApi.cancel(userId, b.id), 'Cancelled.')) load(); }} />}
            </Card>
          ))}
        </>
      )}
      <BottomSheet open={!!f} onClose={() => setF(null)} title="New broadcast" footer={<Button title={f?.later ? 'Schedule' : `Send now${count ? ` to ${count.reach}` : ''}`} size="md" style={{ flex: 1 }} loading={a.busy} onPress={send} />}>
        {f && d && (
          <View style={{ gap: 10 }}>
            <Txt variant="label">Send to</Txt>
            <View style={shared.chips}>
              <Chip label="All students" active={f.audience.kind === 'all_students'} onPress={() => setF({ ...f, audience: { kind: 'all_students' } })} />
              {d.courses.map((co) => <Chip key={co.id} label={co.title.slice(0, 24)} active={same(f.audience, { kind: 'course', courseId: co.id })} onPress={() => setF({ ...f, audience: { kind: 'course', courseId: co.id } })} />)}
              {d.batches.map((b) => <Chip key={b.id} label={b.name.slice(0, 24)} icon="people-outline" active={same(f.audience, { kind: 'batch', batchId: b.id })} onPress={() => setF({ ...f, audience: { kind: 'batch', batchId: b.id } })} />)}
              {d.webinars.map((w) => <Chip key={w.id} label={`Webinar · ${w.title.slice(0, 16)}`} active={same(f.audience, { kind: 'webinar', webinarId: w.id })} onPress={() => setF({ ...f, audience: { kind: 'webinar', webinarId: w.id } })} />)}
              {d.leadsOn && <Chip label="Leads" icon="funnel-outline" active={f.audience.kind === 'leads'} onPress={() => setF({ ...f, audience: { kind: 'leads' }, marketing: true })} />}
            </View>
            {count && <Txt variant="caption" color={c.muted}>{count.reach} will get it{count.skipped ? ` · ${count.skipped} skipped (offers off)` : ''}</Txt>}
            {a.err('audience') && <Banner text={a.err('audience')!} />}
            <View style={shared.chips}>{(['both', 'email', 'push'] as Channel[]).map((ch) => <Chip key={ch} label={ch === 'both' ? 'Email + push' : ch === 'email' ? 'Email' : 'Push'} active={f.channel === ch} onPress={() => setF({ ...f, channel: ch })} />)}</View>
            <TextField label="Title" value={f.title} onChangeText={(v) => setF({ ...f, title: v })} error={a.err('subject')} />
            <TextField label="Message" value={f.body} onChangeText={(v) => setF({ ...f, body: v })} multiline error={a.err('body')} hint="You can use {{name}}" />
            <Checkbox label="Marketing" checked={f.marketing} onChange={(v) => setF({ ...f, marketing: v })}><View style={{ flex: 1 }}><Txt variant="label">This is an offer / promotion</Txt><Txt variant="caption" color={c.muted}>Leave off for class, schedule or fee updates.</Txt></View></Checkbox>
            <Checkbox label="Schedule" checked={f.later} onChange={(v) => setF({ ...f, later: v })}><Txt variant="label">Schedule for later</Txt></Checkbox>
            {f.later && <DateTimeField label="Send on" value={f.at} onChange={(v) => setF({ ...f, at: v })} error={a.err('date')} />}
            {a.general && <Banner text={a.general} />}
          </View>
        )}
      </BottomSheet>
    </Page>
  );
}
