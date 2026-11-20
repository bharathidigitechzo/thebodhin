/** Shared frame for the Growth-tool screens (CRM, webinars, bookings, products, site, community...). */
import React, { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { haptic } from '@/ui/haptics';
import { ApiError } from '@/api/client';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { useFrame, useLayout } from './responsive';
import { Txt } from './Txt';
import { Button } from './Button';
import { Banner } from './misc';
import { DateField, TimeField } from './pickers';
import { ScreenTop, shared } from './section';

/** Load data on focus; plan/permission errors become a friendly locked state with an upgrade path. */
export function useData<T>(fn: (userId: string) => T, deps: unknown[] = []) {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [d, setD] = useState<T | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);
  const load = useCallback(() => {
    try {
      setD(fn(userId));
      setErr(null);
    } catch (e) {
      setErr(e instanceof ApiError ? e : new ApiError('error', 'Something went wrong.'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, ...deps]);
  useFocusEffect(load);
  return { d, err, load, userId };
}

/** Same as useData for API calls that return a promise (reloads whenever the screen comes into focus). */
export function useDataAsync<T>(fn: (userId: string) => Promise<T>) {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [d, setD] = useState<T | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);
  const load = useCallback(() => {
    fn(userId).then((x) => { setD(x); setErr(null); }).catch((e) => setErr(e instanceof ApiError ? e : new ApiError('error', 'Something went wrong.')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
  useFocusEffect(load);
  return { d, err, load, userId };
}

export function Page({ title, sub, err, children, footer, fallback = '/edu/grow', wide, right }: { title: string; sub?: string; err?: ApiError | null; children?: React.ReactNode; footer?: React.ReactNode; fallback?: string; wide?: boolean; right?: React.ReactNode }) {
  const { c } = useTheme();
  const { isDesktop } = useLayout();
  const frame = useFrame();
  void wide; // all pages share the same frame now (kept for callers)
  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <ScreenTop title={title} sub={sub} fallback={fallback} right={right} />
        <ScrollView contentContainerStyle={[shared.scroll, { paddingHorizontal: frame.padX }, isDesktop && { paddingBottom: 48 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[shared.inner, { maxWidth: frame.maxWidth }]}>
            {err ? <Locked err={err} /> : children}
          </View>
        </ScrollView>
        {!err && footer && <View style={[shared.footer, { borderTopColor: c.border, backgroundColor: c.surface, paddingHorizontal: frame.padX }]}><View style={{ width: '100%', maxWidth: frame.maxWidth, flexDirection: 'row', gap: 8 }}>{footer}</View></View>}
      </SafeAreaView>
    </View>
  );
}

function Locked({ err }: { err: ApiError }) {
  const { c } = useTheme();
  const plan = err.code === 'plan';
  return (
    <View style={{ gap: 12, paddingTop: 12 }}>
      <Banner tone="info" text={err.message} />
      {plan && <Txt variant="caption" color={c.muted}>Your existing courses, students and payments are not affected. Plans differ only in tools and limits.</Txt>}
      {plan && <Button title="See plans" iconLeft="rocket-outline" onPress={() => router.push('/edu/subscription')} />}
    </View>
  );
}

/** Date + time in one field (ISO out). */
export function DateTimeField({ label, value, onChange, error }: { label: string; value: string; onChange: (iso: string) => void; error?: string | null }) {
  const d = new Date(value);
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const set = (day: string, t: string) => {
    const x = new Date(day);
    const [h, m] = t.split(':').map(Number);
    x.setHours(h, m, 0, 0);
    onChange(x.toISOString());
  };
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
      <View style={{ flex: 1.4 }}><DateField label={label} value={value} min={new Date().toISOString()} onChange={(v) => set(v, hhmm)} error={error} /></View>
      <View style={{ flex: 1 }}><TimeField label="Time" value={hhmm} onChange={(t) => set(value, t)} /></View>
    </View>
  );
}

/** Run an action, surface ApiError by field. */
export function useAct() {
  const [fe, setFe] = useState<{ field?: string; msg: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => unknown, ok?: string) => {
    setBusy(true);
    setFe(null);
    try {
      await fn();
      if (ok) { setMsg(ok); haptic('success'); }
      return true;
    } catch (e) {
      haptic('error');
      setFe(e instanceof ApiError ? { field: e.field, msg: e.message } : { msg: 'Something went wrong.' });
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { fe, setFe, msg, setMsg, busy, run, err: (f: string) => (fe?.field === f ? fe.msg : undefined), general: fe && !fe.field ? fe.msg : null };
}

export const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
export const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60e3);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
};
