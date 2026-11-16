/** Bundles (combo price for 2–10 courses) and checkout add-ons (order bump). */
import React, { useState } from 'react';
import { Share, View } from 'react-native';
import { router } from 'expo-router';
import { bundlesApi, upsellApi } from '@/api/growth2';
import { bundleSavings, upsellPrice } from '@/core/growth2';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { BottomSheet, Chip, Pill } from '@/ui/kit';
import { Banner, Checkbox } from '@/ui/misc';
import { PillTabs } from '@/ui/pickers';
import { Page, useAct, useData } from '@/ui/grow';
import { Card, KV, ToggleRow, inr, shared } from '@/ui/section';

export default function Bundles() {
  const { c } = useTheme();
  const [tab, setTab] = useState<'bundles' | 'addons'>('bundles');
  const { d, err, load, userId } = useData((u) => ({ b: bundlesApi.list(u), u: upsellApi.list(u) }));
  const a = useAct();
  const [bf, setBf] = useState<{ id?: string; title: string; courseIds: string[]; price: string; publish: boolean } | null>(null);
  const [uf, setUf] = useState<{ courseId: string; offerCourseId: string; discountPct: number; headline: string; enabled: boolean } | null>(null);
  const owner = d?.b.ctx.role === 'owner';
  const list = bf && d ? bf.courseIds.reduce((s, id) => s + (d.b.courses.find((x) => x.id === id)?.priceInr ?? 0), 0) : 0;
  const title = (id: string) => d?.b.courses.find((x) => x.id === id)?.title ?? '';
  return (
    <Page title="Bundles & add-ons" sub="Sell more per student" err={err} footer={d && owner && <Button title={tab === 'bundles' ? 'New bundle' : 'New add-on offer'} iconLeft="add" size="md" style={{ flex: 1 }} onPress={() => { a.setFe(null); tab === 'bundles' ? setBf({ title: '', courseIds: [], price: '', publish: true }) : setUf({ courseId: d.b.courses[0]?.id ?? '', offerCourseId: d.b.courses[1]?.id ?? '', discountPct: 20, headline: 'Add this course and save', enabled: true }); }} />}>
      {d && (
        <>
          {a.msg && <Banner tone="success" text={a.msg} />}
          <PillTabs tabs={[{ id: 'bundles', label: 'Bundles' }, { id: 'addons', label: 'Checkout add-ons' }]} value={tab} onChange={setTab} />
          {tab === 'bundles' ? (
            <>
              <Txt variant="caption" color={c.muted}>A bundle is one price for several courses. Learners who already own a course pay only for the rest.</Txt>
              {d.b.rows.length === 0 && <Card><Txt color={c.muted} center>No bundles yet.</Txt></Card>}
              {d.b.rows.map(({ b, list: l }) => (
                <Card key={b.id} title={`${b.courseIds.length} courses · ${bundleSavings(b.priceInr, l).pct}% off`} right={<Pill text={b.status === 'published' ? 'On sale' : 'Draft'} tone={b.status === 'published' ? 'success' : 'warning'} />}>
                  <Txt variant="bodyStrong">{b.title}</Txt>
                  <Txt variant="caption" color={c.muted}>{inr(b.priceInr)} instead of {inr(l)} · {b.sales} sold</Txt>
                  <Txt variant="caption" color={c.inkSoft}>{b.courseIds.map(title).join(' + ')}</Txt>
                  <View style={shared.row}>
                    <Button title="Share" size="md" variant="outline" iconLeft="share-social-outline" style={{ flex: 1 }} onPress={async () => { try { await Share.share({ message: `${b.title}: https://${d.b.ctx.host}/bundle/${b.id}` }); } catch { /* cancelled */ } }} />
                    <Button title="View" size="md" variant="outline" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/bundle/[id]', params: { id: b.id } })} />
                    {owner && <Button title="Edit" size="md" variant="outline" style={{ flex: 1 }} onPress={() => { setBf({ id: b.id, title: b.title, courseIds: [...b.courseIds], price: String(b.priceInr), publish: b.status === 'published' }); a.setFe(null); }} />}
                  </View>
                </Card>
              ))}
            </>
          ) : (
            <>
              <Txt variant="caption" color={c.muted}>An add-on shows as a tick-box on a course’s checkout: “Also add X at Y% off”. One tap, no extra form.</Txt>
              {d.u.rows.length === 0 && <Card><Txt color={c.muted} center>No add-on offers yet.</Txt></Card>}
              {d.u.rows.map((u) => {
                const oc = d.u.courses.find((x) => x.id === u.offerCourseId);
                return (
                  <Card key={u.courseId} title={`On: ${title(u.courseId)}`} right={<Pill text={u.enabled ? 'On' : 'Off'} tone={u.enabled ? 'success' : 'neutral'} />}>
                    <Txt variant="bodyStrong">{u.headline}</Txt>
                    <Txt variant="caption" color={c.muted}>{oc?.title} at {inr(upsellPrice(oc?.priceInr ?? 0, u.discountPct))} ({u.discountPct}% off)</Txt>
                    <KV k="Taken" v={`${u.taken} of ${u.shown} checkouts (${u.shown ? Math.round((u.taken / u.shown) * 100) : 0}%)`} />
                    {owner && <Button title="Edit" size="md" variant="outline" onPress={() => { setUf({ ...u }); a.setFe(null); }} />}
                  </Card>
                );
              })}
            </>
          )}
        </>
      )}
      <BottomSheet open={!!bf} onClose={() => setBf(null)} title={bf?.id ? 'Edit bundle' : 'New bundle'} footer={<>
        {bf?.id && <Button title="Archive" variant="outline" size="md" onPress={async () => { if (await a.run(() => bundlesApi.archive(userId, bf.id!), 'Archived. Buyers keep access.')) { setBf(null); load(); } }} />}
        <Button title={bf?.publish ? 'Publish' : 'Save draft'} size="md" style={{ flex: 1 }} onPress={async () => { if (bf && (await a.run(() => bundlesApi.save(userId, { ...bf, priceInr: Number(bf.price) || 0 }), 'Bundle saved.'))) { setBf(null); load(); } }} />
      </>}>
        {bf && d && (
          <View style={{ gap: 10 }}>
            <TextField label="Bundle name" value={bf.title} onChangeText={(v) => setBf({ ...bf, title: v })} error={a.err('title')} />
            <Txt variant="label">Courses</Txt>
            {d.b.courses.map((co) => (
              <Checkbox key={co.id} label={co.title} checked={bf.courseIds.includes(co.id)} onChange={(v) => setBf({ ...bf, courseIds: v ? [...bf.courseIds, co.id] : bf.courseIds.filter((x) => x !== co.id) })}>
                <View style={{ flex: 1 }}><Txt variant="label">{co.title}</Txt><Txt variant="caption" color={c.muted}>{inr(co.priceInr)}</Txt></View>
              </Checkbox>
            ))}
            {a.err('courses') && <Banner text={a.err('courses')!} />}
            <TextField label="Bundle price (₹)" value={bf.price} onChangeText={(v) => setBf({ ...bf, price: v.replace(/\D/g, '') })} keyboardType="number-pad" error={a.err('price')} hint={list ? `Separately ${inr(list)}${Number(bf.price) ? ` · learner saves ${inr(Math.max(0, list - Number(bf.price)))}` : ''}` : undefined} />
            <ToggleRow title="Publish now" value={bf.publish} onChange={(v) => setBf({ ...bf, publish: v })} />
            {a.general && <Banner text={a.general} />}
          </View>
        )}
      </BottomSheet>
      <BottomSheet open={!!uf} onClose={() => setUf(null)} title="Checkout add-on" footer={<Button title="Save" size="md" style={{ flex: 1 }} onPress={async () => { if (uf && (await a.run(() => upsellApi.save(userId, uf), 'Add-on saved.'))) { setUf(null); load(); } }} />}>
        {uf && d && (
          <View style={{ gap: 10 }}>
            <Txt variant="label">When someone buys</Txt>
            <View style={shared.chips}>{d.u.courses.map((co) => <Chip key={co.id} label={co.title.slice(0, 24)} active={uf.courseId === co.id} onPress={() => setUf({ ...uf, courseId: co.id })} />)}</View>
            <Txt variant="label">Offer them</Txt>
            <View style={shared.chips}>{d.u.courses.filter((co) => co.id !== uf.courseId).map((co) => <Chip key={co.id} label={co.title.slice(0, 24)} active={uf.offerCourseId === co.id} onPress={() => setUf({ ...uf, offerCourseId: co.id })} />)}</View>
            {a.err('course') && <Banner text={a.err('course')!} />}
            <Txt variant="label">Discount</Txt>
            <View style={shared.chips}>{[10, 20, 30, 40].map((p) => <Chip key={p} label={`${p}% off`} active={uf.discountPct === p} onPress={() => setUf({ ...uf, discountPct: p })} />)}</View>
            <TextField label="Headline" value={uf.headline} onChangeText={(v) => setUf({ ...uf, headline: v })} error={a.err('headline')} />
            <ToggleRow title="Show on checkout" value={uf.enabled} onChange={(v) => setUf({ ...uf, enabled: v })} />
          </View>
        )}
      </BottomSheet>
    </Page>
  );
}
