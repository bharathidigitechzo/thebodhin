/**
 * Smart board engine — pure logic, no UI (shared by the host board, the learner view, tests and the server).
 * Coordinates are normalised 0..1 on both axes so every screen size shows the same board.
 *
 *  ink stroke ──► smooth()            (always: neat, even pen lines)
 *             ──► recogniseShape()    (Neat mode: wobbly line/box/circle/triangle/arrow → perfect shape)
 *             ──► groupWords()        (strokes written close together in time & space = one word/line)
 *                 └► recogniser (on-device / browser / server) → candidates → text item in a clean font
 */

export type Pt = [number, number];
export type TPt = [number, number, number]; // x, y, ms since stroke start (recognisers need timing)

export interface InkItem { id: string; kind: 'ink'; color: string; w: number; pts: Pt[] }
export interface ShapeItem { id: string; kind: 'shape'; shape: 'line' | 'arrow' | 'rect' | 'ellipse' | 'triangle'; color: string; w: number; pts: Pt[] }
export interface TextItem { id: string; kind: 'text'; text: string; lang: string; color: string; x: number; y: number; h: number; alts?: string[]; ink?: InkItem[] }
export type BoardItem = InkItem | ShapeItem | TextItem;

export const BOARD_LIMITS = { items: 600, ptsPerStroke: 600, text: 200, alts: 5 };

/* ───────────── languages the board can write in ───────────── */
export const INK_LANGS: { tag: string; label: string; native: string; font: string }[] = [
  { tag: 'en', label: 'English', native: 'English', font: 'System' },
  { tag: 'ta', label: 'Tamil', native: 'தமிழ்', font: 'Noto Sans Tamil' },
  { tag: 'hi', label: 'Hindi', native: 'हिन्दी', font: 'Noto Sans Devanagari' },
  { tag: 'te', label: 'Telugu', native: 'తెలుగు', font: 'Noto Sans Telugu' },
  { tag: 'kn', label: 'Kannada', native: 'ಕನ್ನಡ', font: 'Noto Sans Kannada' },
  { tag: 'ml', label: 'Malayalam', native: 'മലയാളം', font: 'Noto Sans Malayalam' },
  { tag: 'mr', label: 'Marathi', native: 'मराठी', font: 'Noto Sans Devanagari' },
  { tag: 'bn', label: 'Bengali', native: 'বাংলা', font: 'Noto Sans Bengali' },
  { tag: 'gu', label: 'Gujarati', native: 'ગુજરાતી', font: 'Noto Sans Gujarati' },
  { tag: 'pa', label: 'Punjabi', native: 'ਪੰਜਾਬੀ', font: 'Noto Sans Gurmukhi' },
  { tag: 'ar', label: 'Arabic', native: 'العربية', font: 'Noto Sans Arabic' },
  { tag: 'zxx-x-math', label: 'Maths', native: '∑ x²', font: 'System' },
];
export const langOf = (tag: string) => INK_LANGS.find((l) => l.tag === tag) ?? INK_LANGS[0];

/** Guess the script of typed/recognised text so mixed boards (Tamil + English) still render in the right font. */
export function scriptOf(text: string) {
  const ranges: [RegExp, string][] = [[/[஀-௿]/, 'ta'], [/[ऀ-ॿ]/, 'hi'], [/[ఀ-౿]/, 'te'], [/[ಀ-೿]/, 'kn'], [/[ഀ-ൿ]/, 'ml'], [/[ঀ-৿]/, 'bn'], [/[઀-૿]/, 'gu'], [/[਀-੿]/, 'pa'], [/[؀-ۿ]/, 'ar']];
  return ranges.find(([r]) => r.test(text))?.[1] ?? 'en';
}

/* ───────────── geometry helpers ───────────── */
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const pathLength = (p: Pt[]) => p.reduce((s, q, i) => (i ? s + dist(p[i - 1], q) : 0), 0);
export function bbox(pts: Pt[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}
const unionBox = (bs: { x: number; y: number; w: number; h: number }[]) => bbox(bs.flatMap((b) => [[b.x, b.y], [b.x + b.w, b.y + b.h]] as Pt[]));

/** Evenly spaced points (n) along the stroke — removes jitter from fast/slow pen speed. */
export function resample(pts: Pt[], n = 64): Pt[] {
  if (pts.length < 2) return pts.slice();
  const L = pathLength(pts);
  if (L === 0) return [pts[0]];
  const step = L / (n - 1);
  const out: Pt[] = [pts[0]];
  let acc = 0;
  const src = pts.slice();
  for (let i = 1; i < src.length; i++) {
    const d = dist(src[i - 1], src[i]);
    if (acc + d >= step && d > 0) {
      const t = (step - acc) / d;
      const q: Pt = [src[i - 1][0] + t * (src[i][0] - src[i - 1][0]), src[i - 1][1] + t * (src[i][1] - src[i - 1][1])];
      out.push(q);
      src.splice(i, 0, q);
      acc = 0;
    } else acc += d;
  }
  while (out.length < n) out.push(pts[pts.length - 1]);
  return out.slice(0, n);
}

/** Chaikin corner-cutting: turns shaky handwriting into smooth pen strokes without changing its shape. */
export function smooth(pts: Pt[], rounds = 2): Pt[] {
  let p = pts;
  for (let r = 0; r < rounds && p.length > 2; r++) {
    const q: Pt[] = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const [a, b] = [p[i], p[i + 1]];
      q.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  return p.map(([x, y]) => [Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000]);
}

/** Ramer–Douglas–Peucker simplification: finds the real corners of a hand-drawn shape. */
export function simplify(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts.slice();
  const [a, b] = [pts[0], pts[pts.length - 1]];
  const L = dist(a, b) || 1e-9;
  let idx = 0, max = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((b[0] - a[0]) * (a[1] - pts[i][1]) - (a[0] - pts[i][0]) * (b[1] - a[1])) / L;
    if (d > max) { max = d; idx = i; }
  }
  if (max <= eps) return [a, b];
  return [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)];
}

/* ───────────── shape recognition ───────────── */
/**
 * Recognise a single hand-drawn stroke as a clean shape. Returns null when it looks like writing
 * (too small, too curly) so text strokes are never turned into boxes. `aspect` = board width / height.
 */
export function recogniseShape(raw: Pt[], aspect = 16 / 9): Pick<ShapeItem, 'shape' | 'pts'> | null {
  if (raw.length < 4) return null;
  // work in a square space so circles are round on wide boards
  const pts = resample(raw.map(([x, y]) => [x * aspect, y] as Pt), 72);
  const b = bbox(pts);
  const size = Math.max(b.w, b.h);
  if (size < 0.12) return null; // letters and letter stems (under 12% screen) are handwriting
  const L = pathLength(pts);
  const gap = dist(pts[0], pts[pts.length - 1]);
  const back = (p: Pt[]) => p.map(([x, y]) => [x / aspect, y] as Pt);

  // 1. straight line: only snap intentionally long divider/axis lines (L > 0.22)
  if (gap / L > 0.94 && L > 0.22) return { shape: 'line', pts: back([pts[0], pts[pts.length - 1]]) };

  // 2. arrow: a straight shaft, then a short hook back near the end
  const shaftEnd = Math.floor(pts.length * 0.72);
  const shaft = pts.slice(0, shaftEnd + 1);
  const shaftStraight = dist(shaft[0], shaft[shaft.length - 1]) / pathLength(shaft);
  if (shaftStraight > 0.95 && gap / L < 0.9 && gap / L > 0.4 && pathLength(shaft) > 0.18) {
    const tip = shaft[shaft.length - 1];
    const tail = pts.slice(shaftEnd);
    const tailFar = Math.max(...tail.map((p) => dist(p, tip)));
    if (tailFar < pathLength(shaft) * 0.4) return { shape: 'arrow', pts: back([shaft[0], tip]) };
  }

  const closed = gap < size * 0.22;
  if (!closed) return null;

  // 3. ellipse: distance from centre is nearly constant once normalised by the box
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const radial = pts.map(([x, y]) => Math.hypot((x - cx) / (b.w / 2 || 1e-9), (y - cy) / (b.h / 2 || 1e-9)));
  const mean = radial.reduce((s, r) => s + r, 0) / radial.length;
  const spread = Math.sqrt(radial.reduce((s, r) => s + (r - mean) ** 2, 0) / radial.length);

  // corners from the simplified outline (drop the closing duplicate)
  // A closed loop starts and ends at the same point, so split it at the point farthest from the start first.
  let far = 0;
  pts.forEach((p, i) => { if (dist(p, pts[0]) > dist(pts[far], pts[0])) far = i; });
  const loop = [...pts, pts[0]];
  const corners = [...simplify(loop.slice(0, far + 1), size * 0.08).slice(0, -1), ...simplify(loop.slice(far), size * 0.08).slice(0, -1)]
    // merge corners that sit almost on top of each other (start/end overlap of a hand-closed shape)
    .filter((p, i, arr) => !arr.slice(0, i).some((q) => dist(p, q) < size * 0.12));

  if (corners.length === 3) return { shape: 'triangle', pts: back(corners) };
  if (corners.length === 4 && spread > 0.07) return { shape: 'rect', pts: back([[b.x, b.y], [b.x + b.w, b.y + b.h]]) };
  if (spread < 0.12) return { shape: 'ellipse', pts: back([[b.x, b.y], [b.x + b.w, b.y + b.h]]) };
  if (corners.length === 4 || corners.length === 5) return { shape: 'rect', pts: back([[b.x, b.y], [b.x + b.w, b.y + b.h]]) };
  return null;
}

/** SVG path for a clean shape (in pixel space). */
export function shapePath(s: Pick<ShapeItem, 'shape' | 'pts'>, W: number, H: number) {
  const P = s.pts.map(([x, y]) => [x * W, y * H] as Pt);
  switch (s.shape) {
    case 'line': return `M${P[0][0]} ${P[0][1]} L${P[1][0]} ${P[1][1]}`;
    case 'arrow': {
      const [a, b] = P;
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), h = Math.min(22, dist(a, b) * 0.25);
      const l: Pt = [b[0] - h * Math.cos(ang - 0.45), b[1] - h * Math.sin(ang - 0.45)];
      const r: Pt = [b[0] - h * Math.cos(ang + 0.45), b[1] - h * Math.sin(ang + 0.45)];
      return `M${a[0]} ${a[1]} L${b[0]} ${b[1]} M${l[0]} ${l[1]} L${b[0]} ${b[1]} L${r[0]} ${r[1]}`;
    }
    case 'rect': return `M${P[0][0]} ${P[0][1]} H${P[1][0]} V${P[1][1]} H${P[0][0]} Z`;
    case 'triangle': return `M${P[0][0]} ${P[0][1]} L${P[1][0]} ${P[1][1]} L${P[2][0]} ${P[2][1]} Z`;
    case 'ellipse': {
      const rx = (P[1][0] - P[0][0]) / 2, ry = (P[1][1] - P[0][1]) / 2, cx = P[0][0] + rx, cy = P[0][1] + ry;
      return `M${cx - rx} ${cy} a${rx} ${ry} 0 1 0 ${rx * 2} 0 a${rx} ${ry} 0 1 0 ${-rx * 2} 0`;
    }
  }
}

/* ───────────── grouping strokes into a word / line of writing ───────────── */
export interface TimedStroke { id: string; pts: Pt[]; t0: number; t1: number }
/**
 * Should `next` join the current writing group? Yes when it starts soon after the last stroke ended
 * and sits on the same line, close to what is already written.
 */
export function joinsGroup(group: TimedStroke[], next: TimedStroke, pauseMs = 1500) {
  if (!group.length) return true;
  const last = group[group.length - 1];
  if (next.t0 - last.t1 > pauseMs) return false;
  const g = unionBox(group.map((s) => bbox(s.pts)));
  const n = bbox(next.pts);
  const lineH = Math.max(g.h, n.h, 0.02);
  const verticalOverlap = Math.min(g.y + g.h, n.y + n.h) - Math.max(g.y, n.y);
  const horizontalGap = n.x - (g.x + g.w);

  // 1. Accents, dots on i/j, cross on t, or Tamil pulli:
  // Stroke is near or directly above/below/inside the current word boundary
  const isAccentOrCross = (
    n.x + n.w >= g.x - lineH * 0.8 &&
    n.x <= g.x + g.w + lineH * 1.0 &&
    n.y + n.h >= g.y - lineH * 2.0 &&
    n.y <= g.y + g.h + lineH * 1.5
  );

  // 2. Normal adjacent letter within the word line
  const isAdjacentLetter = (
    verticalOverlap > -lineH * 0.8 &&
    horizontalGap < lineH * 2.5 &&
    n.x + n.w > g.x - lineH * 1.5
  );

  return isAccentOrCross || isAdjacentLetter;
}

/** Where to put the typed text so it sits exactly where it was written, at a matching size. */
export function textPlacement(strokes: Pt[][]) {
  const b = unionBox(strokes.map(bbox));
  return { x: b.x, y: b.y, h: Math.max(0.03, Math.min(0.2, b.h * 0.9)) };
}

/** Ink strokes in the shape most recognisers expect: per stroke [x[], y[], t[]] in pixels. */
export function toRecogniserInk(strokes: TPt[][], W: number, H: number) {
  return strokes.map((s) => [s.map((p) => Math.round(p[0] * W)), s.map((p) => Math.round(p[1] * H)), s.map((p) => Math.round(p[2]))]);
}

/** Keep the board within limits (oldest ink is dropped first, never text). */
export function capItems(items: BoardItem[]) {
  if (items.length <= BOARD_LIMITS.items) return items;
  const over = items.length - BOARD_LIMITS.items;
  let dropped = 0;
  return items.filter((it) => (it.kind === 'ink' && dropped < over ? (dropped++, false) : true));
}

/** Hit test for the eraser: any item whose geometry passes within r of the point. */
export function hitItem(items: BoardItem[], p: Pt, r = 0.02, aspect = 16 / 9) {
  const d = (a: Pt, b: Pt) => Math.hypot((a[0] - b[0]) * aspect, a[1] - b[1]);
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.kind === 'text') {
      const w = it.h * Math.max(1, it.text.length) * 0.55;
      if (p[0] >= it.x - r && p[0] <= it.x + w + r && p[1] >= it.y - r && p[1] <= it.y + it.h + r) return it.id;
    } else if (it.kind === 'shape' && (it.shape === 'rect' || it.shape === 'ellipse')) {
      const b = bbox(it.pts);
      const near = (v: number, a: number) => Math.abs(v - a) < r * 1.5;
      if (p[0] >= b.x - r && p[0] <= b.x + b.w + r && p[1] >= b.y - r && p[1] <= b.y + b.h + r && (near(p[0], b.x) || near(p[0], b.x + b.w) || near(p[1], b.y) || near(p[1], b.y + b.h) || it.shape === 'ellipse')) return it.id;
    } else if (resample(it.pts, Math.min(64, Math.max(2, it.pts.length * 4))).some((q) => d(q, p) < r)) return it.id;
  }
  return null;
}

/* ───────────── board operations (sent over the live-class data channel) ───────────── */
export type BoardOp = { t: 'board_put'; item: BoardItem; replaces?: string[] } | { t: 'board_del'; ids: string[] } | { t: 'board_clear' };
/** Apply one operation — used by the host locally and by every learner receiving it. Idempotent. */
export function applyOp(items: BoardItem[], op: BoardOp): BoardItem[] {
  if (op.t === 'board_clear') return [];
  if (op.t === 'board_del') return items.filter((i) => !op.ids.includes(i.id));
  const drop = new Set([...(op.replaces ?? []), op.item.id]);
  return capItems([...items.filter((i) => !drop.has(i.id)), op.item]);
}
/** Validate an item from the network (never trust peers): shape, sizes, numbers in 0..1. */
export function validItem(o: unknown): o is BoardItem {
  const it = o as Record<string, unknown>;
  if (!it || typeof it !== 'object' || typeof it.id !== 'string' || it.id.length > 40) return false;
  const n01 = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= -0.05 && v <= 1.05;
  const pts = (v: unknown, max: number) => Array.isArray(v) && v.length >= 1 && v.length <= max && v.every((p) => Array.isArray(p) && p.length === 2 && n01(p[0]) && n01(p[1]));
  const color = (v: unknown) => typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v);
  const w = (v: unknown) => typeof v === 'number' && v > 0 && v <= 40;
  if (it.kind === 'ink') return color(it.color) && w(it.w) && pts(it.pts, BOARD_LIMITS.ptsPerStroke);
  if (it.kind === 'shape') return color(it.color) && w(it.w) && ['line', 'arrow', 'rect', 'ellipse', 'triangle'].includes(it.shape as string) && pts(it.pts, 3);
  if (it.kind === 'text') return color(it.color) && typeof it.text === 'string' && it.text.length > 0 && it.text.length <= BOARD_LIMITS.text && typeof it.lang === 'string' && it.lang.length <= 16 && n01(it.x) && n01(it.y) && typeof it.h === 'number' && it.h > 0 && it.h <= 0.3;
  return false;
}
