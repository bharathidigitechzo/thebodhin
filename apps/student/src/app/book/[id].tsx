/** Public 1:1 booking page: pick a day, pick a free slot, pay (if paid), confirmed. */
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { bookingsApi } from '@/api/growth';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { PayBar } from '@/ui/payBar';
import { Page, useAct, useData, when } from '@/ui/grow';
import { Card, inr, shared } from '@/ui/section';

const dayKey = (iso: string) => new Date(iso).toDateString();

export default function BookPage() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { d, err, load } = useData(() => bookingsApi.publicOffer(id));
  const a = useAct();
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  if (!d) return <Page title="Book a session" err={err} fallback="/home" />;
  const days = [...new Set(d.slots.map(dayKey))];
  const cur = day ?? days[0] ?? null;
  const slots = d.slots.filter((s) => dayKey(s) === cur);
  if (done) return (
    <Page title="Booked ✅" fallback="/home">
      <Card>
        <Txt variant="title">{d.o.title}</Txt>
        <Txt>{when(done)} · {d.o.durationMin} min with {d.academy}</Txt>
        <Txt variant="caption" color={c.muted}>Confirmation is in your Notifications. You can cancel up to 12 hours before from My purchases.</Txt>
        <Button title="My purchases" onPress={() => router.replace('/my-purchases')} />
      </Card>
    </Page>
  );
  return (
    <Page title={d.o.title} sub={`${d.academy} · ${d.o.durationMin} min · ${d.o.priceInr ? inr(d.o.priceInr) : 'Free'}`} fallback="/home">
      {!session && <Banner tone="info" text="Sign in to book a session." />}
      {days.length === 0 && <Card><Txt color={c.muted} center>No free slots in the next two weeks. Check back soon.</Txt></Card>}
      {days.length > 0 && (
        <>
          <Txt variant="label">Pick a day</Txt>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {days.map((k) => <Chip key={k} label={new Date(k).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} active={k === cur} onPress={() => { setDay(k); setSlot(null); }} />)}
          </ScrollView>
          <Txt variant="label">Pick a time</Txt>
          <View style={shared.chips}>{slots.map((s) => <Chip key={s} label={new Date(s).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} active={slot === s} onPress={() => setSlot(s)} />)}</View>
          {a.general && <Banner text={a.general} />}
          {slot && session && <PayBar price={d.o.priceInr} academy={d.academy} label={`Book ${new Date(slot).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`} busy={a.busy} disabled={d.o.priceInr > 0 && !d.gateway} onPay={async (m) => { const s = slot; if (await a.run(() => bookingsApi.book(id, session.user.id, s, m))) setDone(s); else load(); }} />}
          {!session && <Button title="Sign in" onPress={() => router.push('/sign-in')} />}
        </>
      )}
    </Page>
  );
}
