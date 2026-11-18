/**
 * Camera + microphone check used before a class (teacher's "ready to go live?" and learner's lobby):
 * a real preview of your camera, a live microphone level meter, working on/off switches, device choice and a
 * speaker test. Whatever you leave on here is what the room opens with.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { listDevices, MediaError, mediaSupported, openCam, openMic, playTestTone, stopTrack, watchLevel, type Device } from '@/live/media';
import { Txt } from './Txt';
import { Avatar, Chip } from './kit';
import { RoomVideo } from './RoomVideo';

export function useDeviceCheck(initial: { mic: boolean; cam: boolean } = { mic: true, cam: true }) {
  const camTrack = useRef<MediaStreamTrack | null>(null);
  const micTrack = useRef<MediaStreamTrack | null>(null);
  const stopMeter = useRef<(() => void) | null>(null);
  const alive = useRef(true);
  const [camStream, setCamStream] = useState<MediaStream | null>(null);
  const [cam, setCam] = useState(false);
  const [mic, setMic] = useState(false);
  const [level, setLevel] = useState(0);
  const [devices, setDevices] = useState<{ mics: Device[]; cams: Device[] }>({ mics: [], cams: [] });
  const [camId, setCamId] = useState<string | undefined>();
  const [micId, setMicId] = useState<string | undefined>();
  const [err, setErr] = useState<{ cam?: string; mic?: string }>({});
  const [busy, setBusy] = useState(false);

  const refreshDevices = useCallback(() => listDevices().then((d) => alive.current && setDevices(d)).catch(() => {}), []);

  const startCam = useCallback(async (id?: string) => {
    setBusy(true);
    try {
      stopTrack(camTrack.current);
      const t = await openCam(id);
      if (!alive.current) return stopTrack(t);
      camTrack.current = t;
      setCamStream(new MediaStream([t]));
      setCam(true);
      setErr((e) => ({ ...e, cam: undefined }));
      setCamId(t.getSettings().deviceId);
      void refreshDevices();
    } catch (e) {
      camTrack.current = null;
      setCamStream(null);
      setCam(false);
      setErr((x) => ({ ...x, cam: e instanceof MediaError ? e.message : 'Could not start the camera.' }));
    } finally {
      setBusy(false);
    }
  }, [refreshDevices]);

  const stopCam = useCallback(() => {
    stopTrack(camTrack.current);
    camTrack.current = null;
    setCamStream(null);
    setCam(false);
  }, []);

  const startMic = useCallback(async (id?: string) => {
    setBusy(true);
    try {
      stopMeter.current?.();
      stopTrack(micTrack.current);
      const t = await openMic(id);
      if (!alive.current) return stopTrack(t);
      micTrack.current = t;
      stopMeter.current = watchLevel(t, (l) => alive.current && setLevel(l));
      setMic(true);
      setErr((e) => ({ ...e, mic: undefined }));
      setMicId(t.getSettings().deviceId);
      void refreshDevices();
    } catch (e) {
      micTrack.current = null;
      setMic(false);
      setErr((x) => ({ ...x, mic: e instanceof MediaError ? e.message : 'Could not start the microphone.' }));
    } finally {
      setBusy(false);
    }
  }, [refreshDevices]);

  const stopMic = useCallback(() => {
    stopMeter.current?.();
    stopMeter.current = null;
    stopTrack(micTrack.current);
    micTrack.current = null;
    setMic(false);
    setLevel(0);
  }, []);

  /** Close the preview devices. Call before the room opens its own, so the browser hands the device over cleanly. */
  const release = useCallback(() => {
    stopMic();
    stopCam();
  }, [stopCam, stopMic]);

  useEffect(() => {
    alive.current = true;
    if (initial.cam) void startCam();
    if (initial.mic) void startMic();
    void refreshDevices();
    return () => {
      alive.current = false;
      stopMeter.current?.();
      stopTrack(camTrack.current);
      stopTrack(micTrack.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    supported: mediaSupported(),
    cam,
    mic,
    camStream,
    level,
    devices,
    camId,
    micId,
    err,
    busy,
    toggleCam: () => (cam ? stopCam() : void startCam(camId)),
    toggleMic: () => (mic ? stopMic() : void startMic(micId)),
    pickCam: (id: string) => void startCam(id),
    pickMic: (id: string) => void startMic(id),
    release,
  };
}

export type DeviceCheckState = ReturnType<typeof useDeviceCheck>;

export function DeviceCheck({ check, name, dark = false }: { check: DeviceCheckState; name: string; dark?: boolean }) {
  const { c } = useTheme();
  const bars = [0.08, 0.2, 0.34, 0.5, 0.7];
  return (
    <View style={{ gap: 12 }}>
      <View style={[s.preview, { backgroundColor: '#0B1426' }]}>
        {check.camStream ? <RoomVideo stream={check.camStream} mirror label="Your camera preview" /> : (
          <View style={s.noCam}>
            <Avatar name={name} size={84} />
            <Txt variant="caption" color="rgba(255,255,255,0.7)" center>{check.supported ? 'Camera is off. Others will see your initials.' : 'Camera is not available here.'}</Txt>
          </View>
        )}
        <View style={s.bar}>
          <View style={[s.nameTag]}><Txt variant="caption" color="#fff">{name.split(' ')[0]}</Txt></View>
          <View style={s.meter} accessibilityLabel={`Microphone level ${Math.round(check.level * 100)} percent`} accessibilityRole="progressbar">
            <Ionicons name={check.mic ? 'mic' : 'mic-off'} size={14} color={check.mic ? '#4ADE80' : '#FF6B6E'} />
            {bars.map((t, i) => <View key={i} style={{ width: 4, borderRadius: 2, height: 6 + i * 3, backgroundColor: check.mic && check.level > t ? '#4ADE80' : 'rgba(255,255,255,0.3)' }} />)}
          </View>
        </View>
      </View>

      <View style={s.toggles}>
        <Switch icon={check.mic ? 'mic' : 'mic-off'} label={check.mic ? 'Mic on' : 'Mic off'} on={check.mic} onPress={check.toggleMic} dark={dark} />
        <Switch icon={check.cam ? 'videocam' : 'videocam-off'} label={check.cam ? 'Camera on' : 'Camera off'} on={check.cam} onPress={check.toggleCam} dark={dark} />
      </View>

      {!!check.err.cam && <Problem text={check.err.cam} />}
      {!!check.err.mic && <Problem text={check.err.mic} />}
      {check.mic && check.level < 0.03 && <Txt variant="caption" color={c.muted}>Say something — the bars should move. If they don’t, pick another microphone below.</Txt>}

      {(check.devices.cams.length > 1 || check.devices.mics.length > 1) && (
        <View style={{ gap: 8 }}>
          {check.devices.cams.length > 1 && (
            <>
              <Txt variant="label" color={dark ? '#fff' : c.ink}>Camera</Txt>
              <View style={s.chips}>{check.devices.cams.map((d) => <Chip key={d.id} label={d.label} active={check.camId === d.id} onPress={() => check.pickCam(d.id)} />)}</View>
            </>
          )}
          {check.devices.mics.length > 1 && (
            <>
              <Txt variant="label" color={dark ? '#fff' : c.ink}>Microphone</Txt>
              <View style={s.chips}>{check.devices.mics.map((d) => <Chip key={d.id} label={d.label} active={check.micId === d.id} onPress={() => check.pickMic(d.id)} />)}</View>
            </>
          )}
        </View>
      )}
      <Pressable onPress={playTestTone} accessibilityRole="button" accessibilityLabel="Play a test sound" style={s.test}>
        <Ionicons name="volume-medium-outline" size={18} color={c.primary} />
        <Txt variant="label" color={c.primary}>Test my speakers</Txt>
      </Pressable>
    </View>
  );
}

function Problem({ text }: { text: string }) {
  const { c } = useTheme();
  return (
    <View style={[s.problem, { backgroundColor: c.warningBg }]} accessibilityRole="alert">
      <Ionicons name="alert-circle" size={18} color={c.warning} />
      <Txt variant="caption" color={c.ink} style={{ flex: 1 }}>{text}</Txt>
    </View>
  );
}

function Switch({ icon, label, on, onPress, dark }: { icon: keyof typeof Ionicons.glyphMap; label: string; on: boolean; onPress: () => void; dark?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} style={[s.toggle, { backgroundColor: on ? (dark ? 'rgba(255,255,255,0.12)' : c.surface) : c.dangerBg, borderColor: on ? (dark ? 'rgba(255,255,255,0.25)' : c.border) : c.danger }]} accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel={label}>
      <Ionicons name={icon} size={22} color={on ? (dark ? '#fff' : c.ink) : c.danger} />
      <Txt variant="label" color={on ? (dark ? '#fff' : c.ink) : c.danger}>{label}</Txt>
    </Pressable>
  );
}

const s = StyleSheet.create({
  preview: { borderRadius: 20, aspectRatio: 16 / 9, width: '100%', maxHeight: 360, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  noCam: { alignItems: 'center', gap: 10, padding: 16 },
  bar: { position: 'absolute', left: 10, right: 10, bottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nameTag: { backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  meter: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8 },
  toggles: { flexDirection: 'row', gap: 10 },
  toggle: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 16, minHeight: 54 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  problem: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 10, borderRadius: 12 },
  test: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, alignSelf: 'flex-start' },
});
