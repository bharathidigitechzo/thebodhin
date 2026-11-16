/** Super Admin · Pilot success: the blueprint's pilot measures in one place (activation funnel, time to first
 *  publish, active learners, refunds by channel, commission, trials/locks, usage). */
import React from 'react';
import { View } from 'react-native';
import { pilotOps } from '@/api/client';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { ProgressBar } from '@/ui/kit';
import { Page, useData } from '@/ui/grow';
import { Card, KV, Stat, inr, shared } from '@/ui/section';

export default function Pilot() {
  const { c } = useTheme();
  const { d, err } = useData((u) => pilotOps.overview(u));
  return (
    <Page title="Pilot success" sub="Is the pilot working?" err={err} fallback="/admin/more" wide>
      {d && (
        <>
          <View style={shared.row}>
            <Stat v={d.medianDaysToPublish == null ? '—' : `${d.medianDaysToPublish} d`} l="To first course" />
            <Stat v={`${d.onboardingPct}%`} l="Onboarded" />
            <Stat v={`${d.activePct}%`} l="Learners active 7d" />
          </View>

          <Card title="Academy activation">
            <Txt variant="caption" color={c.muted}>From approval to a working academy. Each step needs the one before it.</Txt>
            {d.funnel.map((f) => {
              const pct = d.funnel[0].n ? Math.round((f.n / d.funnel[0].n) * 100) : 0;
              return (
                <View key={f.label} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Txt variant="label">{f.label}</Txt>
                    <Txt variant="label" color={c.inkSoft}>{f.n} · {pct}%</Txt>
                  </View>
                  <ProgressBar pct={pct} color={pct >= 60 ? c.success : pct >= 30 ? c.warning : c.danger} height={8} />
                </View>
              );
            })}
          </Card>

          <Card title="Refunds by channel">
            {d.channels.map((ch) => (
              <KV key={ch.ch} k={ch.label} v={`${ch.orders} orders · ${ch.refunded} refunded (${ch.rate}%) · ${inr(ch.gmv)}`} />
            ))}
            <Txt variant="caption" color={c.muted}>A refund rate above 5% on one channel is worth a look (course quality or expectation gap).</Txt>
          </Card>

          <Card title="Money & subscriptions">
            <KV k="Marketplace commission, last 30 days" v={inr(d.commission30)} strong />
            <KV k="On a free trial" v={String(d.subs.trial)} />
            <KV k="Paying" v={String(d.subs.paying)} />
            <KV k="Payment due (grace)" v={String(d.subs.grace)} />
            <KV k="Locked (trial ended / unpaid)" v={String(d.subs.locked)} />
          </Card>

          <Card title="Learners & usage">
            <KV k="Learners with a course" v={String(d.learners)} />
            <KV k="Active in the last 7 days" v={String(d.active7)} />
            <KV k="Video stored (all academies)" v={`${d.usage.storageGb} GB · ${d.usage.perAcademyGb} GB per academy`} />
            <KV k="Live room-hours this month" v={`${d.usage.liveHours} h`} />
            <Txt variant="caption" color={c.muted}>Storage and live hours drive Bodhin’s server cost per academy. Compare with the plan prices before the pilot ends.</Txt>
          </Card>
        </>
      )}
    </Page>
  );
}
