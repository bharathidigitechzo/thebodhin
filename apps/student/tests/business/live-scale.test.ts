// @ts-nocheck — Node-only test; executed by tests/business/run.sh
/* Live scale: interactive seats vs broadcast overflow, join-burst retry with jitter, admin seat setting. */
import { db } from '@/api/mockDb';
import * as api from '@/api/client';
import { LIVE_SCALE, backoffMs, clampSeats, retryable, seatMode, withRetry } from '@/live/scale';

let pass = 0, fail = 0; const fails: string[] = [];
const ok = (c, n, x?) => { if (c) pass++; else { fail++; fails.push(n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };

(async () => {
  ok(seatMode(0) === 'interactive' && seatMode(999) === 'interactive' && seatMode(1000) === 'broadcast', 'first 1,000 interactive, then broadcast');
  ok(seatMode(5000, { host: true }) === 'interactive' && seatMode(5000, { speaker: true }) === 'interactive', 'host and allowed speakers always interactive');
  ok(clampSeats(10) === 50 && clampSeats(99999) === 2500 && seatMode(49, { seats: 1 }) === 'interactive', 'seat setting is clamped to a safe range');
  // 10,000 learners arriving: exactly the seat count is interactive
  let inter = 0, bc = 0;
  for (let i = 0; i < 10000; i++) seatMode(inter) === 'interactive' ? inter++ : bc++;
  ok(inter === 1000 && bc === 9000, '10,000 joiners → 1,000 interactive + 9,000 broadcast', [inter, bc]);

  // backoff: grows, capped, jittered (spread out)
  ok(backoffMs(0, 0) === 400 && backoffMs(0, 1) === 800 && backoffMs(3, 1) === 6400 && backoffMs(10, 1) === LIVE_SCALE.retry.maxMs, 'backoff doubles and is capped');
  const waits = Array.from({ length: 1000 }, (_, i) => backoffMs(2, i / 1000));
  ok(Math.min(...waits) >= 1600 && Math.max(...waits) <= 3200 && new Set(waits.map((w) => Math.floor(w / 100))).size >= 15, 'jitter spreads 1,000 retries across the window instead of one spike');
  ok(retryable('busy') && retryable(undefined) && !retryable('not_enrolled') && !retryable('too_early') && !retryable('ended'), 'only temporary errors are retried');

  // withRetry
  let calls = 0; const slept: number[] = []; const notes: number[] = [];
  const r = await withRetry(async () => { calls++; if (calls < 3) throw Object.assign(new Error('x'), { code: 'busy' }); return 'in'; }, { sleep: async (ms) => { slept.push(ms); }, onRetry: (n) => notes.push(n), rand: () => 0.5 });
  ok(r === 'in' && calls === 3 && slept.length === 2 && notes.join() === '1,2', 'busy twice → joins on the third try, screen told each retry');
  calls = 0;
  const e1 = await withRetry(async () => { calls++; throw Object.assign(new Error('Only enrolled learners can join this class.'), { code: 'not_enrolled' }); }, { sleep: async () => {} }).catch((e) => e);
  ok(calls === 1 && /enrolled/.test(e1.message), 'a real "no" is not retried');
  calls = 0;
  const e2 = await withRetry(async () => { calls++; throw Object.assign(new Error('down'), { code: 'busy' }); }, { sleep: async () => {} }).catch((e) => e);
  ok(calls === LIVE_SCALE.retry.tries && e2.message === 'down', 'gives up after the retry budget');

  // mock API: seat decision on join follows the platform setting
  const sess = db.classSessions.find((s) => s.batchId === 'b_dm_wk' && s.status === 'scheduled');
  sess.startsAt = new Date(Date.now() - 6e4).toISOString(); sess.endsAt = new Date(Date.now() + 36e5).toISOString(); sess.mode = 'online';
  db.platformConfig.liveInteractiveSeats = 1000;
  const j1 = await api.liveTab.join('u_arjun', sess.id);
  ok(j1.mode === 'interactive' && !j1.hlsUrl, 'normal class → interactive seat');
  db.platformConfig.liveInteractiveSeats = 50; // fill the room with 60 other learners who joined
  for (let i = 0; i < 60; i++) db.attendance.push({ userId: `u_other_${i}`, sessionId: sess.id, minutes: 5, joinedAt: new Date().toISOString() });
  const j2 = await api.liveTab.join('u_arjun', sess.id);
  ok(j2.mode === 'broadcast' && /\.m3u8$/.test(j2.hlsUrl), 'full class → broadcast view with an HLS address', j2);

  // admin setting validation
  const base = api.settingsAdmin.platform('u_admin').cfg;
  ok(base.liveInteractiveSeats === 50, 'admin sees the seat setting');
  const bad = await api.settingsAdmin.savePlatform('u_admin', { ...base, liveInteractiveSeats: 9000 }, 'try too many').catch((e) => e);
  ok(/50–2500/.test(bad?.message ?? ''), 'admin cannot set more seats than one node can carry', bad?.message);
  const good = await api.settingsAdmin.savePlatform('u_admin', { ...base, liveInteractiveSeats: 1200 }, 'bigger classes for pilot').catch((e) => e);
  ok(!(good instanceof Error) && db.platformConfig.liveInteractiveSeats === 1200, 'admin can change seats; change is recorded', good?.message);
  ok(db.configHistory.some((h) => JSON.stringify(h).includes('Interactive seats per live class')), 'seat change appears in the change history');

  console.log(`  live-scale: ${pass} passed, ${fail} failed`);
  fails.forEach((f) => console.log('   ✗ ' + f));
  if (fail) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
