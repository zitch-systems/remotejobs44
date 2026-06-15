// src/lib/auth.tsx — auth state for the app.
//
// Wraps Supabase auth and exposes a tiny context. It also supports a "demo
// mode": when EXPO_PUBLIC_SUPABASE_* env is absent (fresh clone, no backend
// wired yet) the Auth screen can still take you into the app so the UI is
// explorable — exactly the handoff's "no real auth in the prototype" behavior.
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabase';
import { fetchAppliedMap, fetchSavedIds } from './user-state';
import { captureError } from './sentry';
import { useAppStore } from '@/store/app';

interface AuthValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** True when there is a real session OR demo mode is on. */
  authed: boolean;
  /** Backend wired? Drives whether the Auth screen does real calls. */
  configured: boolean;
  enterDemo: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    let active = true;
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Hydrate the saved/applied store from the signed-in user's rows (and clear
  // it on sign-out). Runs whenever the authenticated user id changes.
  const userId = session?.user?.id ?? null;
  useEffect(() => {
    useAppStore.getState().setUserId(userId);
    if (!isSupabaseConfigured || !userId) return;
    let active = true;
    Promise.all([fetchSavedIds(userId), fetchAppliedMap(userId)])
      .then(([saved, applied]) => {
        if (active) useAppStore.getState().hydrate({ saved, applied });
      })
      .catch((e) => captureError(e, { scope: 'hydrate-user-state' }));
    return () => {
      active = false;
    };
  }, [userId]);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      authed: Boolean(session) || demo,
      configured: isSupabaseConfigured,
      enterDemo: () => setDemo(true),
      signOut: async () => {
        if (isSupabaseConfigured) {
          try {
            await supabase.auth.signOut();
          } catch {
            /* ignore network errors on sign-out */
          }
        }
        setDemo(false);
        useAppStore.getState().reset();
      },
    }),
    [session, loading, demo],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
