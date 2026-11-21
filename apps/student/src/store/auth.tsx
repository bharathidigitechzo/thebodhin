/** Session store. Swap persistence to expo-secure-store when the real backend lands. */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Session } from '@/core/types';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

const read = async (k: string): Promise<string | null> => {
  try {
    const val = await AsyncStorage.getItem(k);
    if (val != null) return val;
    if (web) return window.localStorage.getItem(k);
    return null;
  } catch {
    return null;
  }
};

const write = async (k: string, v: string | null): Promise<void> => {
  try {
    if (v == null) {
      await AsyncStorage.removeItem(k);
      if (web) window.localStorage.removeItem(k);
    } else {
      await AsyncStorage.setItem(k, v);
      if (web) window.localStorage.setItem(k, v);
    }
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
      const raw = await read(KEY);
      if (raw) {
        try {
          saved = JSON.parse(raw);
        } catch {
          /* corrupted → signed out */
        }
      }
      // STU-AUTH-19: if the user explicitly unchecked "Remember me", clear the session on cold start.
      const remembered = await read(REMEMBER_KEY);
      if (saved && remembered === '0') {
        saved = null;
        await write(KEY, null);
        await write(REMEMBER_KEY, null);
        if (cloud.enabled) await cloud.signOut().catch(() => {});
      }

      // Restore cloud session and sync data in background without dropping the user's saved session
      if (cloud.enabled) {
        try {
          await cloud.restore();
        } catch (e) {
          console.warn('[auth] cloud restore skipped:', e);
        }
      }

      // If we have a saved session, refresh memberships from local/synced db if available
      if (saved) {
        try {
          const refreshed = auth.refreshSession(saved.user.id);
          if (refreshed) saved = refreshed;
        } catch {
          /* keep current saved session if refresh fails */
        }
        await write(KEY, JSON.stringify(saved));
      }

      if (!alive) return;
      setSessionState(saved);
      // If user has an active session, they are definitely onboarded!
      const onb = await read('bodhin.onboarded');
      const isOnboarded = onb === '1' || Boolean(saved);
      setOnboarded(isOnboarded);
      if (saved && onb !== '1') {
        await write('bodhin.onboarded', '1');
      }
      const mod = await read('bodhin.mode');
      setModeState((mod as Mode | null) ?? null);
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
    if (s) {
      setOnboarded(true);
      write('bodhin.onboarded', '1');
    }
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
