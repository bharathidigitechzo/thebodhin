/**
 * Live-class scale rules (pure; the server applies the same ones in live_join_check / live-token).
 *
 * Why: a LiveKit room lives on ONE media node. LiveKit's own benchmark (16-core node) carried ~3,000 subscribers of
 * one video stream. So one class can hold a limited number of interactive (WebRTC) seats; everyone beyond that
 * watches a broadcast copy (LiveKit Egress → HLS → CDN), which scales to any audience with a 5–10 s delay.
 * Many classes at once scale by adding nodes (rooms spread across nodes; Redis coordinates them).
 */

export const LIVE_SCALE = {
  /** Interactive seats per class before overflow goes to broadcast. Super Admin can change it (Platform rules). */
  interactiveSeats: 1000,
  minSeats: 50,
  maxSeats: 2500, // keep a safety margin under one node's measured ceiling
  broadcastDelay: '5–10 seconds',
  /** Broadcast viewers ask questions over HTTP (not the room), at most one per 30 s. */
  broadcastQaEveryMs: 30_000,
  /** Join retries when many learners join at the same second (class start). */
  retry: { tries: 5, baseMs: 800, maxMs: 8000 },
} as const;

export type SeatMode = 'interactive' | 'broadcast';

/** Hosts and learners allowed to speak always get an interactive seat; others get one while seats remain. */
export function seatMode(interactiveNow: number, opts: { host?: boolean; speaker?: boolean; seats?: number } = {}): SeatMode {
  if (opts.host || opts.speaker) return 'interactive';
  const seats = clampSeats(opts.seats ?? LIVE_SCALE.interactiveSeats);
  return interactiveNow < seats ? 'interactive' : 'broadcast';
}

export const clampSeats = (n: number) => Math.min(LIVE_SCALE.maxSeats, Math.max(LIVE_SCALE.minSeats, Math.round(n)));

/** Exponential backoff with "equal jitter": spreads a burst of retries instead of everyone retrying together. */
export function backoffMs(attempt: number, rand = Math.random(), base: number = LIVE_SCALE.retry.baseMs, max: number = LIVE_SCALE.retry.maxMs) {
  const cap = Math.min(max, base * 2 ** attempt);
  return Math.round(cap / 2 + (cap / 2) * rand);
}

/** Only temporary problems are worth retrying. "Not enrolled", "ended", "too early" are answers, not failures. */
export const retryable = (code?: string) => code === 'busy' || code === 'network' || code === 'timeout' || code === undefined;

/** Run `fn`, retrying temporary failures with backoff. `onRetry` lets the screen say "Busy, retrying (2/5)…". */
export async function withRetry<T>(fn: () => Promise<T>, opts: { tries?: number; sleep?: (ms: number) => Promise<void>; onRetry?: (attempt: number, waitMs: number) => void; rand?: () => number } = {}): Promise<T> {
  const tries = opts.tries ?? LIVE_SCALE.retry.tries;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let a = 0; ; a++) {
    try {
      return await fn();
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (a >= tries - 1 || !retryable(code)) throw e;
      const ms = backoffMs(a, opts.rand ? opts.rand() : Math.random());
      opts.onRetry?.(a + 1, ms);
      await sleep(ms);
    }
  }
}
