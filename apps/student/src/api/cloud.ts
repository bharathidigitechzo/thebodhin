/**
 * Cloud store: one shared Postgres (Supabase) for the APK, the web portal, local dev and Vercel.
 *
 * The app's data layer (client.ts) works on the in-memory `db`. This module keeps that `db` in sync with
 * the `public.app_store` table: one row per record (per array element, per map entry, or per whole object),
 * so two devices changing different records never overwrite each other. Sign-in uses Supabase Auth;
 * passwords never go into the store.
 *
 * The URL and publishable key are public by design (row-level security protects the data), so they ship
 * as defaults and every build — EAS APK, Vercel, `expo start` — talks to the same database without extra
 * setup. Override with EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY, or set
 * EXPO_PUBLIC_CLOUD=off to run on local demo data only.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { db, loadHooks, persistHooks } from './mockDb';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://xxfukitplxbjbspzcfom.supabase.co';
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_51qHExHC2em522VcSEfjHA_ajJQmzgV';
export const cloudEnabled = process.env.EXPO_PUBLIC_CLOUD !== 'off';

const web = typeof document !== 'undefined' && typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

/** Created on first use, after the root layout has loaded the URL polyfill (native). */
let client: SupabaseClient | null = null;
export function sb(): SupabaseClient | null {
  if (!cloudEnabled) return null;
  return (client ??= createClient(URL, KEY, { auth: { persistSession: web, autoRefreshToken: true, detectSessionInUrl: false } }));
}

/** Map-like fields: one row per entry. Every other non-array field is stored as a single row. */
const MAP_FIELDS = new Set(['recentSearches', 'positions', 'calendarSync', 'playgroundUsage', 'settings', 'usage', 'tenantStats', 'adminVerified', 'payoutHolds', 'userLocks', 'sessionSummaries', 'sessionStatus']);
const SINGLE = '_';

type Row = { field: string; key: string; ord: number; data: unknown };
const rid = (field: string, key: string) => `${field}\u0000${key}`;

/** JSON with sorted keys, so the same record always gives the same text (Postgres jsonb reorders keys). */
function canon(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : canon(x))).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canon(o[k])}`).join(',')}}`;
}
function hash(s: string) {
  let a = 5381, b = 52711;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = (a * 33) ^ c; b = (b * 31) ^ c; }
  return (a >>> 0).toString(36) + (b >>> 0).toString(36) + s.length.toString(36);
}
const strip = (field: string, e: unknown) => {
  if (field !== 'users' || !e || typeof e !== 'object') return e;
  const { password: _pw, ...rest } = e as Record<string, unknown>;
  return rest;
};
const elementKey = (e: unknown, text: string) =>
  e && typeof e === 'object' && typeof (e as { id?: unknown }).id === 'string' ? `id:${(e as { id: string }).id}` : `h:${hash(text)}`;

/** What was last written to / read from the cloud: row id → { text, ord }. */
let synced = new Map<string, { text: string; ord: number }>();
let live = false; // true once this device has a signed-in cloud session and has loaded the store

function currentRows(): Map<string, Row & { text: string }> {
  const out = new Map<string, Row & { text: string }>();
  const d = db as unknown as Record<string, unknown>;
  for (const field of Object.keys(d)) {
    const v = d[field];
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      const items = v.map((e) => { const data = strip(field, e); const text = canon(data); return { key: elementKey(data, text), data, text }; });
      // Keep the order: known rows keep their position, new ones slot between their neighbours.
      const ords: (number | null)[] = items.map((it) => synced.get(rid(field, it.key))?.ord ?? null);
      for (let i = 0; i < ords.length; i++) {
        if (ords[i] != null) continue;
        let p = i - 1; while (p >= 0 && ords[p] == null) p--;
        let n = i + 1; while (n < ords.length && ords[n] == null) n++;
        const prev = p >= 0 ? ords[p]! : null, next = n < ords.length ? ords[n]! : null;
        ords[i] = prev == null && next == null ? i : prev == null ? next! - 1 : next == null || next <= prev ? prev + 1 : (prev + next) / 2;
      }
      items.forEach((it, i) => out.set(rid(field, it.key), { field, key: it.key, ord: ords[i]!, data: it.data, text: it.text }));
    } else if (MAP_FIELDS.has(field) && v && typeof v === 'object') {
      for (const [k, e] of Object.entries(v as Record<string, unknown>)) {
        if (e === undefined) continue;
        out.set(rid(field, `k:${k}`), { field, key: `k:${k}`, ord: 0, data: e, text: canon(e) });
      }
    } else {
      out.set(rid(field, SINGLE), { field, key: SINGLE, ord: 0, data: v, text: canon(v) });
    }
  }
  return out;
}

const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

let chain: Promise<void> = Promise.resolve();
let timer: ReturnType<typeof setTimeout> | null = null;
export let lastSyncError: string | null = null;

/** Writes every changed record to Postgres. Runs one at a time. */
export function flush(): Promise<void> {
  if (timer) { clearTimeout(timer); timer = null; }
  chain = chain.then(async () => {
    const supabase = sb();
    if (!live || !supabase) return;
    const now = currentRows();
    const up: (Row & { text: string })[] = [];
    for (const [id, r] of now) { const s = synced.get(id); if (!s || s.text !== r.text) up.push(r); }
    const gone: { field: string; key: string; id: string }[] = [];
    for (const id of synced.keys()) if (!now.has(id)) { const [field, key] = id.split('\u0000'); gone.push({ field, key, id }); }
    try {
      for (const part of chunk(up, 400)) {
        const { error } = await supabase.from('app_store').upsert(part.map(({ field, key, ord, data }) => ({ field, key, ord, data })));
        if (error) throw error;
        for (const r of part) synced.set(rid(r.field, r.key), { text: r.text, ord: r.ord });
      }
      const byField = new Map<string, string[]>();
      for (const g of gone) byField.set(g.field, [...(byField.get(g.field) ?? []), g.key]);
      for (const [field, keys] of byField) for (const part of chunk(keys, 200)) {
        const { error } = await supabase.from('app_store').delete().eq('field', field).in('key', part);
        if (error) throw error;
        for (const k of part) synced.delete(rid(field, k));
      }
      lastSyncError = null;
    } catch (e) {
      lastSyncError = (e as Error).message ?? String(e);
      console.warn('[cloud] sync failed, will retry on the next change:', lastSyncError);
    }
  });
  return chain;
}

function schedule() {
  if (!live) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flush(), 400);
}
persistHooks.push(schedule);

/** Called after every load from the cloud (e.g. to refresh the signed-in user's roles). */
export const pulledListeners = new Set<() => void>();

/** Loads the whole shared store into `db` (the cloud is the source of truth). An empty store is filled from this device. */
export async function pull(): Promise<void> {
  const supabase = sb();
  if (!supabase) return;
  if (live) await flush();
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('app_store').select('field,key,ord,data').order('field').order('ord').order('key').range(from, from + 999);
    if (error) throw error;
    rows.push(...(data as Row[]));
    if (!data || data.length < 1000) break;
  }
  synced = new Map();
  live = true;
  if (!rows.length) { await flush(); return; } // first device ever: publish its data
  const d = db as unknown as Record<string, unknown>;
  const fields = new Map<string, Row[]>();
  for (const r of rows) fields.set(r.field, [...(fields.get(r.field) ?? []), r]);
  for (const [field, list] of fields) {
    const local = d[field];
    if (list.length === 1 && list[0].key === SINGLE && !Array.isArray(local) && !MAP_FIELDS.has(field)) d[field] = list[0].data;
    else if (MAP_FIELDS.has(field)) d[field] = Object.fromEntries(list.map((r) => [r.key.slice(2), r.data]));
    else d[field] = list.map((r) => r.data);
    for (const r of list) synced.set(rid(r.field, r.key), { text: canon(r.data), ord: r.ord });
  }
  // A field only this (newer) build has: an empty array/map in the cloud has no rows, so empty it here too.
  for (const field of Object.keys(d)) {
    if (fields.has(field)) continue;
    if (field === 'users' || field === 'memberships' || field === 'tenants' || field === 'courses') continue;
    if (Array.isArray(d[field])) d[field] = [];
    else if (MAP_FIELDS.has(field)) d[field] = {};
  }
  for (const h of loadHooks) h();
  for (const h of pulledListeners) h();
  schedule(); // pushes any single-object fields the cloud doesn't have yet
}

/** Re-load (at most every 15 s) — call when the app comes back to the foreground, so changes from other devices show up. */
let lastPull = 0;
export function refreshIfStale() {
  if (live && Date.now() - lastPull > 15_000) { lastPull = Date.now(); pull().catch(() => {}); }
}
const watchForeground = () => { lastPull = Date.now(); };

export const cloud = {
  enabled: cloudEnabled,
  get live() { return live; },
  /** On app start: restores a saved cloud session and loads the shared data. Returns whether a cloud session exists. */
  async restore(): Promise<boolean> {
    const supabase = sb();
    if (!supabase) return false;
    const { data } = await supabase.auth.getSession();
    if (!data.session) return false;
    try { await pull(); watchForeground(); } catch (e) { console.warn('[cloud] load failed', e); return false; }
    return true;
  },
  async signIn(email: string, password: string) {
    const { data, error } = await sb()!.auth.signInWithPassword({ email, password });
    if (error) return { error: error.code ?? error.message };
    await pull();
    watchForeground();
    return { user: data.user };
  },
  async signUp(email: string, password: string, meta: Record<string, string>) {
    const { data, error } = await sb()!.auth.signUp({ email, password, options: { data: meta } });
    if (error) return { error: error.code ?? error.message, message: error.message };
    if (!data.session) return { needsConfirm: true as const, user: data.user };
    await pull();
    watchForeground();
    return { user: data.user };
  },
  async authUser() {
    const { data } = await sb()!.auth.getUser();
    return data.user;
  },
  async linkAppUser(appUserId: string) {
    await sb()!.auth.updateUser({ data: { app_user_id: appUserId } });
  },
  async emailForPhone(phone: string) {
    const { data } = await sb()!.rpc('login_email', { p_phone: phone });
    return (data as string | null) ?? null;
  },
  async verifyPassword(email: string, password: string) {
    const { error } = await sb()!.auth.signInWithPassword({ email, password });
    return !error;
  },
  async setPassword(password: string) {
    const { error } = await sb()!.auth.updateUser({ password });
    if (error) throw error;
  },
  async sendPasswordReset(email: string) {
    await sb()!.auth.resetPasswordForEmail(email);
  },
  async signOut() {
    await flush();
    live = false;
    synced = new Map();
    await sb()?.auth.signOut();
  },
};
