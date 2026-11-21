/** Session store. Swap persistence to expo-secure-store when the real backend lands. */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Session } from '@/core/types';
import { AppState } from 'react-native';
import { auth } from '@/api/client';
import { cloud, pulledListeners, refreshIfStale } from '@/api/cloud';

const KEY = 'bodhin.session.v2';
const REMEMBER_KEY = 'bodhin.remember';
const web = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
if (web) {
  try {
    window.localStorage.removeItem('bodhin.session.v1');
  } catch {
    /* ignore */
  }
}

export type Mode = 'learner' | 'educator';

/** The workspace this user manages (owner or tutor), if any. */
export function educatorMembership(session: Session | null) {
  return session?.memberships.find((m) => m.role === 'owner' || m.role === 'tutor') ?? null;
}

/** Bodhin staff role (Super Admin portal), if any. */
export function adminMembership(session: Session | null) {
  return session?.memberships.find((m) => m.role === 'super_admin' || m.role === 'finance' || m.role === 'moderator' || m.role === 'support') ?? null;
}

/** Where "my courses" lives: Bodhin staff manage Bodhin's own courses from the admin portal. */
export function coursesHome(session: Session | null) {
  return adminMembership(session) && !educatorMembership(session) ? '/admin/content' : '/educator/courses';
}

/** Where a signed-in user lands. One login: role decides the area. */
export function homePath(session: Session | null, mode: Mode | null) {
  if (!session) return '/sign-in';
  if (adminMembership(session) && mode !== 'learner') return '/admin';
  const edu = educatorMembership(session);
  if (edu) return '/educator/home'; // educators always open the Educator portal
  try {
    const app = auth.getApplication(session.user.id);
    if (app && app.status === 'draft') {
      return '/apply';
    }
    if (app && ['submitted', 'under_review', 'rejected', 'changes_requested'].includes(app.status)) {
      return '/application-status';
    }
  } catch {}
  return '/home';
}

interface AuthState {
  session: Session | null;
  ready: boolean;
  onboarded: boolean;
  mode: Mode | null;
  setMode: (m: Mode) => void;
  setSession: (s: Session | null, remember?: boolean) => void;
  markOnboarded: () => void;
  signOut: () => void;
  /** Re-read roles (e.g. just approved as an educator) without signing out. */
  refresh: () => void;
}

const Ctx = createContext<AuthState | null>(null);

const read = (k: string) => {
  try {
    return web ? window.localStorage.getItem(k) : null;
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (!web) return;
    v == null ? window.localStorage.removeItem(k) : window.localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSessionState] = useState<Session | null>(null);
  const [onboarded, setOnboarded] = useState(false);
  const [mode, setModeState] = useState<Mode | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      let saved: Session | null = null;
      const raw = read(KEY);
      if (raw) {
        try {
          saved = JSON.parse(raw);
        } catch {
          /* corrupted → signed out */
        }
      }
      // STU-AUTH-19: if the user did NOT check "Remember me", clear the session on every cold start.
      const remembered = read(REMEMBER_KEY);
      if (saved && remembered === '0') {
        saved = null;
        write(KEY, null);
        write(REMEMBER_KEY, null);
        // Also clear the Supabase Auth session so the cloud layer doesn't restore it.
        if (cloud.enabled) await cloud.signOut().catch(() => {});
      }
      // Shared database: load the latest data before showing any screen. A saved session without a cloud
      // sign-in (e.g. from an older offline build) is dropped so the user signs in once and gets their data.
      if (cloud.enabled) {
        const online = await cloud.restore().catch(() => false);
        if (!online) saved = null;
        else if (saved) {
          const u = auth.findUserById(saved.user.id);
          if (!u) {
            await cloud.signOut().catch(() => {});
            saved = null;
          } else {
            saved = auth.refreshSession(saved.user.id) ?? saved;
          }
        }
        if (!saved) write(KEY, null);
        else write(KEY, JSON.stringify(saved));
      } else if (saved) {
        const u = auth.findUserById(saved.user.id);
        if (!u) {
          saved = null;
          write(KEY, null);
        }
      }
      if (!alive) return;
      setSessionState(saved);
      setOnboarded(read('bodhin.onboarded') === '1');
      setModeState((read('bodhin.mode') as Mode | null) ?? null);
      setReady(true);
    })();
    // Coming back to the app: pick up changes made on other devices.
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') refreshIfStale(); });
    const onFocus = () => refreshIfStale();
    if (web) window.addEventListener('focus', onFocus);
    return () => {
      alive = false;
      sub.remove();
      if (web) window.removeEventListener('focus', onFocus);
    };
  }, []);

  // Shared data reloaded (sign-in, back to the app): pick up role changes made elsewhere, e.g. Bodhin approving this educator.
  useEffect(() => {
    const onPulled = () =>
      setSessionState((s) => {
        if (!s) return s;
        const m = auth.refreshMemberships(s.user.id);
        if (!m || JSON.stringify(m) === JSON.stringify(s.memberships)) return s;
        const next = { ...s, memberships: m };
        write(KEY, JSON.stringify(next));
        return next;
      });
    pulledListeners.add(onPulled);
    return () => { pulledListeners.delete(onPulled); };
  }, []);

  const setSession = useCallback((s: Session | null, remember = true) => {
    setSessionState(s);
    write(KEY, s ? JSON.stringify(s) : null);
    // Persist the "remember me" preference so we can check it on next cold start.
    write(REMEMBER_KEY, s ? (remember ? '1' : '0') : null);
  }, []);

  const markOnboarded = useCallback(() => {
    setOnboarded(true);
    write('bodhin.onboarded', '1');
  }, []);

  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    write('bodhin.mode', m);
  }, []);

  const signOut = useCallback(() => {
    cloud.signOut().catch(() => {});
    setSession(null);
    setModeState(null);
    write('bodhin.mode', null);
  }, [setSession]);

  const refresh = useCallback(() => {
    if (!session) return;
    const m = auth.refreshMemberships(session.user.id);
    if (m && JSON.stringify(m) !== JSON.stringify(session.memberships)) setSession({ ...session, memberships: m });
  }, [session, setSession]);

  return <Ctx.Provider value={{ session, ready, onboarded, mode, setMode, setSession, markOnboarded, signOut, refresh }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
