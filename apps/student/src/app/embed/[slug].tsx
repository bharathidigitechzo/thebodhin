/** Embeddable course cards (what the widget / iframe shows on the tutor's own website). Minimal chrome. */
import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { embedApi } from '@/api/growth2';
import { ApiError } from '@/api/client';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { Banner } from '@/ui/misc';
import { inr } from '@/ui/section';

export default function EmbedWidget() {
  const { c } = useTheme();
  const { slug, course } = useLocalSearchParams<{ slug: string; course?: string }>();
  let d: ReturnType<typeof embedApi.render> | null = null, msg = '';
  try { d = embedApi.render(slug, course); } catch (e) { msg = e instanceof ApiError ? e.message : 'Not available'; }
  if (!d) return <View style={{ padding: 16 }}><Banner text={msg} /></View>;
  const br = d.t.branding;
  const open = (id: string) => (typeof window !== 'undefined' && window.top !== window.self ? Linking.openURL(`https://${d!.t.customDomain ?? `${d!.t.slug}.thebodhin.com`}/course/${id}?ref=embed`) : router.push({ pathname: '/course/[id]', params: { id } }));
  return (
    <ScrollView style={{ backgroundColor: c.surface }} contentContainerStyle={styles.wrap}>
      {d.courses.map((co) => (
        <Pressable key={co.id} onPress={() => open(co.id)} style={[styles.card, { borderColor: c.border }]} accessibilityRole="link" accessibilityLabel={co.title}>
          <View style={[styles.art, { backgroundColor: br.primary }]}><Txt variant="label" color="#fff" numberOfLines={2}>{co.title}</Txt></View>
          <View style={{ padding: 12, gap: 6 }}>
            <Txt variant="caption" color={c.muted}>{br.displayName}</Txt>
            <Txt variant="bodyStrong">{co.priceInr ? inr(co.priceInr) : 'Free'}</Txt>
            <Button title="Enrol now" size="md" style={{ backgroundColor: br.accent }} onPress={() => open(co.id)} />
          </View>
        </Pressable>
      ))}
      {!br.hidePoweredBy && <Txt variant="caption" color={c.muted} center style={{ width: '100%' }}>Powered by Bodhin</Txt>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 12, justifyContent: 'center' },
  card: { width: 260, maxWidth: '100%', borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  art: { height: 110, padding: 12, justifyContent: 'flex-end' },
});
