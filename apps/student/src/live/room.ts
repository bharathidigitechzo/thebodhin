/**
 * One interface for a live room, whatever carries the media:
 *   • MeshRoom    (live/mesh.ts)       — built-in WebRTC between the teacher and each learner, no server to run.
 *   • LiveKitRoom (live/livekit.ts)    — self-hosted LiveKit for big classes (used when a token endpoint is configured).
 * The screens only talk to this file's types, so switching provider changes nothing on screen.
 */
import type { RoomMsg, RoomRole } from './protocol';

export interface Person {
  /** Unique per browser tab / device session (one learner in two tabs is two people here). */
  id: string;
  userId: string;
  name: string;
  role: RoomRole;
  mic: boolean;
  cam: boolean;
  screen: boolean;
  speaking: boolean;
  joinedAt: number;
}

export interface PersonStreams {
  camera: MediaStream | null;
  screen: MediaStream | null;
}

export type ConnState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface RoomEvents {
  /** Everyone in the room, yourself first. */
  onPeople(people: Person[]): void;
  /** Video/audio streams by person id (remote people only). */
  onStreams(streams: Record<string, PersonStreams>): void;
  onMsg(m: RoomMsg, from: Person): void;
  onState(s: ConnState, detail?: string): void;
}

export interface LiveRoom {
  connect(): Promise<void>;
  send(m: RoomMsg): void;
  /** Resolve when the change is live; reject with a MediaError whose message says how to fix it. */
  setMic(on: boolean, deviceId?: string): Promise<void>;
  setCam(on: boolean, deviceId?: string): Promise<void>;
  setScreen(on: boolean): Promise<void>;
  /** Your own camera, for the self-view tile (null while the camera is off). */
  localCamera(): MediaStream | null;
  localScreen(): MediaStream | null;
  disconnect(): void;
}

export interface RoomOptions {
  room: string;
  userId: string;
  name: string;
  role: RoomRole;
  /** The people allowed to act as host (the academy's teachers for this class). Receivers ignore a "host" claim from anyone else. */
  hostUserIds: string[];
  provider: 'mesh' | 'livekit';
  url?: string;
  token?: string;
}

/** Public STUN is enough for most networks; add your own TURN for strict corporate / mobile networks. */
export function iceServers(): RTCIceServer[] {
  const list: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  const url = process.env.EXPO_PUBLIC_TURN_URL;
  if (url) list.push({ urls: url.split(','), username: process.env.EXPO_PUBLIC_TURN_USER, credential: process.env.EXPO_PUBLIC_TURN_PASS });
  return list;
}

export async function createRoom(o: RoomOptions, ev: RoomEvents): Promise<LiveRoom> {
  if (o.provider === 'livekit' && o.url && o.token) {
    const { LiveKitRoom } = await import('./livekit');
    return new LiveKitRoom(o, ev);
  }
  const { MeshRoom } = await import('./mesh');
  return new MeshRoom(o, ev);
}
