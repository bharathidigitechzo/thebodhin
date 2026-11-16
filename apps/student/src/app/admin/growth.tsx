/** Super Admin · Growth: tool adoption, non-course sales per academy, affiliate dues, and showcase video moderation. */
import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { adminGrowth } from '@/api/growth2';
import { clipLength } from '@/core/growth2';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { BottomSheet, Chip, Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { PillTabs } from '@/ui/pickers';
import { Page, useAct, useData } from '@/ui/grow';
import { Card, KV, Stat, inr, shared } from '@/ui/section';

export default function AdminGrowth() {
  const { c } = useTheme();
  const [tab, setTab] = useState<'overview' | 'videos'>('overview');
  const { d, err, load, userId } = useData((u) => ({ g: adminGrowth.get(u), clips: (() => { try { return adminGrowth.clips(u); } catch { return null; } })() }));
  const a = useAct();
  const [blk, setBlk] = useState<{ id: string; title: string; reason: string } | null>(null);
  const [vf, setVf] = useState<'all' | 'live' | 'off'>('all');
  return (
    <Page title="Growth tools" sub="How academies use them" err={err} fallback="/admin/more" wide>
      {d && (
        <>
          {a.msg && <Banner tone="success" text={a.msg} />}
          <PillTabs tabs={[{ id: 'overview', label: 'Overview' }, { id: 'videos', label: `Showcase videos${d.clips ? ` (${d.clips.length})` : ''}` }]} value={tab} onChange={setTab} />
          {tab === 'overview' ? (
            <>
              <View style={shared.row}>
                <Stat v={inr(d.g.totals.sales)} l="Webinar, 1:1, product sales" />
                <Stat v={String(d.g.totals.orders)} l="Orders" />
                <Stat v={inr(d.g.totals.affiliateDue)} l="Affiliate dues (academies pay)" />
              </View>
              <Txt variant="caption" color={c.muted}>These sales go to each academy’s own gateway — Bodhin takes no commission on them. Shown here to see which tools drive value.</Txt>
              <Card title="Adoption">
                {d.g.adoption.map((x) => (
                  <View key={x.label} style={{ gap: 3 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt variant="caption">{x.label}</Txt><Txt variant="label">{x.using} using · {x.allowed} on plan</Txt></View>
                    <View style={{ height: 8, borderRadius: 4, backgroundColor: c.surfaceMuted }}><View style={{ height: 8, borderRadius: 4, width: `${x.allowed ? (x.using / x.allowed) * 100 : 0}%`, backgroundColor: c.primary }} /></View>
                  </View>
                ))}
              </Card>
              {d.g.rows.map(({ t, sales, count, use }) => (
                <Card key={t.id} title={t.branding.displayName} right={<Pill text={t.status === 'active' ? 'Active' : 'Suspended'} tone={t.status === 'active' ? 'success' : 'neutral'} />}>
                  <KV k="Non-course sales" v={`${inr(sales)} · ${count} orders`} />
                  <View style={shared.chips}>{use.map((u) => <Pill key={u.label} text={u.on ? `${u.label}: ${u.n}` : `${u.label}: not on plan`} tone={!u.on ? 'neutral' : u.n ? 'success' : 'warning'} />)}</View>
                  <Button title="Open tenant" size="md" variant="outline" onPress={() => router.push({ pathname: '/admin/tenant/[id]', params: { id: t.id } })} />
                </Card>
              ))}
            </>
          ) : !d.clips ? (
            <Banner tone="info" text="Your admin role can’t moderate showcase videos." />
          ) : (
            <>
              <Txt variant="caption" color={c.muted}>Videos educators allow on Bodhin’s pages and ads. Remove anything off-brand or misleading — the educator is told why, and it is logged in Audit.</Txt>
              <View style={shared.chips}>
                {(['all', 'live', 'off'] as const).map((k) => <Chip key={k} label={k === 'all' ? 'All' : k === 'live' ? 'Live on site' : 'Not live'} active={vf === k} onPress={() => setVf(k)} />)}
              </View>
              {d.clips.filter((x) => vf === 'all' || (vf === 'live' ? x.live : !x.live)).map(({ c: cl, course, academy, live, why }) => (
                <Card key={cl.id} title={academy} right={<Pill text={live ? 'Live' : why} tone={live ? 'success' : cl.blocked ? 'live' : 'neutral'} />}>
                  <Txt variant="bodyStrong">{cl.title}</Txt>
                  <Txt variant="caption" color={c.muted}>{course.title} · {cl.lessonId ? 'Lesson' : 'Promo video'} · {clipLength(cl.durationSec)} · {cl.plays} plays</Txt>
                  {cl.blockReason && <Txt variant="caption" color={c.danger}>Reason: {cl.blockReason}</Txt>}
                  {cl.blocked
                    ? <Button title="Restore" size="md" variant="outline" onPress={async () => { if (await a.run(() => adminGrowth.block(userId, cl.id, false), 'Restored.')) load(); }} />
                    : <Button title="Remove from Bodhin pages" size="md" variant="outline" onPress={() => { setBlk({ id: cl.id, title: cl.title, reason: '' }); a.setFe(null); }} />}
                </Card>
              ))}
            </>
          )}
        </>
      )}
      <BottomSheet open={!!blk} onClose={() => setBlk(null)} title="Remove video" footer={<Button title="Remove" size="md" style={{ flex: 1 }} onPress={async () => { if (blk && (await a.run(() => adminGrowth.block(userId, blk.id, true, blk.reason), 'Removed. The educator was notified.'))) { setBlk(null); load(); } }} />}>
        {blk && (
          <View style={{ gap: 10 }}>
            <Txt variant="bodyStrong">{blk.title}</Txt>
            <View style={shared.chips}>{['Poor audio/video quality', 'Misleading claims', 'Not related to the course', 'Contains contact details'].map((r) => <Chip key={r} label={r} active={blk.reason === r} onPress={() => setBlk({ ...blk, reason: r })} />)}</View>
            <TextField label="Reason (educator sees this)" value={blk.reason} onChangeText={(v) => setBlk({ ...blk, reason: v })} error={a.err('reason')} />
          </View>
        )}
      </BottomSheet>
    </Page>
  );
}
