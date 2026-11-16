/** Webinars: free or paid, registration page, reminders, registrants become leads, pitch a course at the end. */
import React, { useState } from 'react';
import { Share, View } from 'react-native';
import { router } from 'expo-router';
import { webinarsApi } from '@/api/growth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { BottomSheet, Chip, Pill, ProgressBar } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { DateTimeField, Page, useAct, useData, when } from '@/ui/grow';
import { Card, ToggleRow, inr, shared } from '@/ui/section';

const blank = () => ({ id: undefined as string | undefined, title: '', description: '', startsAt: new Date(Date.now() + 3 * 864e5).toISOString(), durationMin: 60, priceInr: 0, capacity: 200, pitchCourseId: undefined as string | undefined, replay: true, publish: true });
const STATE = { upcoming: ['Upcoming', 'info'], live: ['Live now', 'live'], ended: ['Ended', 'neutral'], draft: ['Draft', 'warning'], cancelled: ['Cancelled', 'neutral'] } as const;

export default function Webinars() {
  const { c } = useTheme();
  const { d, err, load, userId } = useData(webinarsApi.list);
  const a = useAct();
  const [f, setF] = useState<ReturnType<typeof blank> | null>(null);
  const [price, setPrice] = useState('0');
  const owner = d?.ctx.role === 'owner';
  const save = async () => { if (f && (await a.run(() => webinarsApi.save(userId, { ...f, priceInr: Number(price) || 0 }), f.publish ? 'Published. Share the link!' : 'Saved as draft.'))) { setF(null); load(); } };
  return (
    <Page title="Webinars" sub="Fill your funnel with live sessions" err={err} footer={d && <Button title="New webinar" iconLeft="add" size="md" style={{ flex: 1 }} disabled={!owner} onPress={() => { setF(blank()); setPrice('0'); a.setFe(null); }} />}>
      {d && (
        <>
          {a.msg && <Banner tone="success" text={a.msg} />}
          {d.rows.length === 0 && <Card><Txt color={c.muted} center>No webinars yet. A free 45-minute masterclass is the easiest way to get leads.</Txt></Card>}
          {d.rows.map(({ w, state }) => (
            <Card key={w.id} right={<Pill text={STATE[state][0]} tone={STATE[state][1]} />} title={w.priceInr ? inr(w.priceInr) : 'Free'}>
              <Txt variant="bodyStrong">{w.title}</Txt>
              <Txt variant="caption" color={c.muted}>{when(w.startsAt)} · {w.durationMin} min · {w.registrations.length}/{w.capacity} registered</Txt>
              <ProgressBar pct={(w.registrations.length / w.capacity) * 100} color={c.primary} height={4} />
              <View style={shared.row}>
                <Button title="Share link" size="md" variant="outline" iconLeft="share-social-outline" style={{ flex: 1 }} onPress={async () => { try { await Share.share({ message: `${w.title} — ${when(w.startsAt)}. Register: https://${d.ctx.host}/webinar/${w.id}` }); } catch { /* cancelled */ } }} />
                <Button title="Open page" size="md" variant="outline" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/webinar/[id]', params: { id: w.id } })} />
              </View>
              {owner && (state === 'upcoming' || state === 'draft') && (
                <View style={shared.row}>
                  <Button title="Edit" size="md" variant="outline" style={{ flex: 1 }} onPress={() => { setF({ id: w.id, title: w.title, description: w.description, startsAt: w.startsAt, durationMin: w.durationMin, priceInr: w.priceInr, capacity: w.capacity, pitchCourseId: w.pitchCourseId, replay: w.replay, publish: w.status === 'published' }); setPrice(String(w.priceInr)); a.setFe(null); }} />
                  <Button title="Cancel webinar" size="md" variant="outline" style={{ flex: 1 }} onPress={async () => { if (await a.run(() => webinarsApi.cancel(userId, w.id), 'Cancelled. Registrants were told.')) load(); }} />
                </View>
              )}
              {w.registrations.length > 0 && <Txt variant="caption" color={c.muted}>Latest: {w.registrations.slice(-3).map((r) => r.name).join(', ')}</Txt>}
            </Card>
          ))}
          <Txt variant="caption" color={c.muted}>The webinar runs in your Bodhin live room (no third-party branding). It uses your plan’s live room-hours.</Txt>
        </>
      )}
      <BottomSheet open={!!f} onClose={() => setF(null)} title={f?.id ? 'Edit webinar' : 'New webinar'} footer={<Button title={f?.publish ? 'Publish' : 'Save draft'} size="md" style={{ flex: 1 }} loading={a.busy} onPress={save} />}>
        {f && d && (
          <View style={{ gap: 10 }}>
            <TextField label="Title" placeholder="Free masterclass: …" value={f.title} onChangeText={(v) => setF({ ...f, title: v })} error={a.err('title')} />
            <TextField label="What will they learn?" value={f.description} onChangeText={(v) => setF({ ...f, description: v })} multiline />
            <DateTimeField label="Starts" value={f.startsAt} onChange={(v) => setF({ ...f, startsAt: v })} error={a.err('date')} />
            <View style={shared.chips}>{[30, 45, 60, 90].map((m) => <Chip key={m} label={`${m} min`} active={f.durationMin === m} onPress={() => setF({ ...f, durationMin: m })} />)}</View>
            <TextField label="Price (₹, 0 = free)" value={price} onChangeText={(v) => setPrice(v.replace(/\D/g, ''))} keyboardType="number-pad" error={a.err('price')} />
            <TextField label="Seats" value={String(f.capacity)} onChangeText={(v) => setF({ ...f, capacity: Number(v.replace(/\D/g, '')) || 0 })} keyboardType="number-pad" error={a.err('capacity')} />
            <Txt variant="label">Course to recommend at the end</Txt>
            <View style={shared.chips}>
              <Chip label="None" active={!f.pitchCourseId} onPress={() => setF({ ...f, pitchCourseId: undefined })} />
              {d.courses.map((co) => <Chip key={co.id} label={co.title.slice(0, 24)} active={f.pitchCourseId === co.id} onPress={() => setF({ ...f, pitchCourseId: co.id })} />)}
            </View>
            <ToggleRow title="Keep a replay" sub="Registrants can watch it later" value={f.replay} onChange={(v) => setF({ ...f, replay: v })} />
            <ToggleRow title="Publish now" sub="Off = save as draft" value={f.publish} onChange={(v) => setF({ ...f, publish: v })} />
            {a.general && <Banner text={a.general} />}
          </View>
        )}
      </BottomSheet>
    </Page>
  );
}
