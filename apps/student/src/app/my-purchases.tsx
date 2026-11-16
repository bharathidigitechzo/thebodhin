/** Learner "My purchases": digital products, 1:1 sessions, webinars, EMI plans (pay the next instalment). */
import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { bookingsApi, emiApi, myStuff } from '@/api/growth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { Pill, ProgressBar } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { Page, useAct, useData, when } from '@/ui/grow';
import { Card, KV, fmtDay, inr } from '@/ui/section';

export default function MyPurchases() {
  const { c } = useTheme();
  const { d, err, load, userId } = useData(myStuff.get);
  const a = useAct();
  const empty = d && !d.products.length && !d.bookings.length && !d.webinars.length && !d.emi.length;
  return (
    <Page title="My purchases" sub="Notes, sessions, webinars, instalments" err={err} fallback="/profile">
      {a.msg && <Banner tone="success" text={a.msg} />}
      {a.general && <Banner text={a.general} />}
      {empty && <Card><Txt color={c.muted} center>Nothing here yet. Things you buy from academies — notes, 1:1 sessions, webinars — show up here.</Txt></Card>}
      {d?.emi.map(({ c: k, course, st, graceDays }) => (
        <Card key={k.id} title="Instalments" right={<Pill text={st.state === 'completed' ? 'Paid in full' : st.state === 'overdue' ? 'Overdue' : st.state === 'due_soon' ? 'Due soon' : 'On track'} tone={st.state === 'overdue' ? 'live' : st.state === 'due_soon' ? 'warning' : 'success'} />}>
          <Txt variant="bodyStrong">{course}</Txt>
          <ProgressBar pct={(st.paid / k.totalInr) * 100} />
          <KV k="Paid" v={`${inr(st.paid)} of ${inr(k.totalInr)}`} />
          {st.next && <KV k="Next" v={`${inr(st.next.amountInr)} · ${fmtDay(st.next.dueAt)}`} />}
          {st.accessPaused && <Txt variant="caption" color={c.danger}>Course access is paused. Pay to continue — your progress is safe.</Txt>}
          {!st.accessPaused && st.state === 'overdue' && <Txt variant="caption" color={c.muted}>Pay within {Math.max(0, graceDays - st.daysOverdue)} days to keep access.</Txt>}
          {st.next && <Button title={a.busy ? 'Processing…' : `Pay ${inr(st.next.amountInr)} (UPI)`} loading={a.busy} onPress={async () => { if (await a.run(() => emiApi.payNext(userId, k.id, 'upi'), 'Paid. Invoice sent to your email.')) load(); }} />}
        </Card>
      ))}
      {d?.products.map(({ p, academy }) => (
        <Card key={p.id} title={academy}>
          <Txt variant="bodyStrong">{p.title}</Txt>
          <Button title="Open & download" size="md" variant="outline" iconLeft="download-outline" onPress={() => router.push({ pathname: '/product/[id]', params: { id: p.id } })} />
        </Card>
      ))}
      {d?.bookings.map(({ b, title, academy }) => (
        <Card key={b.id} title={academy} right={<Pill text={b.status === 'confirmed' ? (new Date(b.endsAt).getTime() < Date.now() ? 'Done' : 'Confirmed') : 'Cancelled'} tone={b.status === 'confirmed' ? 'success' : 'neutral'} />}>
          <Txt variant="bodyStrong">{title}</Txt>
          <Txt variant="caption" color={c.muted}>{when(b.startsAt)}</Txt>
          {b.status === 'confirmed' && new Date(b.startsAt).getTime() > Date.now() && <Button title="Cancel session" size="md" variant="outline" onPress={async () => { if (await a.run(() => bookingsApi.cancelMine(userId, b.id), 'Cancelled.')) load(); }} />}
        </Card>
      ))}
      {d?.webinars.map(({ w, state, academy }) => (
        <Card key={w.id} title={academy}>
          <Txt variant="bodyStrong">{w.title}</Txt>
          <Txt variant="caption" color={c.muted}>{when(w.startsAt)} · {state === 'upcoming' ? 'Registered' : state}</Txt>
          <Button title="Open" size="md" variant="outline" onPress={() => router.push({ pathname: '/webinar/[id]', params: { id: w.id } })} />
        </Card>
      ))}
      <View />
    </Page>
  );
}
