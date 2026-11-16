/** Analytics: revenue trend, where money comes from, top courses, learners; funnel + countries on Institute. */
import React, { useState } from 'react';
import { Share, View } from 'react-native';
import { router } from 'expo-router';
import { analyticsApi } from '@/api/growth2';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { Pill } from '@/ui/kit';
import { PillTabs } from '@/ui/pickers';
import { Page } from '@/ui/grow';
import { ApiError } from '@/api/client';
import { Card, Stat, inr, shared } from '@/ui/section';

function Bars({ rows, fmt, color }: { rows: { label: string; v: number }[]; fmt: (n: number) => string; color: string }) {
  const { c } = useTheme();
  const max = Math.max(1, ...rows.map((r) => r.v));
  return (
    <View style={{ gap: 8 }}>
      {rows.map((r) => (
        <View key={r.label} style={{ gap: 3 }} accessibilityLabel={`${r.label}: ${fmt(r.v)}`}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <Txt variant="caption" color={c.inkSoft} numberOfLines={1} style={{ flex: 1 }}>{r.label}</Txt>
            <Txt variant="label">{fmt(r.v)}</Txt>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: c.surfaceMuted }}><View style={{ height: 8, borderRadius: 4, width: `${(r.v / max) * 100}%`, backgroundColor: color }} /></View>
        </View>
      ))}
    </View>
  );
}

export default function Analytics() {
  const { c } = useTheme();
  const { session } = useAuth();
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  let d: ReturnType<typeof analyticsApi.get> | null = null, err: ApiError | null = null;
  try { d = analyticsApi.get(session?.user.id ?? '', Number(days) as 7 | 30 | 90); } catch (e) { err = e instanceof ApiError ? e : new ApiError('error', 'Not available'); }
  const max = d ? Math.max(1, ...d.series.map((s) => s.v)) : 1;
  return (
    <Page title="Analytics" sub="What’s working, what to fix" err={err} wide footer={d && <Button title="Export CSV" variant="outline" size="md" iconLeft="download-outline" style={{ flex: 1 }} onPress={() => Share.share({ message: analyticsApi.csv(session!.user.id, Number(days) as 7 | 30 | 90) }).catch(() => undefined)} />}>
      {d && (
        <>
          <PillTabs tabs={[{ id: '7', label: '7 days' }, { id: '30', label: '30 days' }, { id: '90', label: '90 days' }]} value={days} onChange={setDays} />
          <View style={shared.row}>
            <Stat v={inr(d.kpi.revenue)} l="You earned" />
            <Stat v={String(d.kpi.orders)} l="Sales" />
            <Stat v={inr(d.kpi.aov)} l="Avg order" />
          </View>
          <View style={shared.row}>
            <Stat v={String(d.kpi.learners)} l="Learners" />
            <Stat v={String(d.kpi.active7)} l="Active this week" />
            <Stat v={String(d.kpi.refunds)} l="Refunds" tone={d.kpi.refunds ? c.danger : undefined} />
          </View>
          <Card title={`Daily earnings · last ${d.series.length} days`}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 2 }} accessibilityLabel="Daily earnings chart">
              {d.series.map((s) => <View key={s.day} style={{ flex: 1, height: `${Math.max(2, (s.v / max) * 100)}%`, backgroundColor: s.v ? c.primary : c.surfaceMuted, borderRadius: 3 }} />)}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt variant="caption" color={c.muted}>{d.series[0]?.label}</Txt><Txt variant="caption" color={c.muted}>Today</Txt></View>
          </Card>
          <Card title="Where your money comes from"><Bars rows={d.byChannel} fmt={inr} color={c.primary} /></Card>
          <Card title="Top courses">{d.top.length ? <Bars rows={d.top.map((t) => ({ label: `${t.title} · ${t.orders} sales`, v: t.v }))} fmt={inr} color={c.success} /> : <Txt variant="caption" color={c.muted}>No sales in this period.</Txt>}</Card>
          {d.pro && d.funnel ? (
            <>
              <Card title="Course page → paid">
                <Bars rows={[{ label: 'Viewed a course page', v: d.funnel.views }, { label: `Started checkout (${d.funnel.viewToCheckout}%)`, v: d.funnel.checkouts }, { label: `Paid (${d.funnel.checkoutToPaid}% of checkouts)`, v: d.funnel.paid }]} fmt={(n) => String(n)} color={c.info} />
                <Txt variant="caption" color={c.muted}>{d.funnel.overall}% of visitors buy. {d.funnel.checkoutToPaid < 40 ? 'Many people leave at checkout — turn on the “Checkout left unfinished” automation or EMI.' : 'Checkout converts well — bring more visitors (webinars, referrals).'}</Txt>
              </Card>
              <Card title="Countries"><Bars rows={d.countries} fmt={(n) => String(n)} color={c.primary} /></Card>
            </>
          ) : (
            <Card title="Funnel & countries" right={<Pill text="Institute" tone="gold" icon="lock-closed" />}>
              <Txt variant="caption" color={c.muted}>See where visitors drop off and which countries buy. Available on the Institute plan.</Txt>
              <Button title="See plans" size="md" variant="outline" onPress={() => router.push('/edu/subscription')} />
            </Card>
          )}
        </>
      )}
    </Page>
  );
}
