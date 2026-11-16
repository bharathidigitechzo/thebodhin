/** Public pricing — every number comes from the plan catalogue (pricing document). Includes a plan finder. */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { marketing, marketingX } from '@/api/growth2';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { Chip, Pill } from '@/ui/kit';
import { Checkbox } from '@/ui/misc';
import { PillTabs } from '@/ui/pickers';
import { Grid, useLayout } from '@/ui/responsive';
import { Eyebrow, Headline, PublicFrame } from '@/ui/publicFrame';
import { Chevron, Collapse, Reveal, Swap, useReduceMotion } from '@/ui/motion';
import { inr } from '@/ui/section';

const FAQ: [string, string][] = [
  ['Do you take a cut of my sales?', 'Not on your own students — they pay you directly through your gateway. Bodhin keeps a marketplace commission only when a student finds you through Bodhin, and listing there is optional.'],
  ['What happens when I reach a limit?', 'You get a warning at 70% and 85%. At 100%, new enrolments or uploads pause until you upgrade or add a pack. Existing students keep full access.'],
  ['Can I change plans later?', 'Yes. Upgrades apply immediately and unused time is credited. Downgrades apply at renewal, once your usage fits the smaller plan.'],
  ['Is the annual price the full charge?', 'Yes. The annual amount shown is what you pay for 12 months, before GST.'],
  ['What happens after the trial?', 'You choose a plan to keep your academy open. Your courses and students stay as they are.'],
];
const NEEDS: [string, string][] = [['webinars', 'Webinars'], ['community', 'Community'], ['crm', 'Leads CRM'], ['emi', 'EMI'], ['multi_tutor', 'More than one tutor'], ['custom_domain', 'My own domain included'], ['multi_currency', 'Students abroad']];
const SIZES = [30, 100, 300, 1000, 2500];

function Answer({ q, a }: { q: string; a: string }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: c.border }}>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 12 }}>
        <Txt variant="bodyStrong" style={{ flex: 1 }}>{q}</Txt>
        <Chevron open={open} color={c.primary} />
      </Pressable>
      <Collapse open={open}><Txt color={c.inkSoft} style={{ paddingBottom: 14 }}>{a}</Txt></Collapse>
    </View>
  );
}

export default function Pricing() {
  const { c } = useTheme();
  const { isDesktop } = useLayout();
  const reduce = useReduceMotion();
  const d = marketing.pricing();
  const [bill, setBill] = useState<'monthly' | 'annual'>('monthly');
  const [students, setStudents] = useState(100);
  const [needs, setNeeds] = useState<string[]>([]);
  const fit = marketingX.findPlan(students, needs);
  const priced = d.plans.filter(({ p }) => p.monthlyInr != null);
  const ent = d.plans.find(({ p }) => p.monthlyInr == null);
  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return;
    glow.setValue(0);
    Animated.sequence([Animated.timing(glow, { toValue: 1, duration: 180, useNativeDriver: Platform.OS !== 'web' }), Animated.timing(glow, { toValue: 0, duration: 260, useNativeDriver: Platform.OS !== 'web' })]).start();
  }, [fit.id, glow, reduce]);
  return (
    <PublicFrame primary={{ title: `Start with ${fit.name}`, to: '/apply' }} secondary={{ title: 'All features', to: '/features' }}>
      <View style={{ gap: 12, alignItems: isDesktop ? 'center' : 'flex-start' }}>
        <Eyebrow>Pricing</Eyebrow>
        <Headline size="xl" center={isDesktop}>A flat fee. Your students pay you.</Headline>
        <Txt color={c.inkSoft} center={isDesktop} style={{ fontSize: 17, lineHeight: 26, maxWidth: 620 }}>{d.trialDays}-day Growth trial after approval. No card needed to apply.</Txt>
      </View>

      {/* plan finder */}
      <Reveal>
        <View style={[styles.finder, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Txt variant="heading">Which plan fits me?</Txt>
          <Txt variant="label" color={c.muted}>How many active students?</Txt>
          <View style={styles.chips}>{SIZES.map((n) => <Chip key={n} label={n >= 2500 ? '1,500+' : `Up to ${n.toLocaleString('en-IN')}`} active={students === n} onPress={() => setStudents(n)} />)}</View>
          <Txt variant="label" color={c.muted}>I also need</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 18 }}>
            {NEEDS.map(([k, l]) => <View key={k} style={{ minWidth: 190 }}><Checkbox label={l} checked={needs.includes(k)} onChange={(v) => setNeeds(v ? [...needs, k] : needs.filter((x) => x !== k))}><Txt variant="label">{l}</Txt></Checkbox></View>)}
          </View>
          <Animated.View accessibilityLiveRegion="polite" style={[styles.result, { backgroundColor: c.primaryDeep, transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.02] }) }] }]}>
            <View style={{ flex: 1, minWidth: 200 }}>
              <Txt variant="caption" color={c.accent}>YOUR PLAN</Txt>
              <Swap value={fit.id}><Txt variant="title" color="#fff">{fit.name}{fit.monthlyInr != null ? ` · ${inr(fit.monthlyInr)}/month` : ' · custom quote'}</Txt></Swap>
              <Txt variant="caption" color="#ffffffcc">{fit.bestFor}</Txt>
            </View>
            <Button title={fit.monthlyInr != null ? 'Start free trial' : 'Talk to us'} style={{ backgroundColor: c.accent }} onPress={() => router.push(fit.monthlyInr != null ? '/apply' : '/contact')} />
          </Animated.View>
        </View>
      </Reveal>

      {/* plans */}
      <View style={{ gap: 16 }}>
        <View style={{ width: 300, maxWidth: '100%', alignSelf: isDesktop ? 'center' : 'flex-start' }}><PillTabs tabs={[{ id: 'monthly', label: 'Monthly' }, { id: 'annual', label: 'Annual (save ~20%)' }]} value={bill} onChange={setBill} /></View>
        <Grid cols={isDesktop ? 4 : 1} gap={12}>
          {priced.map(({ p }, i) => {
            const price = bill === 'monthly' ? p.monthlyInr! : p.annualInr!;
            const mine = p.id === fit.id;
            return (
              <Reveal key={p.id} delay={i * 70}>
                <View style={[styles.plan, { backgroundColor: c.surface, borderColor: mine ? c.accent : c.border, borderWidth: mine ? 3 : 1 }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 26 }}>
                    <Txt variant="heading">{p.name}</Txt>
                    {mine ? <Pill text="Fits you" tone="gold" icon="checkmark" /> : p.recommended ? <Pill text="Recommended" tone="info" /> : null}
                  </View>
                  <Txt variant="caption" color={c.muted}>{p.bestFor}</Txt>
                  <Swap value={`${bill}${price}`}><Txt style={{ fontFamily: 'Georgia, serif', fontSize: 34, lineHeight: 40 }} color={c.primaryDeep}>{inr(price)}<Txt color={c.muted}>{bill === 'monthly' ? ' /month' : ' /year'}</Txt></Txt></Swap>
                  <Txt variant="caption" color={bill === 'annual' ? c.success : c.muted}>{bill === 'annual' ? `Save ${inr(p.monthlyInr! * 12 - p.annualInr!)} vs monthly · + GST` : '+ GST'}</Txt>
                  <View style={{ gap: 6 }}>
                    {[`Up to ${p.activeStudents?.toLocaleString('en-IN')} active students`, `${p.videoStorageGb} GB video storage`, `${p.liveRoomHoursPerMonth} live room-hours / month`, `${p.tutorSeats} tutor seat${p.tutorSeats === 1 ? '' : 's'}`].map((t) => <View key={t} style={{ flexDirection: 'row', gap: 8 }}><Ionicons name="checkmark" size={16} color={c.success} /><Txt variant="label" style={{ flex: 1 }}>{t}</Txt></View>)}
                  </View>
                  <Button title={`Start with ${p.name}`} size="md" variant={mine ? 'primary' : 'outline'} onPress={() => router.push('/apply')} />
                </View>
              </Reveal>
            );
          })}
        </Grid>
        {ent && (
          <View style={[styles.ent, { backgroundColor: c.primarySoft }]}>
            <View style={{ flex: 1, minWidth: 220 }}><Txt variant="heading">{ent.p.name}</Txt><Txt color={c.inkSoft}>{ent.p.bestFor}. Custom capacity, integrations and service commitments.</Txt></View>
            <Button title="Talk to us" onPress={() => router.push('/contact')} />
          </View>
        )}
      </View>

      {/* compare */}
      <View style={{ gap: 12 }}>
        <Reveal><Headline>Compare tools</Headline></Reveal>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ minWidth: 660, borderWidth: 1, borderColor: c.border, borderRadius: 16, overflow: 'hidden' }}>
            <View style={[styles.row, { backgroundColor: c.primaryDeep }]}>
              <Txt variant="label" color="#fff" style={styles.first}>Tool</Txt>
              {d.plans.map(({ p }) => <Txt key={p.id} variant="label" color={p.id === fit.id ? c.accent : '#fff'} style={styles.cell} center>{p.name}</Txt>)}
            </View>
            {d.rows.map((r, i) => (
              <View key={r.key} style={[styles.row, { backgroundColor: i % 2 ? c.surfaceMuted : c.surface }]}>
                <Txt style={styles.first}>{r.label}</Txt>
                {d.plans.map(({ p }) => <View key={p.id} style={[styles.cell, { alignItems: 'center' }]}>{r.on[p.id] ? <Ionicons name="checkmark-circle" size={20} color={c.success} accessibilityLabel={`${r.label}: included in ${p.name}`} /> : <Txt color={c.muted} accessibilityLabel={`${r.label}: not in ${p.name}`}>—</Txt>}</View>)}
              </View>
            ))}
          </View>
        </ScrollView>
        <Txt variant="caption" color={c.muted}>Add-ons after you join: student blocks, storage, live room-hours, tutor seats, custom domain. Marketplace: when a student finds you through Bodhin, Bodhin keeps {d.commissionPct}% of that sale. No commission on your own students.</Txt>
      </View>

      <View style={{ gap: 6, maxWidth: 780 }}>
        <Reveal><Headline>Questions</Headline></Reveal>
        {FAQ.map(([q, a]) => <Answer key={q} q={q} a={a} />)}
        <Button title="Ask something else" variant="outline" size="md" style={{ alignSelf: 'flex-start', marginTop: 12 }} onPress={() => router.push('/contact')} />
      </View>
    </PublicFrame>
  );
}

const styles = StyleSheet.create({
  finder: { borderWidth: 1, borderRadius: 28, padding: 20, gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  result: { borderRadius: 20, padding: 18, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  plan: { borderRadius: 20, padding: 18, gap: 10 },
  ent: { borderRadius: 20, padding: 18, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  first: { width: 230, paddingHorizontal: 12 },
  cell: { width: 86 },
});
