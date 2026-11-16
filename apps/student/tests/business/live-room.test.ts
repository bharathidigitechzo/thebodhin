// @ts-nocheck — Node-only test (uses fs/path); executed by tests/business/run.sh
/* Live room: protocol validation, host-only enforcement, rate limit, token grants, join window, and the
   "no third-party branding on screen" guarantee (scans the UI source). */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { decodeMsg, encodeMsg, grantFor, isAllowedFrom, joinWindow, makeRateLimiter, roomName, type RoomMsg } from '@/live/protocol';
import { liveTab } from '@/api/client';

let pass = 0, fail = 0; const fails: string[] = [];
const ok = (c: unknown, n: string, x?: unknown) => { if (c) pass++; else { fail++; fails.push(n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };

/* round-trip every message type */
const samples: RoomMsg[] = [
  { t: 'chat', id: 'm1', by: 'Arjun', text: 'hello', at: 1 }, { t: 'qa', id: 'q1', by: 'Arjun', text: 'why?', at: 2 }, { t: 'qa_answer', id: 'q1', text: 'because' },
  { t: 'hand', by: 'Arjun', up: true }, { t: 'react', by: 'Arjun', emoji: '🔥' }, { t: 'poll', id: 'p1', q: 'Pick', options: ['a', 'b'] },
  { t: 'vote', pollId: 'p1', option: 1, by: 'Arjun' }, { t: 'poll_close', id: 'p1' }, { t: 'slide', index: 3 },
  { t: 'stroke', color: '#fff', w: 3, pts: [[1, 2], [3, 4]] }, { t: 'board_clear' }, { t: 'allow_speak', who: 'u1', on: true },
];
for (const m of samples) ok(JSON.stringify(decodeMsg(encodeMsg(m))) === JSON.stringify(m), `round-trip ${m.t}`);

/* hostile / malformed input is dropped */
const bad: unknown[] = ['not json', '{}', '{"t":"nope"}', { t: 'chat', id: 'x', by: 'a', text: '', at: 1 }, { t: 'chat', id: 'x', by: 'a', text: 'x'.repeat(501), at: 1 },
  { t: 'react', by: 'a', emoji: '💣' }, { t: 'poll', id: 'p', q: 'q', options: ['only one'] }, { t: 'poll', id: 'p', q: 'q', options: Array(7).fill('x') },
  { t: 'vote', pollId: 'p', option: -1, by: 'a' }, { t: 'vote', pollId: 'p', option: 1.5, by: 'a' }, { t: 'slide', index: 99999 },
  { t: 'stroke', color: '#fff', w: 999, pts: [[1, 2]] }, { t: 'stroke', color: '#fff', w: 2, pts: Array(401).fill([1, 1]) }, { t: 'stroke', color: '#fff', w: 2, pts: [['a', 1]] }, null, 42];
bad.forEach((b, i) => ok(decodeMsg(typeof b === 'string' ? b : JSON.stringify(b)) === null, `rejects malformed #${i}`));

/* students cannot send host-only messages */
const hostOnly: RoomMsg[] = samples.filter((m) => ['qa_answer', 'poll', 'poll_close', 'slide', 'stroke', 'board_clear', 'allow_speak'].includes(m.t));
ok(hostOnly.length === 7, 'seven host-only types');
hostOnly.forEach((m) => { ok(!isAllowedFrom(m, 'student'), `student blocked from ${m.t}`); ok(isAllowedFrom(m, 'host'), `host may send ${m.t}`); });
['chat', 'qa', 'hand', 'react', 'vote'].forEach((t) => ok(isAllowedFrom(samples.find((m) => m.t === t)!, 'student'), `student may send ${t}`));

/* rate limit: 5 per 5s per sender, independent senders, window slides */
const rl = makeRateLimiter(5, 5000);
const r1 = Array.from({ length: 7 }, (_, i) => rl('a', 1000 + i));
ok(r1.filter(Boolean).length === 5 && !r1[5] && !r1[6], 'sixth chat within 5s is blocked');
ok(rl('b', 1100), 'other sender unaffected');
ok(rl('a', 7000), 'allowed again after the window');

/* token grants */
const host = grantFor('host', 'T:S', 'h1', 'Rajesh');
const stu = grantFor('student', 'T:S', 's1', 'Arjun');
const stuOk = grantFor('student', 'T:S', 's1', 'Arjun', true);
const rec = grantFor('recorder', 'T:S', 'rec', 'Recorder');
ok(host.canPublish && host.canPublishSources.includes('screen_share'), 'host publishes mic, camera, screen');
ok(!stu.canPublish && stu.canPublishSources.length === 0 && stu.canPublishData && stu.canSubscribe, 'student joins listen-only but can chat');
ok(stuOk.canPublish && stuOk.canPublishSources.join() === 'microphone,camera' && !stuOk.canPublishSources.includes('screen_share'), 'approved student gets mic+camera, never screen share');
ok(rec.hidden && !rec.canPublish && !rec.canPublishData, 'recorder is hidden and silent');
ok(roomName('t_a', 's1') !== roomName('t_b', 's1'), 'room names are tenant-scoped');

/* join window */
const start = Date.UTC(2026, 0, 1, 10), end = start + 3600_000;
ok(joinWindow(start, end, start - 11 * 60_000) === 'too_early', 'too early (11 min)');
ok(joinWindow(start, end, start - 9 * 60_000) === 'ok', 'opens at 10 min before');
ok(joinWindow(start, end, end + 20 * 60_000) === 'ok', '30-min overrun grace');
ok(joinWindow(start, end, end + 31 * 60_000) === 'ended', 'ended after grace');

/* mock join says which provider */
ok(typeof liveTab.join === 'function', 'liveTab.join exists');

/* ── branding guarantee: no provider name in user-visible strings ── */
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(tsx)$/.test(p) ? [p] : []; });
// 'Powered by Bodhin' is the tenant white-label toggle (our own brand); "zoom in" is a sample chat line; provider ids in code are not rendered.
const banned = /(livekit|jitsi|bigbluebutton|big blue button|agora|twilio|\bzoom\b(?! in)|powered by(?! bodhin)|watermark)/i;
const offenders: string[] = [];
for (const f of walk(join(process.cwd(), 'src/app')).concat(walk(join(process.cwd(), 'src/ui')))) {
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line) || /import |require\(|\.provider|provider ===/.test(line)) return; // comments + imports are not rendered
    const strings = line.match(/(['"`])((?:\\.|(?!\1).)*)\1|>[^<{]+</g) ?? [];
    if (strings.some((s) => banned.test(s))) offenders.push(`${f.split('src/')[1]}:${i + 1}`);
  });
}
ok(offenders.length === 0, 'no third-party brand/watermark text anywhere in screens or UI', offenders);

console.log(`live-room.test: PASS ${pass}  FAIL ${fail}`);
fails.forEach((f) => console.log('  ✗ ' + f));
if (fail) process.exit(1);
