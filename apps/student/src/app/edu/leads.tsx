/** Leads CRM: enquiries from site, webinars, ads, walk-ins → pipeline with follow-ups (Nrich-style). */
import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { leadsApi } from '@/api/growth';
import { LEAD_SOURCES, type LeadSource, type LeadStage } from '@/core/growth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { BottomSheet, Chip, Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { Page, ago, useAct, useData, when } from '@/ui/grow';
import { Card, Stat, shared } from '@/ui/section';

type F = LeadStage | 'all' | 'due';
const blank = () => ({ name: '', phone: '', email: '', courseId: '', source: 'phone' as LeadSource, note: '' });

export default function Leads() {
  const { c } = useTheme();
  const [f, setF] = useState<F>('due');
  const [q, setQ] = useState('');
  const { d, err, load, userId } = useData((u) => leadsApi.list(u, f, q));
  const [form, setForm] = useState<ReturnType<typeof blank> | null>(null);
  const a = useAct();
  // filter/search changes reload synchronously
  const view = d ? leadsApi.list(userId, f, q) : null;
  const save = async () => {
    if (!form) return;
    const ok = await a.run(() => {
      const r = leadsApi.create(userId, { ...form, courseId: form.courseId || undefined, email: form.email || undefined });
      a.setMsg(r.duplicate ? 'This number was already a lead — we added the new enquiry to their history.' : `${form.name} added. Follow-up set for 2 hours from now.`);
    });
    if (ok) { setForm(null); load(); }
  };
  const tone = (s: string) => (s === 'overdue' ? 'live' : s === 'today' ? 'warning' : 'neutral') as 'live' | 'warning' | 'neutral';
  return (
    <Page title="Leads" sub="Every enquiry, one follow-up at a time" err={err} footer={<>
      <Button title="Export CSV" variant="outline" size="md" iconLeft="download-outline" onPress={async () => { try { await Share.share({ message: leadsApi.csv(userId) }); } catch { /* cancelled */ } }} />
      <Button title="Add lead" iconLeft="add" size="md" style={{ flex: 1 }} onPress={() => { setForm(blank()); a.setFe(null); }} />
    </>}>
      {view && (
        <>
          {a.msg && <Banner tone="success" text={a.msg} />}
          <View style={shared.row}>
            <Stat v={String(view.stats.due)} l="Follow-ups due" tone={view.stats.overdue ? c.danger : undefined} />
            <Stat v={String(view.stats.open)} l="Open leads" />
            <Stat v={`${view.stats.winRate}%`} l="Joined (closed)" />
          </View>
          <TextField label="Search" placeholder="Name, phone or course" value={q} onChangeText={setQ} icon="search" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Chip label={`Due (${view.stats.due})`} active={f === 'due'} onPress={() => setF('due')} />
            <Chip label={`All (${view.stats.total})`} active={f === 'all'} onPress={() => setF('all')} />
            {view.stages.map((s) => <Chip key={s.id} label={`${s.label} (${view.stats.by[s.id]})`} active={f === s.id} onPress={() => setF(s.id)} />)}
          </ScrollView>
          {view.rows.length === 0 && <Card><Txt color={c.muted} center>{f === 'due' ? 'No follow-ups due. Nice work! 🎯' : 'No leads here yet.'}</Txt></Card>}
          {view.rows.map(({ l, course, follow }) => (
            <Pressable key={l.id} onPress={() => router.push({ pathname: '/edu/lead/[id]', params: { id: l.id } })} style={[styles.row, { backgroundColor: c.surface, borderColor: follow === 'overdue' ? c.danger : c.border }]} accessibilityRole="button" accessibilityLabel={`${l.name}, ${l.stage}`}>
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Txt variant="bodyStrong" numberOfLines={1}>{l.name}</Txt>
                  <Pill text={view.stages.find((s) => s.id === l.stage)!.label} tone={l.stage === 'won' ? 'success' : l.stage === 'lost' ? 'neutral' : 'info'} />
                </View>
                <Txt variant="caption" color={c.muted} numberOfLines={1}>{course || 'No course picked'} · {LEAD_SOURCES.find((s) => s.id === l.source)?.label} · {ago(l.createdAt)}</Txt>
                {follow !== 'none' && l.nextFollowUpAt && <Pill text={`${follow === 'overdue' ? 'Overdue' : follow === 'today' ? 'Today' : 'Next'} · ${when(l.nextFollowUpAt)}`} tone={tone(follow)} icon="alarm-outline" />}
              </View>
              <Pressable onPress={() => Linking.openURL(`tel:+91${l.phone}`)} hitSlop={8} style={[styles.call, { backgroundColor: c.primarySoft }]} accessibilityRole="button" accessibilityLabel={`Call ${l.name}`}>
                <Ionicons name="call" size={18} color={c.primary} />
              </Pressable>
            </Pressable>
          ))}
        </>
      )}
      <BottomSheet open={!!form} onClose={() => setForm(null)} title="New lead" footer={<Button title="Save lead" size="md" style={{ flex: 1 }} loading={a.busy} onPress={save} />}>
        {form && d && (
          <View style={{ gap: 10 }}>
            <TextField label="Name" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} error={a.err('name')} autoFocus />
            <TextField label="Mobile" prefix="+91" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v.replace(/[^\d]/g, '').slice(0, 10) })} keyboardType="phone-pad" error={a.err('phone')} />
            <TextField label="Email (optional)" value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} keyboardType="email-address" autoCapitalize="none" error={a.err('email')} />
            <Txt variant="label">Interested in</Txt>
            <View style={shared.chips}>
              <Chip label="Not sure" active={!form.courseId} onPress={() => setForm({ ...form, courseId: '' })} />
              {d.courses.map((co) => <Chip key={co.id} label={co.title.length > 26 ? `${co.title.slice(0, 25)}…` : co.title} active={form.courseId === co.id} onPress={() => setForm({ ...form, courseId: co.id })} />)}
            </View>
            <Txt variant="label">Came from</Txt>
            <View style={shared.chips}>{LEAD_SOURCES.map((s) => <Chip key={s.id} label={s.label} active={form.source === s.id} onPress={() => setForm({ ...form, source: s.id })} />)}</View>
            <TextField label="Note (optional)" value={form.note} onChangeText={(v) => setForm({ ...form, note: v })} multiline />
            {a.general && <Banner text={a.general} />}
          </View>
        )}
      </BottomSheet>
    </Page>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 18, padding: 14 },
  call: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
