/**
 * React hook around a LiveRoom: connects when you hand it options, hands back people, video streams and
 * working mic / camera / screen toggles. Both the teacher's room and the learner's room use it, so media
 * behaves the same on both sides.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoomMsg } from './protocol';
import { MediaError } from './media';
import { createRoom, type ConnState, type LiveRoom, type Person, type PersonStreams, type RoomOptions } from './room';

export interface LiveRoomOptions extends RoomOptions {
  /** Open these when the room connects (they were chosen in the pre-join check). */
  startMic?: boolean;
  startCam?: boolean;
  micDevice?: string;
  camDevice?: string;
}

export function useLiveRoom(opts: LiveRoomOptions | null, onMsg: (m: RoomMsg, from: Person) => void) {
  const room = useRef<LiveRoom | null>(null);
  const handler = useRef(onMsg);
  handler.current = onMsg;
  const [status, setStatus] = useState<'idle' | ConnState | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [streams, setStreams] = useState<Record<string, PersonStreams>>({});
  const [, bump] = useState(0);
  const [busy, setBusy] = useState<{ mic: boolean; cam: boolean; screen: boolean }>({ mic: false, cam: false, screen: false });

  const key = opts ? `${opts.provider}|${opts.room}|${opts.userId}` : '';
  useEffect(() => {
    if (!opts) return;
    let dead = false;
    setStatus('connecting');
    setError(null);
    (async () => {
      try {
        const r = await createRoom(opts, {
          onPeople: (p) => !dead && (setPeople(p), bump((n) => n + 1)),
          onStreams: (s) => !dead && setStreams(s),
          onMsg: (m, from) => !dead && handler.current(m, from),
          onState: (s) => !dead && setStatus(s),
        });
        if (dead) return r.disconnect();
        room.current = r;
        await r.connect();
        if (dead) return;
        // Start with the devices chosen in the check. A failure here is shown, never fatal: you can still join and fix it.
        if (opts.startMic) await r.setMic(true, opts.micDevice).catch((e) => !dead && setNotice(e instanceof MediaError ? e.message : 'Could not start your microphone.'));
        if (opts.startCam) await r.setCam(true, opts.camDevice).catch((e) => !dead && setNotice(e instanceof MediaError ? e.message : 'Could not start your camera.'));
        bump((n) => n + 1);
      } catch (e) {
        if (!dead) {
          setStatus('error');
          setError(e instanceof Error ? e.message : 'Could not open the live room.');
        }
      }
    })();
    return () => {
      dead = true;
      room.current?.disconnect();
      room.current = null;
      setStatus('idle');
      setPeople([]);
      setStreams({});
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const me = people[0] ?? null;
  const run = useCallback(async (kind: 'mic' | 'cam' | 'screen', on: boolean, deviceId?: string) => {
    const r = room.current;
    if (!r) return;
    setNotice(null);
    setBusy((b) => ({ ...b, [kind]: true }));
    try {
      if (kind === 'mic') await r.setMic(on, deviceId);
      else if (kind === 'cam') await r.setCam(on, deviceId);
      else await r.setScreen(on);
    } catch (e) {
      setNotice(e instanceof MediaError ? e.message : 'Something went wrong with your device. Try again.');
    } finally {
      setBusy((b) => ({ ...b, [kind]: false }));
      bump((n) => n + 1);
    }
  }, []);

  return {
    status,
    error,
    notice,
    clearNotice: () => setNotice(null),
    people,
    me,
    streams,
    mic: !!me?.mic,
    cam: !!me?.cam,
    screen: !!me?.screen,
    busy,
    localCamera: room.current?.localCamera() ?? null,
    localScreen: room.current?.localScreen() ?? null,
    setMic: (on: boolean, deviceId?: string) => run('mic', on, deviceId),
    setCam: (on: boolean, deviceId?: string) => run('cam', on, deviceId),
    setScreen: (on: boolean) => run('screen', on),
    send: (m: RoomMsg) => room.current?.send(m),
    leave: () => {
      room.current?.disconnect();
      room.current = null;
    },
  };
}
