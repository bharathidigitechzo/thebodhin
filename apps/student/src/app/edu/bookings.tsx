/** 1:1 bookings: weekly availability, price, buffer; students pick a free slot (no double booking). */
import React, { useState } from 'react';
import { Share, View } from 'react-native';
import { router } from 'expo-router';
import { bookingsApi } from '@/api/growth';
import type { BookingOffer } from '@/core/growth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { BottomSheet, Chip, Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { TimeField } from '@/ui/pickers';
import { Page, useAct, useData, when } from '@/ui/grow';
import { Card, ToggleRow, inr, shared } from '@/ui/section';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
type Form = Omit<BookingOffer, 'id' | 'tenantId'> & { id?: string };
const blank = (): Form => ({ title: '1:1 doubt session', durationMin: 30, priceInr: 0, weekly: [1, 3, 5].map((day) => ({ day, from: '18:00', to: '20:00' })), bufferMin: 10, noticeHours: 4, horizonDays: 14, active: true });

export default function Bookings() {
  const { c } = useTheme();
  const { d, err, load, userId } = useData(bookingsApi.list);
  const a = useAct();
  const [f, setF] = useState<Form | null>(null);
  const [price, setPrice] = useState('0');
  const owner = d?.ctx.role === 'owner';
  const toggleDay = (day: number) => f && setF({ ...f, weekly: f.weekly.some((w) => w.day === day) ? f.weekly.filter((w) => w.day !== day) : [...f.weekly, { day, from: '18:00', to: '20:00' }].sort((x, y) => x.day - y.day) });
  const setTime = (day: number, k: 'from' | 'to', v: string) => f && setF({ ...f, weekly: f.weekly.map((w) => (w.day === day ? { ...w, [k]: v } : w)) });
  return (
    <Page title="1:1 bookings" sub="Consultations, doubt clearing, mentoring" err={err} footer={d && <Button title="New session type" iconLeft="add" size="md" style={{ flex: 1 }} disabled={!owner} onPress={() => { setF(blank()); setPrice('0'); a.setFe(null); }} />}>
      {d && (
        <>
          {a.msg && <Banner tone="success" text={a.msg} />}
          {d.offers.map((o) => (
            <Card key={o.id} title={`${o.durationMin} min · ${o.priceInr ? inr(o.priceInr) : 'Free'}`} right={<Pill text={o.active ? 'Bookable' : 'Paused'} tone={o.active ? 'success' : 'neutral'} />}>
              <Txt variant="bodyStrong">{o.title}</Txt>
              <Txt variant="caption" color={c.muted}>{o.weekly.map((w) => `${DAYS[w.day]} ${w.from}–${w.to}`).join(' · ')}</Txt>
              <View style={shared.row}>
                <Button title="Share link" size="md" variant="outline" iconLeft="share-social-outline" style={{ flex: 1 }} onPress={async () => { try { await Share.share({ message: `Book a ${o.title}: https://${d.ctx.host}/book/${o.id}` }); } catch { /* cancelled */ } }} />
                <Button title="Preview" size="md" variant="outline" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/book/[id]', params: { id: o.id } })} />
                {owner && <Button title="Edit" size="md" variant="outline" style={{ flex: 1 }} onPress={() => { setF({ ...o }); setPrice(String(o.priceInr)); a.setFe(null); }} />}
              </View>
            </Card>
          ))}
          <Txt variant="label">Upcoming sessions ({d.upcoming.length})</Txt>
          {d.upcoming.length === 0 && <Card><Txt color={c.muted} center>No sessions booked yet.</Txt></Card>}
          {d.upcoming.map((b) => (
            <Card key={b.id}>
              <Txt variant="bodyStrong">{b.name}</Txt>
              <Txt variant="caption" color={c.muted}>{when(b.startsAt)} · {d.offers.find((o) => o.id === b.offerId)?.title}</Txt>
              <Button title="Cancel & refund" size="md" variant="outline" onPress={async () => { if (await a.run(() => bookingsApi.cancelBooking(userId, b.id), 'Cancelled. The student was told.')) load(); }} />
            </Card>
          ))}
        </>
      )}
      <BottomSheet open={!!f} onClose={() => setF(null)} title={f?.id ? 'Edit session type' : 'New session type'} footer={<Button title="Save" size="md" style={{ flex: 1 }} onPress={async () => { if (f && (await a.run(() => bookingsApi.saveOffer(userId, { ...f, priceInr: Number(price) || 0 }), 'Saved. Your booking link is live.'))) { setF(null); load(); } }} />}>
        {f && (
          <View style={{ gap: 10 }}>
            <TextField label="Name" value={f.title} onChangeText={(v) => setF({ ...f, title: v })} error={a.err('title')} />
            <View style={shared.chips}>{([15, 30, 45, 60] as const).map((m) => <Chip key={m} label={`${m} min`} active={f.durationMin === m} onPress={() => setF({ ...f, durationMin: m })} />)}</View>
            <TextField label="Price (₹, 0 = free)" value={price} onChangeText={(v) => setPrice(v.replace(/\D/g, ''))} keyboardType="number-pad" error={a.err('price')} />
            <Txt variant="label">Available days</Txt>
            <View style={shared.chips}>{DAYS.map((dn, i) => <Chip key={dn} label={dn} active={f.weekly.some((w) => w.day === i)} onPress={() => toggleDay(i)} />)}</View>
            {f.weekly.map((w) => (
              <View key={w.day} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
                <Txt variant="label" style={{ width: 40, paddingBottom: 14 }}>{DAYS[w.day]}</Txt>
                <View style={{ flex: 1 }}><TimeField label="From" value={w.from} onChange={(v) => setTime(w.day, 'from', v)} /></View>
                <View style={{ flex: 1 }}><TimeField label="To" value={w.to} onChange={(v) => setTime(w.day, 'to', v)} /></View>
              </View>
            ))}
            {a.err('weekly') && <Banner text={a.err('weekly')!} />}
            <Txt variant="label">Break between sessions</Txt>
            <View style={shared.chips}>{[0, 10, 15].map((m) => <Chip key={m} label={m ? `${m} min` : 'None'} active={f.bufferMin === m} onPress={() => setF({ ...f, bufferMin: m })} />)}</View>
            <Txt variant="label">Minimum notice</Txt>
            <View style={shared.chips}>{[2, 4, 24].map((h) => <Chip key={h} label={`${h} h`} active={f.noticeHours === h} onPress={() => setF({ ...f, noticeHours: h })} />)}</View>
            <ToggleRow title="Accept bookings" value={f.active} onChange={(v) => setF({ ...f, active: v })} />
            {a.general && <Banner text={a.general} />}
          </View>
        )}
      </BottomSheet>
    </Page>
  );
}
