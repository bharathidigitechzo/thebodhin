/**
 * LiveKit provider (Apache-2.0, self-hosted) for big classes. Headless `livekit-client` only — no LiveKit UI is
 * ever drawn, so nothing of LiveKit shows on screen. Web works as-is. Native (iOS/Android) needs
 * `@livekit/react-native` + `@livekit/react-native-webrtc` in an EAS dev build (not Expo Go).
 * Turn it on with EXPO_PUBLIC_LIVE_TOKEN_URL (see docs/Bodhin_Live_and_Playground.md); otherwise the built-in mesh room runs.
 */
import { Platform } from 'react-native';
import { ConnectionState, Room, RoomEvent, Track, type Participant, type RemoteParticipant } from 'livekit-client';
import { decodeMsg, encodeMsg, isAllowedFrom, type RoomMsg } from './protocol';
import { explainMedia, MediaError } from './media';
import type { LiveRoom, Person, PersonStreams, RoomEvents, RoomOptions } from './room';

export async function prepareNative() {
  if (Platform.OS === 'web') return;
  try {
    const mod = require('@livekit/react-native'); // eslint-disable-line @typescript-eslint/no-var-requires
    mod.registerGlobals();
  } catch {
    throw new MediaError('unsupported', 'Live classes on mobile need the Bodhin app build (native WebRTC). You can join from a browser meanwhile.');
  }
}

export class LiveKitRoom implements LiveRoom {
  private room = new Room({ adaptiveStream: true, dynacast: true, disconnectOnPageLeave: true });
  private cache = new Map<string, { sig: string; s: PersonStreams }>();
  private audio = new Map<string, HTMLMediaElement>();
  private joinedAt = new Map<string, number>();
  constructor(private o: RoomOptions, private ev: RoomEvents) {}

  private person = (p: Participant): Person => {
    if (!this.joinedAt.has(p.identity)) this.joinedAt.set(p.identity, p.joinedAt?.getTime?.() ?? Date.now());
    return {
      id: p.identity,
      userId: p.identity,
      name: p.name || p.identity,
      role: this.o.hostUserIds.includes(p.identity) ? 'host' : 'student',
      mic: p.isMicrophoneEnabled,
      cam: p.isCameraEnabled,
      screen: p.isScreenShareEnabled,
      speaking: p.isSpeaking,
      joinedAt: this.joinedAt.get(p.identity)!,
    };
  };

  private streamOf(p: RemoteParticipant): PersonStreams {
    const cam = p.getTrackPublication(Track.Source.Camera)?.track?.mediaStreamTrack;
    const mic = p.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack;
    const scr = p.getTrackPublication(Track.Source.ScreenShare)?.track?.mediaStreamTrack;
    const sig = [cam?.id, mic?.id, scr?.id].join('|');
    const hit = this.cache.get(p.identity);
    if (hit && hit.sig === sig) return hit.s;
    const s: PersonStreams = {
      camera: cam ? new MediaStream([cam]) : null,
      screen: scr ? new MediaStream([scr]) : null,
    };
    this.cache.set(p.identity, { sig, s });
    return s;
  }

  private push = () => {
    const r = this.room;
    const remotes = Array.from(r.remoteParticipants.values());
    this.ev.onPeople([this.person(r.localParticipant), ...remotes.map(this.person)]);
    const streams: Record<string, PersonStreams> = {};
    remotes.forEach((p) => (streams[p.identity] = this.streamOf(p)));
    this.ev.onStreams(streams);
  };

  async connect() {
    await prepareNative();
    const r = this.room;
    r.on(RoomEvent.ConnectionStateChanged, (s) => this.ev.onState(s === ConnectionState.Connected ? 'connected' : s === ConnectionState.Reconnecting ? 'reconnecting' : s === ConnectionState.Disconnected ? 'disconnected' : 'connecting'));
    r.on(RoomEvent.ParticipantConnected, this.push)
      .on(RoomEvent.ParticipantDisconnected, this.push)
      .on(RoomEvent.ActiveSpeakersChanged, this.push)
      .on(RoomEvent.TrackMuted, this.push)
      .on(RoomEvent.TrackUnmuted, this.push)
      .on(RoomEvent.LocalTrackPublished, this.push)
      .on(RoomEvent.LocalTrackUnpublished, this.push)
      .on(RoomEvent.TrackSubscribed, (t, _pub, p) => {
        // Remote audio must be attached to an element on web (native handles it via registerGlobals).
        if (t.kind === Track.Kind.Audio && Platform.OS === 'web') {
          const el = t.attach();
          el.style.display = 'none';
          document.body.appendChild(el);
          this.audio.set(`${p.identity}:${t.sid}`, el);
        }
        this.push();
      })
      .on(RoomEvent.TrackUnsubscribed, (t, _pub, p) => {
        t.detach().forEach((el) => el.remove());
        this.audio.delete(`${p.identity}:${t.sid}`);
        this.push();
      })
      .on(RoomEvent.DataReceived, (data: Uint8Array, from?: RemoteParticipant) => {
        const m = decodeMsg(data);
        if (!m || !from) return;
        const who = this.person(from);
        if (!isAllowedFrom(m, who.role)) return; // students cannot send host-only messages
        this.ev.onMsg(m, who);
      });
    await r.connect(this.o.url!, this.o.token!);
    this.push();
  }

  send(m: RoomMsg) {
    void this.room.localParticipant.publishData(encodeMsg(m), { reliable: m.t !== 'stroke' }).catch(() => {});
  }

  private async toggle(fn: () => Promise<unknown>, what: 'camera' | 'microphone' | 'screen') {
    try {
      await fn();
    } catch (e) {
      throw e instanceof MediaError ? e : explainMedia(e, what);
    }
    this.push();
  }
  setMic(on: boolean, deviceId?: string) {
    return this.toggle(() => this.room.localParticipant.setMicrophoneEnabled(on, deviceId ? { deviceId } : undefined), 'microphone');
  }
  setCam(on: boolean, deviceId?: string) {
    return this.toggle(() => this.room.localParticipant.setCameraEnabled(on, deviceId ? { deviceId } : undefined), 'camera');
  }
  setScreen(on: boolean) {
    return this.toggle(() => this.room.localParticipant.setScreenShareEnabled(on), 'screen');
  }
  private own = new Map<string, { id: string; s: MediaStream }>();
  private ownStream(src: Track.Source, key: string) {
    const t = this.room.localParticipant.getTrackPublication(src)?.track?.mediaStreamTrack;
    if (!t || t.readyState === 'ended') return null;
    const hit = this.own.get(key);
    if (hit && hit.id === t.id) return hit.s;
    const s = new MediaStream([t]);
    this.own.set(key, { id: t.id, s });
    return s;
  }
  localCamera() {
    return this.room.localParticipant.isCameraEnabled ? this.ownStream(Track.Source.Camera, 'cam') : null;
  }
  localScreen() {
    return this.ownStream(Track.Source.ScreenShare, 'scr');
  }
  disconnect() {
    this.audio.forEach((el) => el.remove());
    this.audio.clear();
    void this.room.disconnect();
  }
}
