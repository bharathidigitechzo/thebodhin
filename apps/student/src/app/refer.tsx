/** Learner "Refer & earn": join an academy's program, copy/share the link, see earnings. */
import React from 'react';
import { Share, View } from 'react-native';
import { affiliatesApi } from '@/api/growth2';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { Page, useAct, useData } from '@/ui/grow';
import { Card, KV, inr } from '@/ui/section';

export default function Refer() {
  const { c } = useTheme();
  const { d, err, load, userId } = useData(affiliatesApi.mine);
  const a = useAct();
  return (
    <Page title="Refer & earn" sub="Share academies you learn with" err={err} fallback="/profile">
      {a.msg && <Banner tone="success" text={a.msg} />}
      {a.general && <Banner text={a.general} />}
      {d && d.length === 0 && <Card><Txt color={c.muted} center>None of your academies run a referral program yet.</Txt></Card>}
      {d?.map((x) => (
        <Card key={x.tenantId} title={x.academy} right={x.a ? <Pill text={x.a.status === 'active' ? 'Active' : x.a.status === 'pending' ? 'Waiting approval' : 'Paused'} tone={x.a.status === 'active' ? 'success' : 'warning'} /> : <Pill text={`${x.prog.commissionPct}% per sale`} tone="gold" />}>
          <Txt variant="caption" color={c.inkSoft}>{x.prog.terms}</Txt>
          {x.a ? (
            <>
              <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 10 }}><Txt variant="label" selectable>{x.link}</Txt></View>
              <Button title="Share my link" iconLeft="share-social-outline" disabled={x.a.status !== 'active'} onPress={async () => { try { await Share.share({ message: `I learn with ${x.academy} — check their courses: ${x.link}` }); } catch { /* cancelled */ } }} />
              <KV k="Clicks" v={String(x.a.clicks)} />
              <KV k="Sales" v={String(x.sales)} />
              <KV k="Earned" v={inr(x.earned)} strong />
              <KV k="In refund window" v={inr(x.pending)} />
              <KV k="Paid to you" v={inr(x.paid)} />
            </>
          ) : (
            <Button title={`Join · earn ${x.prog.commissionPct}%`} onPress={async () => { if (await a.run(() => affiliatesApi.join(userId, x.tenantId), x.prog.open ? 'You’re in! Share your link.' : 'Request sent. The academy will approve you.')) load(); }} />
          )}
        </Card>
      ))}
      <Txt variant="caption" color={c.muted}>You earn when a friend buys within the academy’s window using your link. Your own purchases don’t count.</Txt>
    </Page>
  );
}
