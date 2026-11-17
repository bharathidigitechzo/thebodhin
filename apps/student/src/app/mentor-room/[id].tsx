/**
 * 1:1 mentorship room (learner + tutor). Real: the same LiveKit room service as live classes, a 2-person room
 * (POST live-token with the mentorship id). Here: a mock room with camera, mic and leave, and the session timer.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError } from '@/api/client';
import { mentorship } from '@/api/academy';
import { useAuth } from '@/store/auth';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { Banner } from '@/ui/misc';
import { haptic } from '@/ui/haptics';

type Room = Awaited<ReturnType<typeof mentorship.join>>;

export default function MentorRoom() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const [room, setRoom] = useState<Room | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [sec, setSec] = useState(0);
  useEffect(() => { mentorship.join(session?.user.id ?? '', id).then(setRoom).catch((e) => setErr(e instanceof ApiError ? e.message : 'Could not open the room.')); }, [id, session?.user.id]);
  useEffect(() => { if (!room) return; const t = setInterval(() => setSec((s) => s + 1), 1000); return () => clearInterval(t); }, [room]);
  const leave = () => { haptic('tap'); router.canGoBack() ? router.back() : router.replace('/home'); };
  const mm = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

  return (
    <View style={{ flex: 1, backgroundColor: '#0B1220' }}>
      <SafeAreaView style={{ flex: 1, padding: 16, gap: 12 }}>
        {err ? (
          <View style={{ flex: 1, justifyContent: 'center', gap: 12 }}>
            <Banner text={err} />
            <Button title="Back" onPress={leave} />
          </View>
        ) : !room ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Txt color="#fff">Connecting…</Txt></View>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={[s.dot, { backgroundColor: '#EF4444' }]} />
              <Txt variant="bodyStrong" color="#fff" style={{ flex: 1 }} numberOfLines={1}>1:1 with {room.other}</Txt>
              <Txt color="#CBD5E1" accessibilityLabel={`Time in session ${mm}`}>{mm} / {room.r.durationMin}:00</Txt>
            </View>
            <Txt variant="caption" color="#94A3B8" numberOfLines={1}>{room.course.title}</Txt>
            <View style={[s.tile, { flex: 1 }]} accessibilityLabel={`${room.other}'s video`}>
              <Ionicons name="person" size={72} color="#475569" />
              <Txt color="#CBD5E1">{room.other}</Txt>
            </View>
            <View style={[s.tile, s.self]} accessibilityLabel={cam ? 'Your camera is on' : 'Your camera is off'}>
              <Ionicons name={cam ? 'videocam' : 'videocam-off'} size={24} color="#CBD5E1" />
              <Txt variant="caption" color="#CBD5E1">You</Txt>
            </View>
            <View style={s.bar}>
              <Ctl icon={mic ? 'mic' : 'mic-off'} label={mic ? 'Mute' : 'Unmute'} on={mic} onPress={() => { haptic('toggle'); setMic(!mic); }} />
              <Ctl icon={cam ? 'videocam' : 'videocam-off'} label={cam ? 'Camera off' : 'Camera on'} on={cam} onPress={() => { haptic('toggle'); setCam(!cam); }} />
              <Pressable onPress={leave} accessibilityRole="button" accessibilityLabel="Leave" style={[s.ctl, { backgroundColor: '#DC2626', width: 72 }]}>
                <Ionicons name="call" size={22} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
              </Pressable>
            </View>
          </>
        )}
      </SafeAreaView>
    </View>
  );
}

function Ctl({ icon, label, on, onPress }: { icon: string; label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={[s.ctl, { backgroundColor: on ? '#1E293B' : '#F8FAFC' }]}>
      <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={22} color={on ? '#fff' : '#0B1220'} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  dot: { width: 10, height: 10, borderRadius: 5 },
  tile: { backgroundColor: '#111827', borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 8 },
  self: { position: 'absolute', right: 28, bottom: 110, width: 110, height: 140, borderWidth: 1, borderColor: '#334155' },
  bar: { flexDirection: 'row', justifyContent: 'center', gap: 16, paddingVertical: 8 },
  ctl: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
});
