/**
 * Handwriting → text. Three engines, tried in order; the board always shows which one is active.
 *  1. On-device (phones/tablets): Google ML Kit Digital Ink via modules/bodhin-ink — free, offline after a
 *     one-time ~20 MB language download, 300+ languages incl. Tamil, Hindi, Telugu, Kannada, Malayalam, maths.
 *  2. Browser: Chrome's built-in Handwriting Recognition API where the device ships it (ChromeOS, some Android).
 *  3. Server: POST to EXPO_PUBLIC_INK_URL (developer plugs in a cloud handwriting API) — optional.
 * If none is available the board keeps the neat (smoothed) handwriting and offers typing instead.
 */
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import type { TPt } from '@/core/ink';

export type Engine = 'device' | 'browser' | 'server' | 'none';
export interface Recogniser {
  engine: Engine;
  label: string;
  /** Prepare a language (may download a model on first use). Resolves false if the language isn't supported. */
  prepare(lang: string): Promise<boolean>;
  /** Strokes in normalised 0..1 board space with ms timing; returns best-first candidates. */
  recognise(strokes: TPt[][], lang: string, area: { w: number; h: number }): Promise<string[]>;
}

type NativeInk = { isAvailable(): Promise<boolean>; prepare(lang: string): Promise<boolean>; recognise(lang: string, strokes: number[][][], w: number, h: number): Promise<string[]> };
/** Present only in builds that include modules/bodhin-ink (EAS development / store builds). */
const native = Platform.OS === 'web' ? null : (requireOptionalNativeModule('BodhinInk') as NativeInk | null);

const toPx = (strokes: TPt[][], area: { w: number; h: number }) => strokes.map((s) => s.map(([x, y, t]) => [Math.round(x * area.w), Math.round(y * area.h), Math.round(t)]));

const deviceEngine: Recogniser = {
  engine: 'device',
  label: 'On-device (offline)',
  prepare: (lang) => native!.prepare(lang),
  recognise: (strokes, lang, area) => native!.recognise(lang, toPx(strokes, area), area.w, area.h),
};

/* Chrome Handwriting Recognition API (https://wicg.github.io/handwriting-recognition/) */
type HWNav = { createHandwritingRecognizer?: (c: { languages: string[] }) => Promise<HWRecognizer>; queryHandwritingRecognizer?: (c: { languages: string[] }) => Promise<unknown> };
type HWRecognizer = { startDrawing(h?: object): HWDrawing; finish?(): void };
type HWDrawing = { addStroke(s: unknown): void; getPrediction(): Promise<{ text: string }[]>; clear?(): void };
const browserCache = new Map<string, HWRecognizer>();
const browserEngine: Recogniser = {
  engine: 'browser',
  label: 'Browser handwriting',
  async prepare(lang) {
    const nav = navigator as unknown as HWNav;
    try {
      if (!(await nav.queryHandwritingRecognizer?.({ languages: [lang] }))) return false;
      if (!browserCache.has(lang)) browserCache.set(lang, await nav.createHandwritingRecognizer!({ languages: [lang] }));
      return true;
    } catch { return false; }
  },
  async recognise(strokes, lang, area) {
    const r = browserCache.get(lang);
    if (!r) return [];
    const W = globalThis as unknown as { HandwritingStroke: new () => { addPoint(p: { x: number; y: number; t: number }): void } };
    const drawing = r.startDrawing({ recognitionType: 'text', alternatives: 5 });
    let start = 0;
    for (const s of strokes) {
      const hs = new W.HandwritingStroke();
      for (const [x, y, t] of s) hs.addPoint({ x: x * area.w, y: y * area.h, t: start + t });
      start += (s[s.length - 1]?.[2] ?? 0) + 50;
      drawing.addStroke(hs);
    }
    const out = await drawing.getPrediction();
    drawing.clear?.();
    return out.map((p) => p.text).filter(Boolean);
  },
};

const SERVER = process.env.EXPO_PUBLIC_INK_URL;
const serverEngine: Recogniser = {
  engine: 'server',
  label: 'Bodhin handwriting service',
  prepare: async () => true,
  async recognise(strokes, lang, area) {
    const res = await fetch(SERVER!, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lang, width: area.w, height: area.h, strokes: toPx(strokes, area) }) });
    if (!res.ok) throw new Error(`ink ${res.status}`);
    const j = (await res.json()) as { candidates?: string[] };
    return (j.candidates ?? []).slice(0, 5);
  },
};

/** Web handwriting engine via Google Input Tools API (CORS enabled, 300+ languages). */
const webInputToolsEngine: Recogniser = {
  engine: 'browser',
  label: 'Smart ink',
  async prepare() {
    return true;
  },
  async recognise(strokes, lang, area) {
    if (!strokes.length) return [];
    try {
      const width = Math.max(300, Math.round(area.w || 800));
      const height = Math.max(200, Math.round(area.h || 500));
      const targetLang = lang === 'zxx-x-math' ? 'en' : (lang || 'en');

      // Google Input Tools expects [ [x_coords], [y_coords], [time_ms] ] for each stroke
      const inkPayload = strokes.map((s) => [
        s.map(([x]) => Math.round(x * width)),
        s.map(([, y]) => Math.round(y * height)),
        s.map(([, , t]) => Math.round(t)),
      ]);

      const body = {
        app_version: 0.4,
        api_level: '537.36',
        device: '537.36',
        input_type: '0',
        options: 'enable_pre_space',
        requests: [
          {
            writing_guide: {
              writing_area_width: width,
              writing_area_height: height,
            },
            ink: inkPayload,
            language: targetLang,
          },
        ],
      };

      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeout = controller ? setTimeout(() => controller.abort(), 4000) : null;

      const res = await fetch('https://www.google.com/inputtools/request?ime=handwriting&app=mobilesearch&cs=1&oe=UTF-8', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller?.signal,
      });

      if (timeout) clearTimeout(timeout);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data) && data[0] === 'SUCCESS' && data[1]?.[0]?.[1]) {
        const cands = data[1][0][1] as string[];
        return cands.slice(0, 5);
      }
      return [];
    } catch (e) {
      console.warn('Smart ink web handwriting recogniser:', e);
      return [];
    }
  },
};

const noneEngine: Recogniser = { engine: 'none', label: 'Handwriting kept as ink', prepare: async () => false, recognise: async () => [] };

/** Pick the best engine on this device (cached). */
let picked: Promise<Recogniser> | null = null;
export function getRecogniser(): Promise<Recogniser> {
  picked ??= (async () => {
    if (Platform.OS !== 'web' && native) { try { if (await native.isAvailable()) return deviceEngine; } catch { /* fall through */ } }
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && (navigator as unknown as HWNav).createHandwritingRecognizer) {
      try {
        const ok = await browserEngine.prepare('en');
        if (ok) return browserEngine;
      } catch { /* fall through */ }
    }
    if (SERVER) return serverEngine;
    if (Platform.OS === 'web' || typeof window !== 'undefined') return webInputToolsEngine;
    return noneEngine;
  })();
  return picked;
}
/** Test hook. */
export const __setRecogniser = (r: Recogniser | null) => { picked = r ? Promise.resolve(r) : null; };
