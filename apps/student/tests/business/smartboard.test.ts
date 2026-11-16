// @ts-nocheck — Node-only test; executed by tests/business/run.sh
/* Smart board engine: shape snapping, smoothing, writing groups, board operations, network validation, room protocol. */
import { applyOp, capItems, hitItem, joinsGroup, langOf, recogniseShape, scriptOf, shapePath, smooth, textPlacement, validItem, BOARD_LIMITS, INK_LANGS } from '@/core/ink';
import { decodeMsg, encodeMsg, isAllowedFrom } from '@/live/protocol';

let pass = 0, fail = 0; const fails: string[] = [];
const ok = (c, n, x?) => { if (c) pass++; else { fail++; fails.push(n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };
const A = 16 / 9;
let seed = 11; const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 - 0.5; };
const j = (p, a = 0.007) => [p[0] + (rnd() * a) / A, p[1] + rnd() * a];
const seg = (a, b, n = 20) => Array.from({ length: n }, (_, i) => j([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]));
const circle = (cx, cy, r, turns = 1.04) => Array.from({ length: 60 }, (_, i) => j([cx + (r / A) * Math.cos((i / 59) * Math.PI * 2 * turns), cy + r * Math.sin((i / 59) * Math.PI * 2 * turns)]));

(async () => {
  /* shapes: try several wobbly versions of each so it isn't luck */
  for (let k = 0; k < 5; k++) {
    seed = 100 + k;
    ok(recogniseShape(circle(0.5, 0.5, 0.15 + k * 0.03), A)?.shape === 'ellipse', `wobbly circle #${k} → ellipse`);
    const x = 0.15 + k * 0.03, y = 0.2;
    ok(recogniseShape([...seg([x, y], [x + 0.3, y]), ...seg([x + 0.3, y], [x + 0.3, y + 0.4]), ...seg([x + 0.3, y + 0.4], [x, y + 0.4]), ...seg([x, y + 0.4], [x, y + 0.01])], A)?.shape === 'rect', `wobbly box #${k} → rect`);
    ok(recogniseShape([...seg([0.3, 0.7], [0.45, 0.3 + k * 0.02]), ...seg([0.45, 0.3 + k * 0.02], [0.6, 0.7]), ...seg([0.6, 0.7], [0.31, 0.69])], A)?.shape === 'triangle', `wobbly triangle #${k} → triangle`);
    ok(recogniseShape(seg([0.1, 0.4 + k * 0.05], [0.8, 0.45 + k * 0.05], 40), A)?.shape === 'line', `line #${k}`);
    ok(recogniseShape([...seg([0.1, 0.5], [0.7, 0.5 + k * 0.01], 40), ...seg([0.7, 0.5 + k * 0.01], [0.66, 0.46], 6)], A)?.shape === 'arrow', `arrow #${k}`);
  }
  // writing must never snap to shapes
  ok(recogniseShape(circle(0.3, 0.3, 0.02), A) === null, 'small "o" in a word stays handwriting');
  ok(recogniseShape(Array.from({ length: 50 }, (_, i) => j([0.4 + 0.1 * Math.sin((i / 49) * Math.PI * 2), 0.2 + (i / 49) * 0.5])), A) === null, 'big S curve stays handwriting');
  const zig = Array.from({ length: 40 }, (_, i) => [0.1 + i * 0.015, 0.4 + (i % 2 ? 0.04 : 0)]);
  ok(recogniseShape(zig, A) === null, 'zig-zag scribble stays handwriting');
  ok(shapePath({ shape: 'rect', pts: [[0.1, 0.1], [0.5, 0.5]] }, 100, 100).includes('Z') && shapePath({ shape: 'ellipse', pts: [[0.1, 0.1], [0.5, 0.5]] }, 100, 100).includes(' a') && shapePath({ shape: 'arrow', pts: [[0, 0], [1, 0]] }, 100, 100).split('M').length === 3, 'clean SVG paths for shapes');

  /* smoothing */
  const raw = seg([0.1, 0.5], [0.6, 0.55], 30);
  const sm = smooth(raw);
  const wobble = (p) => p.slice(1, -1).reduce((s, q, i) => s + Math.abs(q[1] - (p[i][1] + p[i + 2][1]) / 2), 0) / (p.length - 2);
  ok(wobble(sm) < wobble(raw), 'smoothing reduces jitter');
  ok(Math.abs(sm[0][0] - raw[0][0]) < 1e-3 && Math.abs(sm.at(-1)[0] - raw.at(-1)[0]) < 1e-3, 'smoothing keeps start and end');

  /* writing groups */
  const s1 = { id: 'a', pts: seg([0.1, 0.1], [0.12, 0.15], 5), t0: 0, t1: 300 };
  const s2 = { id: 'b', pts: seg([0.13, 0.1], [0.15, 0.15], 5), t0: 600, t1: 900 };
  ok(joinsGroup([s1], s2), 'next letter joins the word');
  ok(!joinsGroup([s1], { ...s2, t0: 3000, t1: 3200 }), 'a pause starts a new word');
  ok(!joinsGroup([s1], { id: 'c', pts: seg([0.7, 0.8], [0.72, 0.85], 5), t0: 1000, t1: 1200 }), 'writing elsewhere starts a new word');
  ok(!joinsGroup([s1], { id: 'd', pts: seg([0.11, 0.4], [0.13, 0.45], 5), t0: 1000, t1: 1200 }), 'next line starts a new group');
  const pl = textPlacement([s1.pts, s2.pts]);
  ok(Math.abs(pl.x - 0.1) < 0.01 && pl.h > 0.03 && pl.h < 0.2, 'text placed where it was written', pl);

  /* languages / scripts */
  ok(INK_LANGS.some((l) => l.tag === 'ta') && INK_LANGS.length >= 10 && langOf('ta').native === 'தமிழ்' && langOf('xx').tag === 'en', 'language list incl. Tamil');
  ok(scriptOf('வணக்கம்') === 'ta' && scriptOf('नमस्ते') === 'hi' && scriptOf('ನಮಸ್ಕಾರ') === 'kn' && scriptOf('Hello 123') === 'en', 'script detection for fonts');

  /* operations */
  const ink = { id: 'i1', kind: 'ink', color: '#111827', w: 3, pts: [[0.1, 0.1], [0.2, 0.2]] };
  let b = applyOp([], { t: 'board_put', item: ink });
  b = applyOp(b, { t: 'board_put', item: ink });
  ok(b.length === 1, 'putting the same item twice is idempotent');
  b = applyOp(b, { t: 'board_put', item: { id: 't1', kind: 'text', text: 'வணக்கம்', lang: 'ta', color: '#111827', x: 0.1, y: 0.1, h: 0.08 }, replaces: ['i1'] });
  ok(b.length === 1 && b[0].kind === 'text', 'handwriting replaced by its text');
  ok(hitItem(b, [0.12, 0.13]) === 't1' && hitItem(b, [0.9, 0.9]) === null, 'eraser hit test');
  ok(applyOp(b, { t: 'board_del', ids: ['t1'] }).length === 0 && applyOp(b, { t: 'board_clear' }).length === 0, 'delete and clear');
  const many = Array.from({ length: BOARD_LIMITS.items + 5 }, (_, i) => ({ ...ink, id: `k${i}` }));
  ok(capItems([{ id: 'txt', kind: 'text', text: 'keep', lang: 'en', color: '#000', x: 0, y: 0, h: 0.1 }, ...many]).length === BOARD_LIMITS.items && capItems([{ id: 'txt', kind: 'text', text: 'keep', lang: 'en', color: '#000', x: 0, y: 0, h: 0.1 }, ...many]).some((i) => i.id === 'txt'), 'board cap drops oldest ink, keeps text');

  /* never trust the network */
  ok(validItem(ink) && !validItem({ ...ink, pts: [[3, 3]] }) && !validItem({ ...ink, color: 'url(x)' }) && !validItem({ ...ink, w: 999 }), 'ink validation');
  ok(!validItem({ id: 't', kind: 'text', text: 'x'.repeat(500), lang: 'ta', color: '#000', x: 0, y: 0, h: 0.1 }) && !validItem({ id: 't', kind: 'text', text: 'ok', lang: 'ta', color: '#000', x: 0, y: 0, h: 5 }), 'text validation (length, size)');
  ok(!validItem({ id: 's', kind: 'shape', shape: 'star', color: '#000', w: 3, pts: [[0, 0], [1, 1]] }), 'unknown shapes rejected');

  /* live-class protocol */
  const put = decodeMsg(encodeMsg({ t: 'board_put', item: ink, replaces: ['old'] }));
  ok(put && put.t === 'board_put' && put.item.id === 'i1', 'board_put round-trips');
  ok(decodeMsg(JSON.stringify({ t: 'board_put', item: { ...ink, pts: [[9, 9]] } })) === null, 'malformed board item dropped');
  ok(decodeMsg(JSON.stringify({ t: 'stage', mode: 'board' }))?.mode === 'board' && decodeMsg(JSON.stringify({ t: 'stage', mode: 'hack' })) === null, 'stage message validated');
  ok(!isAllowedFrom(put, 'student') && isAllowedFrom(put, 'host') && !isAllowedFrom({ t: 'board_del', ids: ['x'] }, 'student') && !isAllowedFrom({ t: 'stage', mode: 'board' }, 'student'), 'students cannot write on or switch the board');

  console.log(`  smartboard: ${pass} passed, ${fail} failed`);
  fails.forEach((f) => console.log('   ✗ ' + f));
  if (fail) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
