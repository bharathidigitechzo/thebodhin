/**
 * Cookie consent for academy websites. Google Analytics / Meta Pixel load ONLY after "Accept".
 * The choice is remembered per site and can be changed any time from the small status chip (always visible).
 */
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from './Txt';
import { Button } from './Button';

type Choice = 'accepted' | 'declined' | null;
const key = (slug: string) => `bodhin.consent.${slug}`;
const read = (slug: string): Choice => { try { return (globalThis.localStorage?.getItem(key(slug)) as Choice) ?? null; } catch { return null; } };
const write = (slug: string, v: Exclude<Choice, null>) => { try { globalThis.localStorage?.setItem(key(slug), v); } catch { /* private mode: ask again next visit */ } };

/** Inject the trackers once (web only). Real deployment renders the same tags server-side after consent. */
function load(tracking: { ga4?: string; metaPixel?: string }) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const w = window as unknown as Record<string, unknown>;
  if (w.__bodhinTrackers) return;
  w.__bodhinTrackers = true;
  try {
    if (tracking.ga4) {
      const s = document.createElement('script');
      s.async = true;
      s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(tracking.ga4)}`;
      document.head.appendChild(s);
      const dl = ((w.dataLayer as unknown[]) ??= []);
      w.gtag = (...args: unknown[]) => { dl.push(args); };
      (w.gtag as (...a: unknown[]) => void)('js', new Date());
      (w.gtag as (...a: unknown[]) => void)('config', tracking.ga4, { anonymize_ip: true });
    }
    if (tracking.metaPixel) {
      const s = document.createElement('script');
      s.async = true;
      s.src = 'https://connect.facebook.net/en_US/fbevents.js';
      document.head.appendChild(s);
      const q: unknown[] = [];
      w.fbq = (...args: unknown[]) => { q.push(args); };
      (w.fbq as (...a: unknown[]) => void)('init', tracking.metaPixel);
      (w.fbq as (...a: unknown[]) => void)('track', 'PageView');
    }
  } catch { /* a blocked tracker must never break the page */ }
}

export function CookieConsent({ slug, tracking, academy }: { slug: string; tracking: { ga4?: string; metaPixel?: string }; academy: string }) {
  const { c } = useTheme();
  const needed = !!(tracking.ga4 || tracking.metaPixel);
  const [choice, setChoice] = useState<Choice>(() => (needed ? read(slug) : null));
  const [open, setOpen] = useState(false);
  useEffect(() => { if (choice === 'accepted') load(tracking); }, [choice, tracking]);
  if (!needed) return null;
  const pick = (v: Exclude<Choice, null>) => { write(slug, v); setChoice(v); setOpen(false); };
  const tools = [tracking.ga4 && 'Google Analytics', tracking.metaPixel && 'Meta Pixel'].filter(Boolean).join(' and ');
  if (choice && !open) {
    return (
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`Cookie settings. Analytics ${choice === 'accepted' ? 'on' : 'off'}. Change`} style={[styles.chip, { backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: choice === 'accepted' ? c.success : c.muted }} />
        <Txt variant="caption" color={c.inkSoft}>Analytics {choice === 'accepted' ? 'on' : 'off'} · Change</Txt>
      </Pressable>
    );
  }
  return (
    <View accessibilityRole={'dialog' as never} accessibilityLabel="Cookie choice" style={[styles.banner, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Ionicons name="shield-half-outline" size={22} color={c.primary} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="bodyStrong">Can {academy} measure visits?</Txt>
          <Txt variant="caption" color={c.inkSoft}>With your OK we load {tools} to see which pages help visitors. Nothing loads if you decline, and the site works the same.</Txt>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button title="Decline" variant="outline" size="md" style={{ flex: 1 }} onPress={() => pick('declined')} />
        <Button title="Accept" size="md" style={{ flex: 1 }} onPress={() => pick('accepted')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { position: 'absolute', left: 12, right: 12, bottom: 12, maxWidth: 560, alignSelf: 'center', borderWidth: 1, borderRadius: 18, padding: 14, gap: 12, zIndex: 20, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  chip: { position: 'absolute', left: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, minHeight: 36, zIndex: 20 },
});
