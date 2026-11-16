/** Super Admin · Live classes: what is live now, today's timetable across academies, room-hour usage, instructor clashes. */
import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { liveOps } from '@/api/client';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { Page, useData } from '@/ui/grow';
import { Card, KV, Stat, shared } from '@/ui/section';

const tm = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
const dt = (iso: string) => new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export default function AdminLive() {
  const { c } = useTheme();
  const { d, err } = useData((u) => liveOps.overview(u));
  return (
    <Page title="Live classes" sub="Across every academy" err={err} fallback="/admin/more" wide>
      {d && (
        <>
          {d.paused && <Banner text="Live classes are paused platform-wide (Feature flags). Nobody can schedule or join." />}
          <View style={shared.row}>
            <Stat v={String(d.liveNow.length)} l="Live now" />
            <Stat v={String(d.today.length)} l="Today" />
            <Stat v={String(d.weekCount)} l="This week" />
            <Stat v={String(d.clashes.length)} l="Clashes" />
          </View>
          <Button title="Pause or resume live classes" variant="outline" size="md" iconLeft="toggle-outline" onPress={() => router.push('/admin/flags')} />

          <Card title="Live now">
            {d.liveNow.length === 0 && <Txt color={c.muted}>No class is live right now.</Txt>}
            {d.liveNow.map((r) => (
              <View key={r.s.id} style={{ gap: 2 }}>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><Pill text="LIVE" tone="live" icon="radio" /><Txt variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>{r.s.title}</Txt></View>
                <Txt variant="caption" color={c.muted}>{r.academy} · {tm(r.s.startsAt)} – {tm(r.s.endsAt)} · {r.expected} expected</Txt>
              </View>
            ))}
          </Card>

          <Card title="Today’s timetable">
            {d.today.length === 0 && <Txt color={c.muted}>No classes today.</Txt>}
            {d.today.map((r) => (
              <View key={r.s.id} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <Txt variant="label" style={{ width: 70 }}>{tm(r.s.startsAt)}</Txt>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt variant="bodyStrong" numberOfLines={1}>{r.s.title}</Txt>
                  <Txt variant="caption" color={c.muted} numberOfLines={1}>{r.academy}{r.s.batchName ? ` · ${r.s.batchName}` : ''} · {r.s.mode === 'online' ? 'Online' : 'In person'}</Txt>
                </View>
                <Pill text={r.s.state === 'live' ? 'Live' : r.s.state === 'conducted' ? 'Done' : 'Later'} tone={r.s.state === 'live' ? 'live' : r.s.state === 'conducted' ? 'neutral' : 'info'} />
              </View>
            ))}
          </Card>

          {d.clashes.length > 0 && (
            <Card title="Instructor double-bookings">
              <Txt variant="caption" color={c.muted}>Same instructor, overlapping time. New clashes are blocked; these came from older data or imports. Ask the academy to move one.</Txt>
              {d.clashes.map((r) => (
                <View key={r.s.id} style={{ gap: 2 }}>
                  <Txt variant="bodyStrong" numberOfLines={1}>{r.s.title}</Txt>
                  <Txt variant="caption" color={c.muted}>{r.academy} · {r.s.batchName} · {dt(r.s.startsAt)}</Txt>
                </View>
              ))}
            </Card>
          )}

          <Card title="Room-hours by academy (this month)">
            {d.tenants.length === 0 && <Txt color={c.muted}>No academy has used live classes yet.</Txt>}
            {d.tenants.map((x) => (
              <View key={x.t.id} style={{ gap: 4 }}>
                <KV k={x.name} v={x.hours ? `${x.hours.used} / ${x.hours.limit ?? '∞'} h${x.hours.pct != null ? ` (${x.hours.pct}%)` : ''} · ${x.week} this week` : `${x.week} this week`} />
                {x.hours && x.hours.limit != null && (
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: c.surfaceMuted }}>
                    <View style={{ height: 8, borderRadius: 4, width: `${Math.min(100, x.hours.pct ?? 0)}%`, backgroundColor: x.hours.level === 'ok' ? c.primary : x.hours.level === 'limit' ? c.danger : c.warning }} />
                  </View>
                )}
                <Button title="Open academy" size="md" variant="ghost" onPress={() => router.push({ pathname: '/admin/tenant/[id]', params: { id: x.t.id } })} />
              </View>
            ))}
          </Card>
        </>
      )}
    </Page>
  );
}
