/**
 * Signalling bus: a tiny publish/subscribe channel between everyone in one room (and one global "who is live" channel).
 *
 *  • BroadcastChannel  → tabs/windows of the same browser (instant, works offline, great for testing a class on one laptop).
 *  • Supabase Realtime → different devices (the same shared project the app already uses). Broadcast only: nothing is stored.
 *
 * Both are used at once; duplicates are dropped by message id. Media never travels here — only small JSON
 * (presence, chat, WebRTC offers/answers).
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { sb } from '@/api/cloud';

export interface Envelope {
  id: string;
  from: string;
  to?: string;
  k: string;
  p: unknown;
  t: number;
}

export interface Bus {
  send(kind: string, payload: unknown, to?: string): void;
  on(cb: (e: Envelope) => void): () => void;
  close(): void;
}

const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const MAX_QUEUE = 200;

export function openBus(name: string, self: string): Bus {
  const subs = new Set<(e: Envelope) => void>();
  const seen: string[] = [];
  const seenSet = new Set<string>();
  const remember = (id: string) => {
    seen.push(id);
    seenSet.add(id);
    if (seen.length > 600) seenSet.delete(seen.shift()!);
  };
  const deliver = (e: Envelope) => {
    if (!e || typeof e.id !== 'string' || typeof e.k !== 'string' || typeof e.from !== 'string') return;
    if (e.from === self || (e.to && e.to !== self) || seenSet.has(e.id)) return;
    remember(e.id);
    subs.forEach((cb) => {
      try {
        cb(e);
      } catch (err) {
        console.warn('[live] handler failed', err);
      }
    });
  };

  let bc: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      bc = new BroadcastChannel(`bodhin-live:${name}`);
      bc.onmessage = (m) => deliver(m.data as Envelope);
    } catch {
      bc = null;
    }
  }

  let ch: RealtimeChannel | null = null;
  let subscribed = false;
  const queue: Envelope[] = [];
  const client = sb();
  if (client) {
    try {
      ch = client.channel(`live:${name}`, { config: { broadcast: { self: false, ack: false } } });
      (ch as unknown as { on: (t: string, f: { event: string }, cb: (m: { payload?: Envelope }) => void) => void }).on('broadcast', { event: 'm' }, (msg) => deliver(msg.payload as Envelope));
      ch.subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          subscribed = true;
          while (queue.length) void ch!.send({ type: 'broadcast', event: 'm', payload: queue.shift() });
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          subscribed = false;
        }
      });
    } catch {
      ch = null;
    }
  }

  return {
    send(kind, payload, to) {
      const e: Envelope = { id: rid(), from: self, to, k: kind, p: payload, t: Date.now() };
      remember(e.id);
      try {
        bc?.postMessage(e);
      } catch {
        /* closed */
      }
      if (ch) {
        if (subscribed) void ch.send({ type: 'broadcast', event: 'm', payload: e }).catch(() => {});
        else if (queue.length < MAX_QUEUE) queue.push(e);
      }
    },
    on(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    close() {
      subs.clear();
      try {
        bc?.close();
      } catch {
        /* closed */
      }
      if (ch && client) void client.removeChannel(ch).catch(() => {});
    },
  };
}
