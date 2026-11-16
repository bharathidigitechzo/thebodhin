/** International pricing: connect Stripe / PayPal, set USD / AED / GBP / EUR prices per course. */
import React, { useState } from 'react';
import { View } from 'react-native';
import { intlApi } from '@/api/growth2';
import { CURRENCIES, REF_RATE, type Currency } from '@/core/growth2';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { BottomSheet, Chip, Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { Page, useAct, useData } from '@/ui/grow';
import { Card, inr, shared } from '@/ui/section';

type Cur = Exclude<Currency, 'INR'>;
const FOREIGN = CURRENCIES.filter((c) => c.id !== 'INR');

export default function Intl() {
  const { c } = useTheme();
  const { d, err, load, userId } = useData(intlApi.admin);
  const a = useAct();
  const [gw, setGw] = useState<{ provider: 'stripe' | 'paypal'; key: string } | null>(null);
  const [ed, setEd] = useState<{ courseId: string; title: string; inr: number; prices: Partial<Record<Cur, string>> } | null>(null);
  const owner = d?.ctx.role === 'owner';
  return (
    <Page title="International pricing" sub="Sell to learners outside India" err={err}>
      {d && (
        <>
          {a.msg && <Banner tone="success" text={a.msg} />}
          <Card title="Card payments abroad" right={<Pill text={d.gateway === 'active' ? 'Connected' : 'Not connected'} tone={d.gateway === 'active' ? 'success' : 'warning'} />}>
            <Txt variant="caption" color={c.muted}>Indian learners keep paying in ₹ through your Razorpay/Cashfree. Learners abroad pay by card in their currency through your Stripe or PayPal — money goes to your account.</Txt>
            {owner && <Button title={d.gateway === 'active' ? 'Change gateway' : 'Connect Stripe or PayPal'} size="md" variant="outline" onPress={() => { setGw({ provider: 'stripe', key: '' }); a.setFe(null); }} />}
          </Card>
          {d.rows.map(({ co, prices }) => (
            <Card key={co.id} title={inr(co.priceInr)}>
              <Txt variant="bodyStrong">{co.title}</Txt>
              <View style={shared.chips}>{Object.keys(prices).length ? FOREIGN.filter((f) => prices[f.id as Cur]).map((f) => <Pill key={f.id} text={`${f.symbol}${prices[f.id as Cur]}`} tone="info" />) : <Txt variant="caption" color={c.muted}>India only</Txt>}</View>
              {owner && <Button title="Set prices" size="md" variant="outline" onPress={() => { setEd({ courseId: co.id, title: co.title, inr: co.priceInr, prices: Object.fromEntries(Object.entries(prices).map(([k, v]) => [k, String(v)])) }); a.setFe(null); }} />}
            </Card>
          ))}
        </>
      )}
      <BottomSheet open={!!gw} onClose={() => setGw(null)} title="Connect a card gateway" footer={<Button title="Connect" size="md" style={{ flex: 1 }} onPress={async () => { if (gw && (await a.run(() => intlApi.connect(userId, gw.provider, gw.key), 'Connected. Set prices per course below.'))) { setGw(null); load(); } }} />}>
        {gw && (
          <View style={{ gap: 10 }}>
            <View style={shared.chips}>{(['stripe', 'paypal'] as const).map((p) => <Chip key={p} label={p === 'stripe' ? 'Stripe' : 'PayPal'} active={gw.provider === p} onPress={() => setGw({ ...gw, provider: p })} />)}</View>
            <TextField label={gw.provider === 'stripe' ? 'Publishable key' : 'Client ID'} placeholder={gw.provider === 'stripe' ? 'pk_live_…' : ''} value={gw.key} onChangeText={(v) => setGw({ ...gw, key: v })} autoCapitalize="none" error={a.err('key')} />
            <Txt variant="caption" color={c.muted}>Only the public key goes here. The secret key is added once by Bodhin support on the server — never in the app.</Txt>
          </View>
        )}
      </BottomSheet>
      <BottomSheet open={!!ed} onClose={() => setEd(null)} title={ed?.title ?? ''} footer={<Button title="Save prices" size="md" style={{ flex: 1 }} onPress={async () => { if (ed && (await a.run(() => intlApi.setPrices(userId, ed.courseId, Object.fromEntries(Object.entries(ed.prices).map(([k, v]) => [k, v ? Number(v) : undefined]))), 'Prices saved.'))) { setEd(null); load(); } }} />}>
        {ed && (
          <View style={{ gap: 10 }}>
            <Txt variant="caption" color={c.muted}>India price {inr(ed.inr)}. Leave a currency empty to not offer it. Suggested = same value at today’s reference rate.</Txt>
            {FOREIGN.map((f) => (
              <TextField key={f.id} label={`${f.label} (${f.id})`} placeholder={`Suggested ${Math.round(ed.inr / REF_RATE[f.id])}`} value={ed.prices[f.id as Cur] ?? ''} onChangeText={(v) => setEd({ ...ed, prices: { ...ed.prices, [f.id]: v.replace(/[^\d.]/g, '') } })} keyboardType="decimal-pad" />
            ))}
            {a.fe && <Banner text={a.fe.msg} />}
          </View>
        )}
      </BottomSheet>
    </Page>
  );
}
