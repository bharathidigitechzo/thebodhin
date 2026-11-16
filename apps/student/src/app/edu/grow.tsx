/** Grow hub: every sales & engagement tool in one place, with what the plan unlocks (Nrich/Graphy parity). */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { growHub } from '@/api/growth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Pill } from '@/ui/kit';
import { Grid, useLayout } from '@/ui/responsive';
import { Page, useData } from '@/ui/grow';
import { Card, inr } from '@/ui/section';

const MORE = [
  { f: 'marketplace', title: 'Showcase videos', sub: 'Free videos on Bodhin’s site & ads', icon: 'play-circle-outline', href: '/edu/showcase', plan: 'Starter' },
  { f: 'courses', title: 'Analytics', sub: 'Revenue, top courses, learners', icon: 'analytics-outline', href: '/edu/analytics', plan: 'Starter' },
  { f: 'bundles', title: 'Bundles & add-ons', sub: 'Combo prices, checkout add-on', icon: 'albums-outline', href: '/edu/bundles', plan: 'Creator' },
  { f: 'certificate_designer', title: 'Certificate designer', sub: 'Your logo, signature, QR', icon: 'ribbon-outline', href: '/edu/certificate', plan: 'Creator' },
  { f: 'affiliates', title: 'Affiliate program', sub: 'Learners earn for referrals', icon: 'gift-outline', href: '/edu/affiliates', plan: 'Growth' },
  { f: 'multi_currency', title: 'International pricing', sub: 'USD, AED, GBP, EUR via Stripe/PayPal', icon: 'earth-outline', href: '/edu/intl', plan: 'Institute' },
  { f: 'embed', title: 'Embed & WordPress', sub: 'Sell from your own website', icon: 'code-outline', href: '/edu/embed', plan: 'Institute' },
] as const;

export default function Grow() {
  const { c } = useTheme();
  const { isDesktop } = useLayout();
  const { d, err } = useData(growHub.get);
  return (
    <Page title="Grow" sub={d ? `${d.ctx.ent.plan.name} plan · ${d.ctx.host}` : undefined} err={err} fallback="/educator/more" wide>
      {d && (
        <>
          <Card title="Last 30 days">
            <Txt variant="title">{inr(d.revenue30)}</Txt>
            <Txt variant="caption" color={c.muted}>From webinars, 1:1 sessions and digital products — paid straight to your gateway, no Bodhin commission. Course sales stay in Earnings.</Txt>
          </Card>
          <Grid cols={isDesktop ? 3 : 1} gap={10}>
            {d.tools.map((t) => (
              <Pressable
                key={t.key}
                onPress={() => (t.on ? router.push(t.href as never) : router.push(t.off ? '/edu/workspace' : '/edu/subscription'))}
                style={({ pressed }) => [styles.tile, { backgroundColor: c.surface, borderColor: c.border, opacity: pressed ? 0.85 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel={`${t.title}. ${t.on ? t.sub : t.off ? 'Switched off' : `Needs ${t.plan} plan`}`}
              >
                <View style={[styles.icon, { backgroundColor: t.on ? c.primarySoft : c.surfaceMuted }]}>
                  <Ionicons name={t.icon as never} size={22} color={t.on ? c.primary : c.muted} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Txt variant="bodyStrong" numberOfLines={1}>{t.title}</Txt>
                  <Txt variant="caption" color={c.muted} numberOfLines={1}>{t.on ? t.sub : t.off ? 'Switched off · turn on in Workspace' : `Available on ${t.plan} and above`}</Txt>
                </View>
                {t.on ? <Ionicons name="chevron-forward" size={18} color={c.muted} /> : t.off ? <Pill text="Off" tone="neutral" /> : <Pill text={t.plan} tone="gold" icon="lock-closed" />}
              </Pressable>
            ))}
          </Grid>
          <Txt variant="label" style={{ marginTop: 8 }}>Sell more & reach further</Txt>
          <Grid cols={isDesktop ? 3 : 1} gap={10}>
            {MORE.map((t) => {
              const on = d.ctx.ent.has(t.f);
              return (
                <Pressable key={t.href} onPress={() => router.push((on ? t.href : '/edu/subscription') as never)} style={({ pressed }) => [styles.tile, { backgroundColor: c.surface, borderColor: c.border, opacity: pressed ? 0.85 : 1 }]} accessibilityRole="button" accessibilityLabel={`${t.title}. ${on ? t.sub : `Needs ${t.plan} plan`}`}>
                  <View style={[styles.icon, { backgroundColor: on ? c.primarySoft : c.surfaceMuted }]}><Ionicons name={t.icon as never} size={22} color={on ? c.primary : c.muted} /></View>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Txt variant="bodyStrong" numberOfLines={1}>{t.title}</Txt>
                    <Txt variant="caption" color={c.muted} numberOfLines={1}>{on ? t.sub : `Available on ${t.plan} and above`}</Txt>
                  </View>
                  {on ? <Ionicons name="chevron-forward" size={18} color={c.muted} /> : <Pill text={t.plan} tone="gold" icon="lock-closed" />}
                </Pressable>
              );
            })}
          </Grid>
        </>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  tile: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 18, padding: 14, minHeight: 72 },
  icon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
