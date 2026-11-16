/** Digital product page: what's inside, buy, then download (limited, short-lived links). */
import React from 'react';
import { Linking, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { productsApi } from '@/api/growth';
import { PRODUCT_KINDS } from '@/core/growth';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { PayBar } from '@/ui/payBar';
import { Page, useAct, useData } from '@/ui/grow';
import { Card, inr } from '@/ui/section';

export default function ProductPage() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { d, err, load } = useData((u) => productsApi.publicGet(id, u || undefined));
  const a = useAct();
  if (!d) return <Page title="Product" err={err} fallback="/home" />;
  const { p } = d;
  return (
    <Page title={d.academy} sub={PRODUCT_KINDS.find((k) => k.id === p.kind)?.label} fallback="/home">
      {a.msg && <Banner tone="success" text={a.msg} />}
      {a.general && <Banner text={a.general} />}
      <Card title={p.priceInr ? inr(p.priceInr) : 'Free'} right={d.owned ? <Pill text="Owned" tone="success" /> : undefined}>
        <Txt variant="title">{p.title}</Txt>
        <Txt color={c.inkSoft}>{p.description}</Txt>
        <Txt variant="caption" color={c.muted}>{p.files.length} file{p.files.length === 1 ? '' : 's'} · download up to {p.downloadLimit} times each</Txt>
      </Card>
      {d.owned ? (
        <Card title="Your files">
          {p.files.map((f) => (
            <View key={f.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Txt style={{ flex: 1 }} numberOfLines={1}>{f.name} · {f.sizeMb} MB</Txt>
              <Button title="Download" size="md" variant="outline" iconLeft="download-outline" onPress={() => a.run(() => { const r = productsApi.download(p.id, session!.user.id, f.name); a.setMsg(`Download started · ${r.left} left`); Linking.openURL(r.url).catch(() => undefined); })} />
            </View>
          ))}
        </Card>
      ) : session ? (
        <PayBar price={p.priceInr} academy={d.academy} label={p.priceInr ? 'Buy now' : 'Get it free'} busy={a.busy} disabled={p.priceInr > 0 && !d.gateway} onPay={async (m) => { if (await a.run(() => productsApi.buy(p.id, session.user.id, m), 'It’s yours! Download below or from My purchases.')) load(); }} />
      ) : (
        <Button title="Sign in to buy" onPress={() => router.push('/sign-in')} />
      )}
    </Page>
  );
}
