/** Public bundle page: what's inside, savings, price after owned courses, buy. */
import React, { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { bundlesApi } from '@/api/growth2';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { PayBar } from '@/ui/payBar';
import { Page, useAct, useData } from '@/ui/grow';
import { Card, KV, inr } from '@/ui/section';

export default function BundlePage() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { d, err, load } = useData((u) => bundlesApi.publicGet(id, u || undefined));
  const a = useAct();
  const [done, setDone] = useState(false);
  if (!d) return <Page title="Bundle" err={err} fallback="/explore" />;
  const all = d.owned.length === d.courses.length;
  return (
    <Page title={d.academy} sub="Bundle" fallback="/explore">
      {done && <Banner tone="success" text="You’re enrolled in every course of the bundle. Find them in My Learning." />}
      {a.general && <Banner text={a.general} />}
      <Card title={`${d.courses.length} courses`} right={<Pill text={`Save ${d.save.pct}%`} tone="success" />}>
        <Txt variant="title">{d.b.title}</Txt>
        {d.courses.map((co) => (
          <View key={co.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <Txt style={{ flex: 1 }} numberOfLines={2}>{co.title}</Txt>
            {d.owned.includes(co.id) ? <Pill text="You own this" tone="info" /> : <Txt color={c.muted} style={{ textDecorationLine: 'line-through' }}>{inr(co.priceInr)}</Txt>}
          </View>
        ))}
        <KV k="Separately" v={inr(d.list)} />
        <KV k="Bundle price" v={inr(d.b.priceInr)} strong />
        {d.owned.length > 0 && !all && <KV k="You pay (owned courses removed)" v={inr(d.payInr)} strong />}
      </Card>
      {all || done ? (
        <Button title="Go to My Learning" onPress={() => router.replace('/learning')} />
      ) : session ? (
        <PayBar price={d.payInr} academy={d.academy} label="Buy bundle" busy={a.busy} onPay={async (m) => { if (await a.run(() => bundlesApi.buy(id, session.user.id, m, null))) { setDone(true); load(); } }} />
      ) : (
        <Button title="Sign in to buy" onPress={() => router.push('/sign-in')} />
      )}
    </Page>
  );
}
