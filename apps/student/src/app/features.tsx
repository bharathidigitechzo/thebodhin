/** Every tool in Bodhin, grouped by job, with the plan it starts on (computed from the plan catalogue). */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { marketingX, type ToolGroup } from '@/api/growth2';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { Chip, Pill } from '@/ui/kit';
import { Grid, useLayout } from '@/ui/responsive';
import { Eyebrow, Headline, PublicFrame } from '@/ui/publicFrame';
import { Reveal } from '@/ui/motion';

const ABOUT: Record<ToolGroup, string> = {
  Teach: 'Everything that happens between you and a student.',
  Sell: 'Ways to price, package and collect fees.',
  Grow: 'Finding students and keeping in touch.',
  Brand: 'Your name, your site, your look.',
  Run: 'Team, reports and control.',
};

export default function Features() {
  const { c } = useTheme();
  const { isDesktop } = useLayout();
  const d = marketingX.tools();
  const [g, setG] = useState<ToolGroup | 'All'>('All');
  const groups = g === 'All' ? d.groups : [g];
  return (
    <PublicFrame primary={{ title: 'See pricing', to: '/pricing' }} secondary={{ title: 'For educators', to: '/for-educators' }}>
      <View style={{ gap: 14, maxWidth: 780 }}>
        <Eyebrow>Features</Eyebrow>
        <Headline size="xl">{d.rows.length} tools. One login.</Headline>
        <Txt color={c.inkSoft} style={{ fontSize: 17, lineHeight: 26 }}>Each tool shows the plan it starts on. Nothing here is an extra app to buy or connect.</Txt>
      </View>
      <View style={{ gap: 20 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} accessibilityRole="tablist">
          {(['All', ...d.groups] as (ToolGroup | 'All')[]).map((x) => <Chip key={x} label={x === 'All' ? `All (${d.rows.length})` : `${x} (${d.rows.filter((r) => r.group === x).length})`} active={g === x} onPress={() => setG(x)} />)}
        </ScrollView>
        {groups.map((grp) => (
          <View key={grp} style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <Headline size="md">{grp}</Headline>
              <Txt color={c.muted}>{ABOUT[grp]}</Txt>
            </View>
            <Grid cols={isDesktop ? 3 : 1} gap={10}>
              {d.rows.filter((r) => r.group === grp).map((r, i) => (
                <Reveal key={`${g}-${r.key}`} delay={Math.min(i, 6) * 45}>
                  <View style={[styles.tool, { backgroundColor: c.surface, borderColor: c.border }]}>
                    <View style={[styles.icon, { backgroundColor: c.primarySoft }]}><Ionicons name={r.icon as never} size={20} color={c.primary} /></View>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Txt variant="bodyStrong">{r.label}</Txt>
                      <Txt variant="caption" color={c.muted}>{r.blurb}</Txt>
                    </View>
                    <Pill text={r.planId === 'starter' ? 'All plans' : `${r.plan}+`} tone={r.planId === 'starter' ? 'success' : 'gold'} />
                  </View>
                </Reveal>
              ))}
            </Grid>
          </View>
        ))}
      </View>
      <Reveal>
        <View style={[styles.final, { backgroundColor: c.primarySoft }]}>
          <Headline size="md">Also in every academy</Headline>
          <Txt color={c.inkSoft}>Offline downloads in the app, a code playground for 15 tech stacks, student doubts on each lesson, refunds, GST invoices, and a Help centre.</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <Button title="Compare plans" iconRight="arrow-forward" onPress={() => router.push('/pricing')} />
            <Button title="Try the playground" variant="outline" onPress={() => router.push('/playground')} />
          </View>
        </View>
      </Reveal>
    </PublicFrame>
  );
}

const styles = StyleSheet.create({
  tool: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 16, padding: 14, minHeight: 76 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  final: { borderRadius: 28, padding: 24, gap: 12 },
});
