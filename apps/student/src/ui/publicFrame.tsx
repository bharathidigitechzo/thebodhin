/**
 * Frame for the public Bodhin site: top nav with "you are here" + scroll progress, phone menu sheet,
 * thumb-reach action bar on phones, sitemap footer. Design direction: docs/design/direction.md.
 */
import React, { useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { BrandLogo } from './Brand';
import { Txt } from './Txt';
import { Button } from './Button';
import { BottomSheet } from './kit';
import { useLayout } from './responsive';
import { Seo, SEO } from './seo';
import { PageEnter, ScrollCtx, ScrollProgress, ScrollYCtx } from './motion';

export const NAV = [
  { to: '/welcome', label: 'Home', icon: 'home-outline' },
  { to: '/watch', label: 'Free videos', icon: 'play-circle-outline' },
  { to: '/for-educators', label: 'For educators', icon: 'school-outline' },
  { to: '/features', label: 'Features', icon: 'apps-outline' },
  { to: '/pricing', label: 'Pricing', icon: 'pricetag-outline' },
  { to: '/about', label: 'About', icon: 'information-circle-outline' },
] as const;
const SITEMAP: [string, [string, string][]][] = [
  ['Learn', [['Explore courses', '/explore'], ['Free videos', '/watch'], ['Code playground', '/playground'], ['Verify a certificate', '/cert/check'], ['Sign in', '/sign-in']]],
  ['Teach', [['For educators', '/for-educators'], ['Features', '/features'], ['Pricing', '/pricing'], ['Apply as an educator', '/apply']]],
  ['Bodhin', [['About', '/about'], ['Contact', '/contact'], ['Terms', '/legal/terms'], ['Privacy', '/legal/privacy'], ['Refunds', '/legal/refunds']]],
];
export type Cta = { title: string; to: string };

/** Serif headline used across the site (the "textbook title" voice). */
export function Headline({ children, size = 'lg', color, center, role = 'header' }: { children: React.ReactNode; size?: 'xl' | 'lg' | 'md'; color?: string; center?: boolean; role?: 'header' | 'none' }) {
  const { c } = useTheme();
  const { isDesktop, isTablet } = useLayout();
  const fs = size === 'xl' ? (isDesktop ? 56 : isTablet ? 44 : 34) : size === 'lg' ? (isDesktop ? 38 : isTablet ? 32 : 26) : isDesktop ? 26 : 22;
  return <Txt accessibilityRole={role === 'none' ? undefined : 'header'} center={center} color={color ?? c.primaryDeep} style={{ fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, "Times New Roman", serif' }), fontSize: fs, lineHeight: Math.round(fs * 1.16), fontWeight: '700', letterSpacing: -0.4 }}>{children}</Txt>;
}
/** Small uppercase label above a section title. */
export function Eyebrow({ children, color }: { children: string; color?: string }) {
  const { c } = useTheme();
  return <Txt variant="label" color={color ?? c.accent} style={{ letterSpacing: 1.4 }}>{children.toUpperCase()}</Txt>;
}

export function PublicFrame({ children, primary, secondary, seo }: { children: React.ReactNode; primary?: Cta; secondary?: Cta; seo?: { title: string; description: string } }) {
  const { c } = useTheme();
  const { isDesktop, isTablet } = useLayout();
  const { session } = useAuth();
  const path = usePathname();
  const [menu, setMenu] = useState(false);
  const y = useRef(new Animated.Value(0)).current;
  const size = useRef({ content: 1, view: 1 });
  const progress = useRef(new Animated.Value(0)).current;
  const onScroll = Animated.event([{ nativeEvent: { contentOffset: { y } } }], {
    useNativeDriver: false,
    listener: (e: { nativeEvent: { contentOffset: { y: number } } }) => progress.setValue(Math.max(0, Math.min(1, e.nativeEvent.contentOffset.y / Math.max(1, size.current.content - size.current.view)))),
  });
  const m = seo ?? (SEO as Record<string, readonly [string, string]>)[path] ? { title: (seo?.title ?? (SEO as Record<string, readonly [string, string]>)[path][0]), description: (seo?.description ?? (SEO as Record<string, readonly [string, string]>)[path][1]) } : null;
  const go = (to: string) => { setMenu(false); router.push(to as never); };
  const main: Cta = primary ?? { title: 'Start free trial', to: '/apply' };
  const second: Cta = secondary ?? { title: 'Explore courses', to: '/explore' };
  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      {m && <Seo title={m.title} description={m.description} path={path} />}
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, zIndex: 5 }}>
          <View style={[styles.head, { paddingHorizontal: isDesktop ? 32 : isTablet ? 24 : 16 }]}>
            <Pressable onPress={() => go('/welcome')} accessibilityRole="link" accessibilityLabel="Bodhin home" hitSlop={8}><BrandLogo size="sm" /></Pressable>
            {isDesktop ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 26 }}>
                <View accessibilityRole={'navigation' as never} style={{ flexDirection: 'row', gap: 22 }}>
                  {NAV.map((n) => {
                    const on = path === n.to;
                    return (
                      <Pressable key={n.to} onPress={() => go(n.to)} accessibilityRole="link" accessibilityState={{ selected: on }} style={{ paddingVertical: 8 }}>
                        <Txt variant="label" color={on ? c.primary : c.inkSoft}>{n.label}</Txt>
                        <View style={{ height: 3, borderRadius: 2, marginTop: 4, backgroundColor: on ? c.accent : 'transparent' }} />
                      </Pressable>
                    );
                  })}
                </View>
                {session ? <Button title="Open app" size="md" onPress={() => go('/')} /> : (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button title="Sign in" size="md" variant="outline" onPress={() => go('/sign-in')} />
                    <Button title="Start free trial" size="md" onPress={() => go('/apply')} />
                  </View>
                )}
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {!session && <Button title="Sign in" size="md" variant="outline" onPress={() => go('/sign-in')} />}
                <Pressable onPress={() => setMenu(true)} accessibilityRole="button" accessibilityLabel="Open menu" style={styles.burger}><Ionicons name="menu" size={26} color={c.primaryDeep} /></Pressable>
              </View>
            )}
          </View>
          <ScrollCtx.Provider value={progress}><ScrollProgress color={c.accent} /></ScrollCtx.Provider>
        </View>

        <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false}
          onContentSizeChange={(_w: number, h: number) => { size.current.content = h; }} onLayout={(e) => { size.current.view = e.nativeEvent.layout.height; }}
          contentContainerStyle={{ alignItems: 'center', paddingBottom: isDesktop ? 0 : 12 }}>
          <ScrollYCtx.Provider value={y}>
            <PageEnter key={path} style={{ width: '100%', maxWidth: 1160, paddingHorizontal: isDesktop ? 32 : isTablet ? 24 : 16, gap: isDesktop ? 76 : isTablet ? 56 : 44, paddingTop: isDesktop ? 36 : isTablet ? 28 : 20 }}>{children}</PageEnter>
          </ScrollYCtx.Provider>
          <View style={[styles.foot, { backgroundColor: c.primaryDeep, marginTop: isDesktop ? 96 : 56 }]}>
            <View style={{ width: '100%', maxWidth: 1160, gap: 24 }}>
              <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 24, justifyContent: 'space-between' }}>
                <View style={{ gap: 6, maxWidth: 320 }}>
                  <Headline size="md" color="#fff">Bodhin</Headline>
                  <Txt color="#ffffffb3">Where educators run their academies and learners find them. Built in Madurai, Tamil Nadu.</Txt>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: isDesktop ? 56 : 28 }}>
                  {SITEMAP.map(([h, links]) => (
                    <View key={h} style={{ gap: 4, minWidth: 130 }}>
                      <Txt variant="label" color="#ffffff99" style={{ letterSpacing: 1.2 }}>{h.toUpperCase()}</Txt>
                      {links.map(([t, to]) => <Pressable key={to} onPress={() => go(to)} accessibilityRole="link" style={{ minHeight: 34, justifyContent: 'center' }}><Txt color="#fff">{t}</Txt></Pressable>)}
                    </View>
                  ))}
                </View>
              </View>
              <Txt variant="caption" color="#ffffff80">© {new Date().getFullYear()} Bodhin · thebodhin.com</Txt>
            </View>
          </View>
        </Animated.ScrollView>

        {!isDesktop && (
          <View style={[styles.bar, { backgroundColor: c.surface, borderTopColor: c.border }]}>
            <Button title={second.title} size="md" variant="outline" style={{ flex: 1 }} onPress={() => go(second.to)} />
            <Button title={main.title} size="md" style={{ flex: 1.2 }} onPress={() => go(main.to)} />
          </View>
        )}
      </SafeAreaView>

      <BottomSheet open={menu} onClose={() => setMenu(false)} title="Menu">
        <View style={{ gap: 4 }}>
          {NAV.map((n) => {
            const on = path === n.to;
            return (
              <Pressable key={n.to} onPress={() => go(n.to)} accessibilityRole="link" accessibilityState={{ selected: on }} style={[styles.item, { backgroundColor: on ? c.primarySoft : 'transparent' }]}>
                <Ionicons name={n.icon} size={22} color={on ? c.primary : c.inkSoft} />
                <Txt variant="bodyStrong" color={on ? c.primary : c.ink} style={{ flex: 1 }}>{n.label}</Txt>
                {on && <Txt variant="caption" color={c.primary}>You are here</Txt>}
              </Pressable>
            );
          })}
          <Pressable onPress={() => go('/contact')} accessibilityRole="link" style={styles.item}><Ionicons name="chatbubble-ellipses-outline" size={22} color={c.inkSoft} /><Txt variant="bodyStrong" style={{ flex: 1 }}>Contact</Txt></Pressable>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            {session ? <Button title="Open app" size="md" style={{ flex: 1 }} onPress={() => go('/')} /> : <><Button title="Sign in" size="md" variant="outline" style={{ flex: 1 }} onPress={() => go('/sign-in')} /><Button title="Start free trial" size="md" style={{ flex: 1 }} onPress={() => go('/apply')} /></>}
          </View>
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, minHeight: 60, width: '100%', maxWidth: 1224, alignSelf: 'center' },
  burger: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  foot: { width: '100%', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 40 },
  bar: { flexDirection: 'row', gap: 8, padding: 10, borderTopWidth: 1 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 12, borderRadius: 14 },
});
