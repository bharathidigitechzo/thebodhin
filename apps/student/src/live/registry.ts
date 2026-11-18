/**
 * "Who is live right now" — a light-weight announcement channel on top of live/signal.ts.
 * While a teacher is in the room their app announces the class every few seconds; learners' apps listen.
 * This is what makes "Live now" and the join alert appear within a second or two on other devices, before
 * the next full data sync. The database still holds the truth (class status, notifications, attendance).
 */
import { openBus, type Bus } from './signal';

export interface LiveAnnounce {
  sessionId: string;
  title: string;
  hostId: string;
  hostName: string;
  at: number;
}

const PERIOD = 8000;
const EXPIRE = 25000;
const self = `reg.${Math.random().toString(36).slice(2, 9)}`;

let bus: Bus | null = null;
let users = 0;
const live = new Map<string, LiveAnnounce>();
const listeners = new Set<(l: LiveAnnounce[]) => void>();

const emit = () => {
  const now = Date.now();
  for (const [k, v] of live) if (now - v.at > EXPIRE) live.delete(k);
  const list = [...live.values()];
  listeners.forEach((cb) => cb(list));
};

function acquire() {
  if (!bus) {
    bus = openBus('registry', self);
    bus.on((e) => {
      const a = e.p as LiveAnnounce;
      if (!a || typeof a.sessionId !== 'string') return;
      if (e.k === 'live') live.set(a.sessionId, { ...a, at: Date.now() });
      else if (e.k === 'ended') live.delete(a.sessionId);
      else return;
      emit();
    });
  }
  users++;
}
function release() {
  users = Math.max(0, users - 1);
  if (!users && bus) {
    bus.close();
    bus = null;
    live.clear();
  }
}

/** Teacher side: announce until the returned function is called. Pass `ended` to tell everyone the class is over. */
export function announceLive(a: Omit<LiveAnnounce, 'at'>): (ended?: boolean) => void {
  acquire();
  const send = () => bus?.send('live', { ...a, at: Date.now() });
  send();
  const t = setInterval(send, PERIOD);
  return (ended = false) => {
    clearInterval(t);
    if (ended) bus?.send('ended', { ...a, at: Date.now() });
    setTimeout(release, ended ? 600 : 0);
  };
}

/** Learner side: the classes announced as live (updates on change and as announcements expire). */
export function watchLive(cb: (l: LiveAnnounce[]) => void): () => void {
  acquire();
  listeners.add(cb);
  cb([...live.values()]);
  const t = setInterval(emit, 5000);
  return () => {
    listeners.delete(cb);
    clearInterval(t);
    release();
  };
}
