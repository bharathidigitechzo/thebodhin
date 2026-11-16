/** Public webinar page: details, seats, register (free or paid), replay + course recommendation after. */
import React, { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { webinarsApi } from '@/api/growth';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { PayBar } from '@/ui/payBar';
import { Page, useAct, useData, when } from '@/ui/grow';
import { Card, KV, inr } from '@/ui/section';

export default function WebinarPage() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { d, err, load } = useData((u) => webinarsApi.publicGet(id, u || undefined));
  const a = useAct();
  const [form, setForm] = useState({ name: session?.user.name ?? '', email: session?.user.email ?? '', phone: '' });
  if (!d) return <Page title="Webinar" err={err} fallback="/home" />;
  const { w, state } = d;
  return (
    <Page title={d.academy} sub="Webinar" fallback="/home">
      {a.msg && <Banner tone="success" text={a.msg} />}
      <Card right={<Pill text={state === 'live' ? 'Live now' : state === 'upcoming' ? `${d.seatsLeft} seats left` : state === 'ended' ? 'Ended' : 'Cancelled'} tone={state === 'live' ? 'live' : state === 'upcoming' ? 'info' : 'neutral'} />} title={w.priceInr ? inr(w.priceInr) : 'Free'}>
        <Txt variant="title">{w.title}</Txt>
        <Txt color={c.inkSoft}>{w.description}</Txt>
        <KV k="When" v={when(w.startsAt)} />
        <KV k="Duration" v={`${w.durationMin} minutes`} />
      </Card>
      {d.registered ? (
        <Card>
          <Txt variant="bodyStrong">You’re registered ✅</Txt>
          <Txt variant="caption" color={c.muted}>The join link is in your email and Notifications. We’ll remind you before it starts.</Txt>
          {state === 'ended' && w.replay && <Txt variant="caption" color={c.muted}>The replay will appear here within a day.</Txt>}
        </Card>
      ) : (state === 'upcoming' || state === 'live') && d.seatsLeft > 0 ? (
        <Card title="Register">
          <TextField label="Name" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} error={a.err('name')} />
          <TextField label="Email" value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} keyboardType="email-address" autoCapitalize="none" error={a.err('email')} />
          <TextField label="Mobile (optional)" prefix="+91" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v.replace(/\D/g, '').slice(0, 10) })} keyboardType="phone-pad" error={a.err('phone')} hint="For a reminder call from the academy" />
          {a.general && <Banner text={a.general} />}
          <PayBar price={w.priceInr} academy={d.academy} label="Register" busy={a.busy} disabled={w.priceInr > 0 && !d.gateway} onPay={async (m) => { if (await a.run(() => webinarsApi.register(w.id, { userId: session?.user.id, ...form, phone: form.phone || undefined, method: m }), 'Registered! Check your email for the join link.')) load(); }} />
        </Card>
      ) : (
        <Banner tone="info" text={state === 'cancelled' ? 'This webinar was cancelled.' : 'Registration is closed.'} />
      )}
      {d.pitch && (
        <Card title="Want to go deeper?">
          <Txt variant="bodyStrong">{d.pitch.title}</Txt>
          <Button title="See the course" variant="outline" size="md" onPress={() => router.push({ pathname: '/course/[id]', params: { id: d.pitch!.id } })} />
        </Card>
      )}
    </Page>
  );
}
