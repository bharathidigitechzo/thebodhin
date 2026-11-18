import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/store/auth';
import { Txt } from './Txt';

interface LiveAlert {
  sessionId: string;
  title: string;
}

export function LiveClassBanner() {
  const { session } = useAuth();
  const [alert, setAlert] = useState<LiveAlert | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
    try {
      const bc = new BroadcastChannel('bodhin_notifications');
      bc.onmessage = (event) => {
        const d = event.data;
        if (d && d.kind === 'live' && d.link?.params?.id) {
          // If message is targeted to specific user or general live class
          if (!d.userId || (session && d.userId === session.user.id)) {
            setAlert({
              sessionId: d.link.params.id,
              title: d.title || 'Live class has started',
            });
          }
        }
      };
      return () => {
        bc.close();
      };
    } catch {}
  }, [session]);

  if (!alert) return null;

  return (
    <View style={styles.banner} accessibilityRole="alert">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
        <View style={styles.dot} />
        <Txt variant="label" color="#fff" style={{ fontWeight: '700' }} numberOfLines={1}>
          {alert.title}
        </Txt>
      </View>
      <Pressable
        onPress={() => {
          const sid = alert.sessionId;
          setAlert(null);
          router.push({ pathname: '/live-room/[id]', params: { id: sid } });
        }}
        style={styles.joinBtn}
        accessibilityRole="button"
      >
        <Txt variant="caption" color="#fff" style={{ fontWeight: '700' }}>
          Join now
        </Txt>
      </Pressable>
      <Pressable onPress={() => setAlert(null)} hitSlop={8} style={{ padding: 4 }}>
        <Ionicons name="close" size={16} color="rgba(255,255,255,0.8)" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#E5383B',
    paddingVertical: 8,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    zIndex: 9999,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  joinBtn: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
});
