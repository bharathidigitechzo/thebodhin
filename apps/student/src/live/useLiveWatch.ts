/**
 * Learner-side watcher: which of MY classes are live right now, and a system notification the moment one starts.
 * Sources, fastest first: the realtime announcement from the teacher's app, then the shared database
 * (class status + the notification the teacher's "Go live" wrote for every learner in the class).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { liveTab } from '@/api/client';
import { refreshIfStale } from '@/api/cloud';
import { watchLive, type LiveAnnounce } from './registry';
import { useDbTick } from './useDbTick';

export function useAnnounced() {
  const [list, setList] = useState<LiveAnnounce[]>([]);
  useEffect(() => watchLive(setList), []);
  return list;
}

/** Ask once (from a button — browsers require a click). Returns the resulting permission. */
export async function enableSystemAlerts(): Promise<'granted' | 'denied' | 'default' | 'unsupported'> {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return 'default';
  }
}
export const systemAlertState = (): 'granted' | 'denied' | 'default' | 'unsupported' => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);

function systemNotify(title: string, body: string, onClick: () => void) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, { body, tag: `bodhin-live-${title}` });
    n.onclick = () => {
      try {
        window.focus();
      } catch {
        /* ignore */
      }
      onClick();
      n.close();
    };
  } catch {
    /* some browsers only allow notifications from a service worker */
  }
}

export interface LiveNowItem {
  id: string;
  title: string;
  course: string;
  tutor: string;
  startedAt: string | null;
}

/** My classes that are live now. `onNew` fires once per class when it first appears. */
export function useLiveNow(userId: string, onNew?: (c: LiveNowItem) => void) {
  const tick = useDbTick(4000);
  const announced = useAnnounced();
  const known = useRef(new Set<string>());
  const first = useRef(true);
  const [, force] = useState(0);

  // An announcement for a class this device has never heard of means the database is behind: fetch it.
  useEffect(() => {
    if (announced.some((a) => !liveTab.session(a.sessionId))) refreshIfStale();
  }, [announced]);

  const items = useMemo<LiveNowItem[]>(() => {
    if (!userId) return [];
    const d = liveTab.scheduleNow(userId, null);
    const ids = new Set(announced.map((a) => a.sessionId));
    const toItem = (r: { session: { id: string; title: string }; course: { title: string }; tutor: { name: string } }, startedAt: string | null): LiveNowItem => ({ id: r.session.id, title: r.session.title, course: r.course.title, tutor: r.tutor.name, startedAt });
    return [...d.liveNow.map((r) => toItem(r, r.startedAt)), ...d.upcoming.filter((r) => ids.has(r.session.id) && r.session.mode !== 'offline').map((r) => toItem(r, null))];
  }, [userId, tick, announced]);

  useEffect(() => {
    const cur = new Set(items.map((i) => i.id));
    items.forEach((i) => {
      if (known.current.has(i.id)) return;
      known.current.add(i.id);
      // the very first reading is "what is already live" — still worth telling the learner who just opened the app
      onNew?.(i);
      void first.current;
    });
    [...known.current].forEach((id) => !cur.has(id) && known.current.delete(id));
    first.current = false;
    force((n) => n + 1);
  }, [items.map((i) => i.id).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  return items;
}

export { systemNotify };
