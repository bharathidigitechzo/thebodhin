/**
 * Live-class protocol — provider-independent and pure (unit-tested in Node).
 * Everything the room needs besides audio/video travels as small JSON messages over the
 * media server's data channel: chat, Q&A, raised hands, reactions, polls, slides, whiteboard strokes.
 * The UI is 100% Bodhin's own, so no third-party logo, watermark or "powered by" text ever renders.
 */
import { validItem, type BoardItem } from '@/core/ink';
export type RoomRole = 'host' | 'student';

export type RoomMsg =
  | { t: 'chat'; id: string; by: string; text: string; at: number }
  | { t: 'qa'; id: string; by: string; text: string; at: number }
  | { t: 'qa_answer'; id: string; text: string }
  | { t: 'hand'; by: string; up: boolean }
  | { t: 'react'; by: string; emoji: string }
  | { t: 'poll'; id: string; q: string; options: string[] }
  | { t: 'vote'; pollId: string; option: number; by: string }
  | { t: 'poll_close'; id: string }
  | { t: 'slide'; index: number }
  | { t: 'stroke'; color: string; w: number; pts: [number, number][] }
  | { t: 'board_clear' }
  | { t: 'board_put'; item: BoardItem; replaces?: string[] }
  | { t: 'board_del'; ids: string[] }
  | { t: 'stage'; mode: 'slides' | 'screen' | 'board' }
  | { t: 'allow_speak'; who: string; on: boolean }
  | { t: 'end' };

export const REACTIONS = ['👍', '👏', '🔥', '❤️'] as const;
const MAX_TEXT = 500;
const MAX_POLL_OPTIONS = 6;
const MAX_STROKE_PTS = 400;

export const encodeMsg = (m: RoomMsg): Uint8Array => new TextEncoder().encode(JSON.stringify(m));

/** Parse + validate an incoming message. Returns null for anything malformed — never trust peers. */
export function decodeMsg(raw: Uint8Array | string): RoomMsg | null {
  let o: any;
  try {
    o = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object' || typeof o.t !== 'string') return null;
  const str = (v: unknown, max = MAX_TEXT) => typeof v === 'string' && v.length > 0 && v.length <= max;
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  switch (o.t) {
    case 'chat':
    case 'qa':
      return str(o.id, 64) && str(o.by, 80) && str(o.text) && num(o.at) ? { t: o.t, id: o.id, by: o.by, text: o.text, at: o.at } : null;
    case 'qa_answer':
      return str(o.id, 64) && str(o.text) ? { t: 'qa_answer', id: o.id, text: o.text } : null;
    case 'hand':
      return str(o.by, 80) && typeof o.up === 'boolean' ? { t: 'hand', by: o.by, up: o.up } : null;
    case 'react':
      return str(o.by, 80) && (REACTIONS as readonly string[]).includes(o.emoji) ? { t: 'react', by: o.by, emoji: o.emoji } : null;
    case 'poll':
      return str(o.id, 64) && str(o.q, 200) && Array.isArray(o.options) && o.options.length >= 2 && o.options.length <= MAX_POLL_OPTIONS && o.options.every((x: unknown) => str(x, 100))
        ? { t: 'poll', id: o.id, q: o.q, options: o.options }
        : null;
    case 'vote':
      return str(o.pollId, 64) && Number.isInteger(o.option) && o.option >= 0 && o.option < MAX_POLL_OPTIONS && str(o.by, 80) ? { t: 'vote', pollId: o.pollId, option: o.option, by: o.by } : null;
    case 'poll_close':
      return str(o.id, 64) ? { t: 'poll_close', id: o.id } : null;
    case 'slide':
      return Number.isInteger(o.index) && o.index >= 0 && o.index < 5000 ? { t: 'slide', index: o.index } : null;
    case 'stroke':
      return str(o.color, 16) && num(o.w) && o.w > 0 && o.w <= 40 && Array.isArray(o.pts) && o.pts.length > 0 && o.pts.length <= MAX_STROKE_PTS && o.pts.every((p: unknown) => Array.isArray(p) && p.length === 2 && num(p[0]) && num(p[1]))
        ? { t: 'stroke', color: o.color, w: o.w, pts: o.pts }
        : null;
    case 'board_clear':
      return { t: 'board_clear' };
    case 'board_put':
      return validItem(o.item) && (o.replaces === undefined || (Array.isArray(o.replaces) && o.replaces.length <= 50 && o.replaces.every((x: unknown) => str(x, 40))))
        ? { t: 'board_put', item: o.item, ...(o.replaces ? { replaces: o.replaces } : {}) }
        : null;
    case 'board_del':
      return Array.isArray(o.ids) && o.ids.length > 0 && o.ids.length <= 200 && o.ids.every((x: unknown) => str(x, 40)) ? { t: 'board_del', ids: o.ids } : null;
    case 'stage':
      return ['slides', 'screen', 'board'].includes(o.mode) ? { t: 'stage', mode: o.mode } : null;
    case 'allow_speak':
      return str(o.who, 80) && typeof o.on === 'boolean' ? { t: 'allow_speak', who: o.who, on: o.on } : null;
    case 'end':
      return { t: 'end' };
    default:
      return null;
  }
}

/** Messages only the host may send; the receiver drops them from anyone else (students can't hijack the board). */
const HOST_ONLY = new Set<RoomMsg['t']>(['qa_answer', 'poll', 'poll_close', 'slide', 'stroke', 'board_clear', 'board_put', 'board_del', 'stage', 'allow_speak', 'end']);
export const isAllowedFrom = (m: RoomMsg, senderRole: RoomRole) => senderRole === 'host' || !HOST_ONLY.has(m.t);

/** Chat rate limit: max `limit` messages per `windowMs` per sender. Returns true if allowed. */
export function makeRateLimiter(limit = 5, windowMs = 5000) {
  const seen = new Map<string, number[]>();
  return (who: string, now = Date.now()) => {
    const arr = (seen.get(who) ?? []).filter((t) => now - t < windowMs);
    if (arr.length >= limit) {
      seen.set(who, arr);
      return false;
    }
    arr.push(now);
    seen.set(who, arr);
    return true;
  };
}

/* ── token grants (mirrored by the Edge Function; tested here) ── */

export interface Grant {
  room: string;
  identity: string;
  name: string;
  roomJoin: true;
  canSubscribe: boolean;
  canPublish: boolean;
  canPublishData: boolean;
  canPublishSources: ('microphone' | 'camera' | 'screen_share' | 'screen_share_audio')[];
  hidden: boolean;
  recorder: boolean;
}

/** Hosts publish everything. Students join listen-only; mic/camera only after the host allows it. Recorder = hidden egress bot. */
export function grantFor(role: RoomRole | 'recorder', room: string, identity: string, name: string, speakAllowed = false): Grant {
  const base = { room, identity, name, roomJoin: true as const };
  if (role === 'host') return { ...base, canSubscribe: true, canPublish: true, canPublishData: true, canPublishSources: ['microphone', 'camera', 'screen_share', 'screen_share_audio'], hidden: false, recorder: false };
  if (role === 'recorder') return { ...base, canSubscribe: true, canPublish: false, canPublishData: false, canPublishSources: [], hidden: true, recorder: true };
  return {
    ...base,
    canSubscribe: true,
    canPublish: speakAllowed,
    canPublishData: true, // chat / hand / vote ride the data channel
    canPublishSources: speakAllowed ? ['microphone', 'camera'] : [],
    hidden: false,
    recorder: false,
  };
}

/** Room name is tenant-scoped so two academies can never collide or peek at each other's rooms. */
export const roomName = (tenantId: string, sessionId: string) => `${tenantId}:${sessionId}`;

/** Join window: 10 minutes before start until the class ends (same rule as liveTab.join). */
export function joinWindow(startsAtMs: number, endsAtMs: number, nowMs = Date.now()) {
  if (nowMs < startsAtMs - 10 * 60_000) return 'too_early' as const;
  if (nowMs > endsAtMs + 30 * 60_000) return 'ended' as const; // 30-min grace for overrun
  return 'ok' as const;
}
