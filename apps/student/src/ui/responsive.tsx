/**
 * Responsive shell. One codebase, three layouts:
 *  - phone   (< 768)  : thumb-first, bottom tab bar, sheets from the bottom  (unchanged mobile UX)
 *  - tablet  (768–1023): icon side rail, centred content
 *  - desktop (≥ 1024) : full left sidebar with labels, wide multi-column pages, dialogs instead of sheets,
 *                       primary actions inline (no pinned bottom bars)
 */
import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useGlobalSearchParams, usePathname } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { adminMembership, educatorMembership, useAuth } from '@/store/auth';
import type { Session } from '@/core/types';
import { educator, notifications } from '@/api/client';
import { mentorship } from '@/api/academy';
import { TAB_ROOTS, activeKey, navFor, primaryOf, type NavArea, type NavRole } from '@/core/nav';
import { canOpenAdmin, type AdminRole } from '@/core/admin';
import { haptic } from './haptics';
import { BrandLogo } from './Brand';
import { Txt } from './Txt';
import { BottomSheet } from './kit';

export const BP = { tablet: 768, desktop: 1024 } as const;
/** Page widths on large screens (phones are always full width). */
export const PAGE = { wide: 1200, read: 860, form: 720 } as const;

export function useLayout() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= BP.desktop;
  const isTablet = !isDesktop && width >= BP.tablet;
  return {
    width,
    isDesktop,
    isTablet,
    isPhone: width < BP.tablet,
    /** Columns for card grids: phone 1, tablet 2, desktop 3–4 (by available width). */
    cols: (min = 260) => (width < BP.tablet ? 1 : Math.max(2, Math.min(4, Math.floor((Math.min(width - (isDesktop ? SIDEBAR_W : 0), PAGE.wide) - 64) / min)))),
    /** Horizontal page padding. */
    pad: isDesktop ? 32 : 16,
  };
}

export const SIDEBAR_W = 248;

type NavItem = readonly [name: string, title: string, icon: string];
type Area = NavArea;

/** Routes that stay full-screen on desktop (sign-in flow, video player, live rooms). */
const NO_FRAME = ['/sign-in', '/sign-up', '/verify', '/forgot-password', '/onboarding', '/apply', '/application-status', '/learn/', '/live-room', '/edu/host', '/edu/board', '/edu/prejoin', '/quiz/', '/embed/', '/welcome', '/pricing', '/legal/', '/for-educators', '/features', '/about', '/contact', '/watch', '/cert/', '/mentor-room/'];

/** Which dashboard a page belongs to. Bodhin staff on the shared /edu tools stay in the admin dashboard. */
function areaOf(path: string, session: Session | null): Area {
  if (path.startsWith('/admin')) return 'admin';
  if (path.startsWith('/educator') || path.startsWith('/edu/')) return !educatorMembership(session) && adminMembership(session) ? 'admin' : 'educator';
  return 'learner';
}

/** The role whose navigation is shown in an area. */
export function navRoleOf(session: Session | null, area: Area): NavRole {
  if (area === 'learner') return 'learner';
  if (area === 'admin') return 'admin';
  return educatorMembership(session)?.role === 'tutor' ? 'tutor' : 'owner';
}

/** The modules of the current dashboard (role-aware; switched-off academy modules hidden). */
export function useNav(areaArg?: Area) {
  const { session } = useAuth();
  const path = usePathname();
  const area = areaArg ?? areaOf(path, session);
  const role = navRoleOf(session, area);
  const off = role === 'owner' || role === 'tutor' ? educator.context(session?.user.id ?? '')?.tenant.disabledModules ?? [] : [];
  // Admin: show only the sections this staff role may open (same rule as the admin tabs and the admin layout).
  const staffRole = (adminMembership(session)?.role ?? null) as AdminRole | null;
  const items = navFor(role, { modulesOff: off }).filter((it) => role !== 'admin' || canOpenAdmin(staffRole, it.href));
  return { area, role, items, path };
}

/** Desktop sidebar (≥ 1024px) — persistent on every page of an area, not just the tab screens. */
export function DesktopSidebar({ area, path }: { area: Area; path: string }) {
  const { c } = useTheme();
  const { session, signOut } = useAuth();
  const { items } = useNav(area);
  const q = useGlobalSearchParams<{ kind?: string }>();
  const u = session?.user;
  const initials = (u?.name ?? '?').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const role = navRoleOf(session, area);
  const areaLabel = area === 'educator' ? (role === 'tutor' ? 'Tutor' : 'Teaching') : area === 'admin' ? 'Bodhin admin' : 'Learning';
  const active = activeKey(items, path, q.kind ? `kind=${q.kind}` : '');
  const [switching, setSwitching] = React.useState(false);
  const canSwitch = dashboardsOf(session).length > 1;

  return (
    <View style={[s.side, { backgroundColor: c.surface, borderRightColor: c.border }]} accessibilityRole="navigation">
      <View style={s.logo}>
        <BrandLogo size="sm" align="flex-start" />
      </View>
      <Txt variant="label" color={c.muted} style={s.area}>{areaLabel.toUpperCase()}</Txt>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 2, paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
        {items.map((it) => {
          const on = it.key === active;
          const notifCount = it.key === 'notifications' && session ? notifications.unread(session.user.id) : 0;
          const mentorCount = it.key === 'mentorship' && session ? mentorship.unviewedCount(session.user.id) : 0;
          const badgeCount = notifCount || mentorCount;
          return (
            <Pressable
              key={it.key}
              onPress={() => router.navigate(it.href as never)}
              accessibilityRole="link"
              accessibilityState={{ selected: on }}
              accessibilityLabel={it.title}
              style={({ hovered }: any) => [s.item, { backgroundColor: on ? c.primarySoft : hovered ? c.surfaceMuted : 'transparent' }]}
            >
              <Ionicons name={(on ? it.icon : `${it.icon}-outline`) as keyof typeof Ionicons.glyphMap} size={20} color={on ? c.primary : c.inkSoft} />
              <Txt variant="bodyStrong" color={on ? c.primary : c.ink} style={{ fontWeight: on ? '700' : '500', flex: 1 }}>{it.title}</Txt>
              {badgeCount > 0 && (
                <View style={{ backgroundColor: c.live, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 }}>
                  <Txt variant="caption" color="#fff" style={{ fontSize: 10, fontWeight: '700' }}>{badgeCount}</Txt>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
      {canSwitch && (
        <Pressable
          onPress={() => setSwitching(true)}
          accessibilityRole="button"
          accessibilityLabel="Switch dashboard"
          style={({ hovered }: any) => [s.switch, { borderColor: c.border, backgroundColor: hovered ? c.surfaceMuted : 'transparent' }]}
        >
          <Ionicons name="swap-horizontal" size={18} color={c.primary} />
          <Txt variant="label" color={c.primary}>Switch dashboard</Txt>
        </Pressable>
      )}
      <View style={[s.user, { borderTopColor: c.border }]}>
        <View style={[s.avatar, { backgroundColor: c.primary }]}>
          <Txt variant="label" color="#fff" style={{ fontWeight: '700' }}>{initials}</Txt>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="bodyStrong" numberOfLines={1}>{u?.name}</Txt>
          <Txt variant="caption" color={c.muted} numberOfLines={1}>{u?.email}</Txt>
        </View>
        <Pressable onPress={() => { signOut(); router.replace('/sign-in'); }} hitSlop={8} accessibilityRole="button" accessibilityLabel="Sign out">
          <Ionicons name="log-out-outline" size={20} color={c.muted} />
        </Pressable>
      </View>
      <SwitchDashboardSheet open={switching} onClose={() => setSwitching(false)} current={area} />
    </View>
  );
}

/** Dashboards this person can open: Student always; Educator/Tutor and Bodhin admin when they hold the role. */
export function dashboardsOf(session: Session | null) {
  const out: { area: Area; title: string; sub: string; href: string; icon: string }[] = [];
  if (!session) return out;
  const edu = educatorMembership(session);
  const adm = adminMembership(session);
  if (adm) out.push({ area: 'admin', title: 'Bodhin admin', sub: 'Platform, Bodhin courses, approvals', href: '/admin', icon: 'shield-checkmark' });
  if (edu) out.push({ area: 'educator', title: edu.role === 'tutor' ? 'Tutor dashboard' : 'Educator dashboard', sub: 'Teach, schedule and manage students', href: '/educator/home', icon: 'school' });
  out.push({ area: 'learner', title: 'Student dashboard', sub: 'Your courses, live classes and certificates', href: '/home', icon: 'person' });
  return out;
}

/** "Switch to User": one sheet lists the dashboards this login has; each opens with its own full navigation. */
export function SwitchDashboardSheet({ open, onClose, current }: { open: boolean; onClose: () => void; current: Area }) {
  const { c } = useTheme();
  const { session, setMode } = useAuth();
  const list = dashboardsOf(session);
  if (!open) return null;
  return (
    <BottomSheet open={open} onClose={onClose} title="Switch dashboard">
      <View style={{ gap: 8 }}>
        {list.map((d) => {
          const on = d.area === current;
          return (
            <Pressable
              key={d.area}
              onPress={() => { onClose(); if (on) return; haptic('select'); setMode(d.area === 'admin' ? (null as any) : d.area === 'learner' ? 'learner' : 'educator'); router.replace(d.href as never); }}
              accessibilityRole="button"
              accessibilityLabel={`${d.title}${on ? ' (current)' : ''}`}
              accessibilityState={{ selected: on }}
              style={[s.dash, { borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primarySoft : c.surface }]}
            >
              <Ionicons name={d.icon as keyof typeof Ionicons.glyphMap} size={22} color={c.primary} />
              <View style={{ flex: 1 }}>
                <Txt variant="bodyStrong">{d.title}</Txt>
                <Txt variant="caption" color={c.muted}>{d.sub}</Txt>
              </View>
              {on ? <Txt variant="label" color={c.primary}>Current</Txt> : <Ionicons name="chevron-forward" size={18} color={c.muted} />}
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}

/**
 * Phones and tablets: the same 5-slot bar the tab screens show, kept on every inner page of a dashboard
 * (Community, Timetable, Students …), so More and the other modules never disappear.
 */
export function AreaBar({ area, path }: { area: Area; path: string }) {
  const { c } = useTheme();
  const { items } = useNav(area);
  const q = useGlobalSearchParams<{ kind?: string }>();
  const prim = primaryOf(items);
  const activeAll = activeKey(items, path, q.kind ? `kind=${q.kind}` : '');
  // A module that is not in the bar (Community, Timetable …) lights up More.
  const active = prim.some((x) => x.key === activeAll) ? activeAll : prim[prim.length - 1].key;
  return (
    <View style={[s.bar, { backgroundColor: c.surface, borderTopColor: c.border }]} accessibilityRole="tablist" testID="area-bar">
      {prim.map((it) => {
        const on = it.key === active;
        return (
          <Pressable key={it.key} onPress={() => { haptic('select'); router.navigate(it.href as never); }} accessibilityRole="link" accessibilityLabel={it.title} accessibilityState={{ selected: on }} style={s.barItem}>
            <Ionicons name={(on ? it.icon : `${it.icon}-outline`) as keyof typeof Ionicons.glyphMap} size={22} color={on ? c.primary : c.muted} />
            <Txt variant="caption" color={on ? c.primary : c.muted} style={{ fontSize: 11, fontWeight: '600' }} numberOfLines={1}>{it.title}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Every module of the current dashboard as tiles (phones/tablets: the "all modules" view; nothing hidden). */
export function ModuleGrid({ area, exclude = [], title = 'All modules', compact = false }: { area?: Area; exclude?: string[]; title?: string; compact?: boolean }) {
  const { c } = useTheme();
  const { items } = useNav(area);
  const { session } = useAuth();
  const list = items.filter((x) => !exclude.includes(x.key) && x.key !== 'more');
  const tile = (it: (typeof list)[number]) => {
    const mentorCount = it.key === 'mentorship' && session ? mentorship.unviewedCount(session.user.id) : 0;
    return (
      <Pressable key={it.key} onPress={() => router.push(it.href as never)} accessibilityRole="link" accessibilityLabel={it.title} style={({ pressed }) => [compact ? s.chipTile : s.tile, { backgroundColor: c.surface, borderColor: c.border }, pressed && { opacity: 0.8 }]}>
        <View style={{ position: 'relative' }}>
          <Ionicons name={`${it.icon}-outline` as keyof typeof Ionicons.glyphMap} size={compact ? 18 : 22} color={c.primary} />
          {mentorCount > 0 && (
            <View style={{ position: 'absolute', top: -4, right: -8, backgroundColor: c.live, borderRadius: 8, paddingHorizontal: 4, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}>
              <Txt variant="caption" color="#fff" style={{ fontSize: 9, fontWeight: '700', lineHeight: 11 }}>{mentorCount}</Txt>
            </View>
          )}
        </View>
        <Txt variant="caption" center={!compact} numberOfLines={compact ? 1 : 2} style={{ fontWeight: '600' }}>{it.title}</Txt>
      </Pressable>
    );
  };
  return (
    <View style={{ gap: 8 }} accessibilityLabel={title}>
      <Txt variant="label" color={c.muted}>{title.toUpperCase()}</Txt>
      {compact ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>{list.map(tile)}</ScrollView>
      ) : (
        <View style={s.grid}>{list.map(tile)}</View>
      )}
    </View>
  );
}

/** Root frame: desktop → the area's sidebar on every signed-in page; phones/tablets → the area bar on inner pages. */
export function DesktopFrame({ children }: { children: React.ReactNode }) {
  const { isDesktop } = useLayout();
  const { session } = useAuth();
  const path = usePathname();
  const inApp = !!session && path !== '/' && !NO_FRAME.some((p) => path === p || path.startsWith(p));
  if (!inApp) return <>{children}</>;
  const area = areaOf(path, session);
  if (!isDesktop) {
    if (TAB_ROOTS.includes(path) || !inAreaPage(path)) return <>{children}</>;
    return (
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1, minHeight: 0 }}>{children}</View>
        <AreaBar area={area} path={path} />
      </View>
    );
  }
  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      <DesktopSidebar area={area} path={path} />
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
    </View>
  );
}

/** Inner pages that belong to a dashboard (public pages like a course page opened while signed out are excluded upstream). */
function inAreaPage(path: string) {
  return !['/sign-in', '/sign-up', '/checkout/'].some((p) => path.startsWith(p));
}

/**
 * Shared Tabs config for all three areas: bottom bar on phones, icon rail on tablets.
 * Desktop hides the tab bar — the root DesktopFrame shows the sidebar on every page.
 */
export function useAppTabs(_items: readonly NavItem[], _area: Area) {
  const { c } = useTheme();
  const { isDesktop, isTablet } = useLayout();
  return {
    tabBar: isDesktop ? () => null : undefined,
    screenOptions: {
      headerShown: false,
      tabBarActiveTintColor: c.primary,
      tabBarInactiveTintColor: c.muted,
      tabBarPosition: (isTablet ? 'left' : 'bottom') as 'left' | 'bottom',
      tabBarVariant: (isTablet ? 'material' : 'uikit') as 'material' | 'uikit',
      tabBarLabelPosition: isTablet ? ('below-icon' as const) : undefined,
      tabBarLabelStyle: { fontSize: 11, fontWeight: '600' as const },
      tabBarStyle: isTablet
        ? { backgroundColor: c.surface, borderRightColor: c.border, width: 104, paddingTop: 16 }
        : { backgroundColor: c.surface, borderTopColor: c.border, height: Platform.OS === 'web' ? 68 : undefined, paddingTop: 6 },
      tabBarItemStyle: isTablet ? { minHeight: 72 } : { paddingBottom: Platform.OS === 'web' ? 8 : 0 },
    },
  };
}

/** Grid that lays children out in N equal columns (wraps). Phones: 1 column. */
export function Grid({ cols, gap = 16, children }: { cols: number; gap?: number; children: React.ReactNode }) {
  const arr = React.Children.toArray(children);
  if (cols <= 1) return <View style={{ gap }}>{arr}</View>;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -gap / 2, rowGap: gap }}>
      {arr.map((ch, i) => (
        <View key={i} style={{ width: `${100 / cols}%` as `${number}%`, paddingHorizontal: gap / 2 }}>{ch}</View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  side: { width: SIDEBAR_W, borderRightWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingTop: 20, paddingBottom: 14, height: '100%' },
  logo: { paddingHorizontal: 8, paddingBottom: 20 },
  area: { paddingHorizontal: 12, paddingBottom: 8, letterSpacing: 0.8, fontSize: 11 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, height: 44, borderRadius: 12 },
  switch: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 42, marginBottom: 12 },
  user: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14, paddingHorizontal: 4 },
  dash: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 14, minHeight: 64 },
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6, paddingBottom: Platform.OS === 'web' ? 8 : 4, minHeight: 60 },
  barItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 48 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipTile: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, minHeight: 44 },
  tile: { width: '31%', flexGrow: 1, minWidth: 96, maxWidth: 180, alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 6, minHeight: 76 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});

/** Side-by-side columns on desktop, stacked on phones/tablets (same gap). */
export function Cols({ children, gap = 12, widths }: { children: React.ReactNode; gap?: number; widths?: (number | undefined)[] }) {
  const { isDesktop } = useLayout();
  const arr = React.Children.toArray(children).filter(Boolean);
  if (!isDesktop) return <>{arr}</>;
  return (
    <View style={{ flexDirection: 'row', gap, alignItems: 'flex-start' }}>
      {arr.map((ch, i) => (
        <View key={i} style={widths?.[i] ? { width: widths[i] } : { flex: 1, minWidth: 0, gap }}>{ch}</View>
      ))}
    </View>
  );
}
