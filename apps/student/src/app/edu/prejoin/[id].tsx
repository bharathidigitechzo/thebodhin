/** Pre-join check for the host: real camera + microphone preview, device choice, connection check, then go live. */
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, liveAdmin } from '@/api/client';
import { courseLive } from '@/api/academy';
import { TextField } from '@/ui/TextField';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout } from '@/theme/tokens';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { BottomSheet, IconButton } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { DeviceCheck, useDeviceCheck } from '@/ui/DeviceCheck';

export default function PreJoin() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const info = liveAdmin.get(userId, id);
  const check = useDeviceCheck({ mic: true, cam: true });
  const [online, setOnline] = useState(typeof navigator === 'undefined' || navigator.onLine !== false);
  const [err, setErr] = useState<string | null>(null);
  // Cancel a course-wide class (Nov 16 change request T3): reason required, every buyer is notified.
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [cancelErr, setCancelErr] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.addEventListener) return;
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (!info || !session) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.ivory, padding: 20, justifyContent: 'center', gap: 16 }}>
        <Banner text="You can’t host this class." />
        <Button title="Back to Live" onPress={() => router.replace('/educator/live')} />
      </SafeAreaView>
    );
  }
  const s = info.session;
  const minsToStart = Math.round((new Date(s.startsAt).getTime() - Date.now()) / 6e4);
  const early = minsToStart > 15;
  const courseWide = !s.batchId;
  const canCancel = courseWide && minsToStart > 0 && !s.started; // the API also refuses classes that have started
  const online_ = s.mode === 'online';
  // Course-wide classes go to everyone who bought the course, not the academy's whole contact list.
  const audienceCount = courseWide ? courseLive.buyers(s.courseId).length : info.audience.length;
  const doCancel = async () => {
    setCancelling(true);
    setCancelErr(null);
    try {
      await courseLive.cancel(userId, id, reason);
      setCancelOpen(false);
      router.replace('/educator/live');
    } catch (e) {
      setCancelErr(e instanceof ApiError ? e.message : 'Could not cancel the class.');
    } finally {
      setCancelling(false);
    }
  };
  const go = () => {
    try {
      liveAdmin.start(userId, id); // marks the class live and notifies the learners
      const cam = check.cam, mic = check.mic, camDev = check.camId, micDev = check.micId;
      check.release(); // hand the devices over to the room
      router.replace({ pathname: '/edu/host/[id]', params: { id, cam: cam ? '1' : '0', mic: mic ? '1' : '0', ...(camDev ? { camDev } : {}), ...(micDev ? { micDev } : {}) } });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not start the class.');
    }
  };
  const checks = [
    { ok: check.supported, t: check.supported ? 'This browser can use your camera and microphone' : 'Camera and microphone are not available here — use Chrome, Edge or Safari on https' },
    { ok: check.cam, t: check.cam ? 'Camera is on' : 'Camera is off — students will see your initials' },
    { ok: check.mic && check.level > 0.03, t: check.mic ? (check.level > 0.03 ? 'Microphone is picking up your voice' : 'Microphone is on — say something to test it') : 'Microphone is muted — students will not hear you' },
    { ok: online, t: online ? 'You are online' : 'You are offline — check your internet' },
    { ok: true, t: s.settings.record ? 'This class is set to be recorded' : 'This class will not be recorded' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <View style={styles.top}>
          <IconButton icon="chevron-back" label="Go back" tone="filled" onPress={() => { check.release(); router.canGoBack() ? router.back() : router.replace('/educator/live'); }} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt variant="heading" numberOfLines={1}>{s.started ? 'Return to your class' : 'Ready to go live?'}</Txt>
            <Txt variant="caption" color={c.muted} numberOfLines={1}>{s.title}</Txt>
          </View>
        </View>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.inner}>
            <DeviceCheck check={check} name={session.user.name} />

            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Txt variant="label" color={c.muted}>CHECKLIST</Txt>
              {checks.map((k) => (
                <View key={k.t} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name={k.ok ? 'checkmark-circle' : 'alert-circle'} size={20} color={k.ok ? c.success : c.warning} />
                  <Txt style={{ flex: 1 }}>{k.t}</Txt>
                </View>
              ))}
              <View style={[styles.note, { backgroundColor: c.surfaceMuted }]}>
                <Txt variant="caption" color={c.inkSoft}>
                  {s.started ? 'The class is already live. Students are in the room — rejoin and carry on.' : `${audienceCount} ${audienceCount === 1 ? 'student' : 'students'} will get a notification the moment you go live.`} {s.settings.chat ? 'Chat' : 'No chat'} · {s.settings.qa ? 'Q&A on' : 'Q&A off'} · {s.settings.trackAttendance ? 'Auto attendance' : 'Manual attendance'}
                </Txt>
              </View>
            </View>
            {early && !s.started && <Banner tone="info" text={`This class starts in ${minsToStart >= 120 ? `${Math.round(minsToStart / 60)} hours` : `${minsToStart} minutes`}. You can still go live early — students are notified when you do.`} />}
            {!online_ && <Banner text="This class is in person. There is no online room to open." />}
            {err && <Banner text={err} />}
          </View>
        </ScrollView>
        <View style={[styles.footer, { borderTopColor: c.border, backgroundColor: c.surface }]}>
          <Button title={s.started ? 'Rejoin class' : early ? 'Go live early' : 'Go live now'} iconLeft="radio" disabled={!online_ || !online} onPress={go} style={{ width: '100%', maxWidth: layout.contentMaxWidth, backgroundColor: '#E8A21B' }} />
          {!check.mic && !check.cam && <Txt variant="caption" color={c.muted} center style={{ marginTop: 6 }}>You can switch your microphone and camera on inside the class too.</Txt>}
          {canCancel && (
            <Button title="Cancel this class" variant="outline" iconLeft="close-circle-outline" onPress={() => { setCancelErr(null); setCancelOpen(true); }} style={{ width: '100%', maxWidth: layout.contentMaxWidth, marginTop: 8 }} />
          )}
        </View>
      </SafeAreaView>
      <BottomSheet
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this class?"
        footer={<Button title="Cancel and notify students" size="md" style={{ flex: 1, backgroundColor: c.danger }} loading={cancelling} onPress={doCancel} />}
      >
        <Txt variant="bodyStrong">{s.title}</Txt>
        <Txt color={c.muted}>{audienceCount} {audienceCount === 1 ? 'student gets' : 'students get'} a notification with your reason. The class leaves their Live tab.</Txt>
        <TextField label="Reason (students see this)" value={reason} onChangeText={(t) => { setReason(t); setCancelErr(null); }} placeholder="e.g. Trainer unwell, moved to next week" error={cancelErr ?? undefined} maxLength={200} />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  scroll: { alignItems: 'center', paddingHorizontal: 16, paddingBottom: 24 },
  inner: { width: '100%', maxWidth: layout.contentMaxWidth, gap: 12 },
  card: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 10 },
  note: { borderRadius: 12, padding: 10 },
  footer: { borderTopWidth: 1, padding: 12, alignItems: 'center' },
});
