import React, { useRef } from 'react';
import { Animated, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { radius, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from './Txt';
import type { InputRef } from './TextField';
import { haptic } from './haptics';
import { useHapticOn, useShake } from './feedback';

export function Checkbox({ checked, onChange, children, label }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; label: string }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={() => { haptic(checked ? 'toggleOff' : 'toggle'); onChange(!checked); }} accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={label} style={styles.check} hitSlop={6}>
      <View style={[styles.box, { borderColor: checked ? c.primary : c.borderStrong, backgroundColor: checked ? c.primary : c.surface }]}>
        {checked && <Ionicons name="checkmark" size={16} color="#fff" />}
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </Pressable>
  );
}

export function BackButton({ fallback = '/' as string }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback as any))}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      hitSlop={8}
      style={[styles.back, { backgroundColor: c.surface, borderColor: c.border }]}
    >
      <Ionicons name="chevron-back" size={22} color={c.ink} />
    </Pressable>
  );
}

export function Divider({ label }: { label: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.divider}>
      <View style={[styles.line, { backgroundColor: c.border }]} />
      <Txt variant="caption" color={c.muted}>
        {label}
      </Txt>
      <View style={[styles.line, { backgroundColor: c.border }]} />
    </View>
  );
}

export function Banner({ tone = 'danger', text }: { tone?: 'danger' | 'success' | 'info'; text: string }) {
  const { c } = useTheme();
  const map = { danger: [c.dangerBg, c.danger, 'alert-circle'], success: [c.successBg, c.success, 'checkmark-circle'], info: [c.infoBg, c.info, 'information-circle'] } as const;
  const [bg, fg, icon] = map[tone];
  const shake = useShake(tone === 'danger' ? text : null);
  useHapticOn(tone === 'success' ? text : null, 'success');
  return (
    <Animated.View style={[styles.banner, { backgroundColor: bg }, shake]} accessibilityLiveRegion="polite" accessibilityRole="alert">
      <Ionicons name={icon} size={20} color={fg} />
      <Txt variant="label" color={fg} style={{ flex: 1 }}>
        {text}
      </Txt>
    </Animated.View>
  );
}

/** 6-digit OTP boxes backed by one hidden input (supports paste + SMS autofill). */
export function OtpInput({ value, onChange, length = 6, error }: { value: string; onChange: (v: string) => void; length?: number; error?: boolean }) {
  const { c } = useTheme();
  const ref = useRef<InputRef>(null);
  const shake = useShake(error ? `${error}:${value}` : null);
  return (
    <Animated.View style={shake}>
    <Pressable onPress={() => ref.current?.focus()} accessibilityLabel="Verification code" style={styles.otpRow}>
      {Array.from({ length }).map((_, i) => {
        const active = i === Math.min(value.length, length - 1);
        return (
          <View key={i} style={[styles.otpBox, { borderColor: error ? c.danger : active ? c.primary : c.border, backgroundColor: c.surface }, active && { borderWidth: 2 }]}>
            <Txt variant="title">{value[i] ?? ''}</Txt>
          </View>
        );
      })}
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        autoFocus
        maxLength={length}
        style={styles.hidden}
        caretHidden
      />
    </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  check: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: touch.min },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.6, alignItems: 'center', justifyContent: 'center' },
  back: { width: touch.min, height: touch.min, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  line: { flex: 1, height: 1 },
  banner: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 12, borderRadius: radius.md },
  otpRow: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  otpBox: { width: 48, height: 58, borderRadius: radius.md, borderWidth: 1.4, alignItems: 'center', justifyContent: 'center' },
  hidden: { position: 'absolute', opacity: 0, width: 1, height: 1 },
});

/** Shown when a link points to something that no longer exists (old link, deleted item, typo). Never a blank screen. */
export function NotFound({ title = 'We couldn’t find that', text = 'This link may be old, or the item was removed.', action = 'Go back', fallback = '/home' }: { title?: string; text?: string; action?: string; fallback?: string }) {
  const { c } = useTheme();
  React.useEffect(() => { haptic('warning'); }, []);
  return (
    <View style={{ flex: 1, backgroundColor: c.ivory, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }} accessibilityRole="alert">
      <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="search-outline" size={38} color={c.muted} />
      </View>
      <Txt variant="title" center>{title}</Txt>
      <Txt color={c.inkSoft} center style={{ maxWidth: 320 }}>{text}</Txt>
      <Pressable
        onPress={() => { haptic('tap'); router.canGoBack() ? router.back() : router.replace(fallback as never); }}
        accessibilityRole="button"
        style={{ marginTop: 8, minHeight: touch.min, paddingHorizontal: 22, borderRadius: radius.pill, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}
      >
        <Txt variant="bodyStrong" color="#fff">{action}</Txt>
      </Pressable>
    </View>
  );
}
