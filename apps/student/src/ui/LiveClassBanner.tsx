/**
 * "Your class is live — Join" strip shown on every screen while one of the learner's classes is running.
 * Appears the moment the teacher presses Go live (realtime announcement, then the shared data), and a system
 * notification is shown too if the learner allowed them. Hidden inside live rooms and on educator/admin screens.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/store/auth';
import { systemNotify, useLiveNow } from '@/live/useLiveWatch';
import { Txt } from './Txt';

export function LiveClassBanner() {
  const { session } = useAuth();
  const path = usePathname();
  const insets = useSafeAreaInsets();
  const userId = session?.user.id ?? '';
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const items = useLiveNow(userId, (c) => systemNotify(`${c.title} is live now`, `${c.tutor} started the class. Tap to join.`, () => router.push({ pathname: '/live-room/[id]', params: { id: c.id } })));

  const inRoom = /^\/(live-room|edu|educator|admin|mentor-room|watch|learn)/.test(path);
  const it = items.find((x) => !hidden[x.id]);
  if (!userId || inRoom || !it) return null;
  return (
    <View style={[styles.bar, { paddingTop: Math.max(insets.top, 8) }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <View style={styles.dot} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="label" color="#fff" numberOfLines={1}>{it.title} is live now</Txt>
        <Txt variant="caption" color="rgba(255,255,255,0.8)" numberOfLines={1}>{it.tutor} · {it.course}</Txt>
      </View>
      <Pressable onPress={() => router.push({ pathname: '/live-room/[id]', params: { id: it.id } })} style={styles.join} accessibilityRole="button" accessibilityLabel={`Join ${it.title}`}>
        <Txt variant="label" color="#12407F" style={{ fontWeight: '800' }}>Join</Txt>
      </Pressable>
      <Pressable onPress={() => setHidden((h) => ({ ...h, [it.id]: true }))} style={styles.x} accessibilityRole="button" accessibilityLabel="Dismiss">
        <Ionicons name="close" size={18} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#C62828', paddingBottom: 8, paddingHorizontal: 12 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff' },
  join: { minHeight: 36, paddingHorizontal: 16, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  x: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});
