/** Affiliate program: commission %, attribution window, approve affiliates, see sales, pay out. */
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { affiliatesApi } from '@/api/growth2';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { Chip, Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { Page, ago, useAct, useData } from '@/ui/grow';
import { Card, Stat, ToggleRow, inr, shared } from '@/ui/section';

export default function Affiliates() {
  const { c } = useTheme();
  const { d, err, load, userId } = useData(affiliatesApi.admin);
  const a = useAct();
  const [p, setP] = useState(d?.program ?? null);
  useEffect(() => { if (d) setP({ ...d.program }); }, [d]);
  const owner = d?.ctx.role === 'owner';
  const dirty = !!(p && d && JSON.stringify(p) !== JSON.stringify(d.program));
  return (
    <Page title="Affiliate program" sub="Students & partners bring students" err={err} footer={p && owner && <Button title={dirty ? 'Save program' : 'Saved'} size="md" style={{ flex: 1 }} disabled={!dirty} onPress={async () => { if (await a.run(() => affiliatesApi.saveProgram(userId, p), p.enabled ? 'Program is live. Learners see “Refer & earn” in their Profile.' : 'Program paused.')) load(); }} />}>
      {d && p && (
        <>
          {a.msg && <Banner tone="success" text={a.msg} />}
          {a.general && <Banner text={a.general} />}
          <View style={shared.row}>
            <Stat v={inr(d.totals.due)} l="Ready to pay" />
            <Stat v={inr(d.totals.pending)} l="In refund window" />
            <Stat v={inr(d.totals.paid)} l="Paid" />
          </View>
          <Card title="Program">
            <ToggleRow title="Referral program on" value={p.enabled} disabled={!owner} onChange={(v) => setP({ ...p, enabled: v })} />
            <Txt variant="label">Commission (of what you receive)</Txt>
            <View style={shared.chips}>{[5, 10, 15, 20, 30].map((n) => <Chip key={n} label={`${n}%`} active={p.commissionPct === n} onPress={() => setP({ ...p, commissionPct: n })} />)}</View>
            <Txt variant="label">Credit the referrer if the friend buys within</Txt>
            <View style={shared.chips}>{[7, 30, 60, 90].map((n) => <Chip key={n} label={`${n} days`} active={p.windowDays === n} onPress={() => setP({ ...p, windowDays: n })} />)}</View>
            <ToggleRow title="Anyone enrolled can join" sub="Off = you approve each affiliate" value={p.open} onChange={(v) => setP({ ...p, open: v })} />
            <TextField label="Terms shown to affiliates" value={p.terms} onChangeText={(v) => setP({ ...p, terms: v })} multiline />
            <Txt variant="caption" color={c.muted}>Commission applies to your direct sales only — never on Bodhin marketplace sales (Bodhin’s 20% already applies) and never on someone’s own purchase. It waits 7 days for refunds, then becomes payable.</Txt>
          </Card>
          <Txt variant="label">Affiliates ({d.affiliates.length})</Txt>
          {d.affiliates.length === 0 && <Card><Txt color={c.muted} center>No affiliates yet.</Txt></Card>}
          {d.affiliates.map(({ a: af, sales, earned, due }) => (
            <Card key={af.id} title={af.code} right={<Pill text={af.status === 'active' ? 'Active' : af.status === 'pending' ? 'Waiting approval' : 'Blocked'} tone={af.status === 'active' ? 'success' : af.status === 'pending' ? 'warning' : 'neutral'} />}>
              <Txt variant="bodyStrong">{af.name}</Txt>
              <Txt variant="caption" color={c.muted}>{af.clicks} clicks · {sales} sales · {inr(earned)} earned · joined {ago(af.joinedAt)}</Txt>
              {owner && (
                <View style={shared.row}>
                  {af.status !== 'active' && <Button title="Approve" size="md" style={{ flex: 1 }} onPress={async () => { if (await a.run(() => affiliatesApi.setStatus(userId, af.id, 'active'), `${af.name} approved.`)) load(); }} />}
                  {af.status === 'active' && <Button title="Block" size="md" variant="outline" style={{ flex: 1 }} onPress={async () => { if (await a.run(() => affiliatesApi.setStatus(userId, af.id, 'blocked'), `${af.name} blocked.`)) load(); }} />}
                  <Button title={due ? `Mark ${inr(due)} paid` : 'Nothing due'} size="md" variant="outline" disabled={!due} style={{ flex: 1 }} onPress={async () => { if (await a.run(() => affiliatesApi.payOut(userId, af.id), `Marked paid. ${af.name} was notified.`)) load(); }} />
                </View>
              )}
            </Card>
          ))}
          <Card title="Recent referral sales">
            {d.commissions.length === 0 && <Txt variant="caption" color={c.muted}>None yet.</Txt>}
            {d.commissions.slice(0, 10).map((cm) => (
              <View key={cm.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Txt style={{ flex: 1 }} numberOfLines={1}>{cm.buyerName} · {inr(cm.orderInr)}</Txt>
                <Txt variant="label">{inr(cm.amountInr)} · {cm.status}</Txt>
              </View>
            ))}
          </Card>
        </>
      )}
    </Page>
  );
}
