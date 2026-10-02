// src/lib/auth.tsx — auth state for the app.
//
// Wraps Supabase auth and exposes a tiny context. It also supports a "demo
// mode": when EXPO_PUBLIC_SUPABASE_* env is absent (fresh clone, no backend
// wired yet) the Auth screen can still take you into the app so the UI is
// explorable — exactly the handoff's "no real auth in the prototype" behavior.
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured, supabaseAuthStorage, supabaseAuthStorageKey } from './supabase';
import { fetchAppliedMap, fetchSavedIds } from './user-state';
import { registerMobileDevice } from './telemetry';
import { clearPushTokens } from './push';
import { captureError } from './sentry';
import { settleWithin } from './promise-timeout';
import { clearAuthSession } from './auth-signout';
import { useAppStore } from '@/store/app';
import { useRecentJobs } from '@/store/recent-jobs';

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
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) captureError(error, { scope: 'restore-session' });
        setSession(data.session);
      })
      .catch((error) => captureError(error, { scope: 'restore-session' }))
      .finally(() => {
        if (active) setLoading(false);
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
    const previousUserId = useAppStore.getState().userId;
    if (isSupabaseConfigured && previousUserId !== userId) {
      useRecentJobs.getState().clear();
    }
    useAppStore.getState().setUserId(userId);
    if (!isSupabaseConfigured || !userId) return;
    let active = true;
    // Register this device for the admin's mobile-user count (best-effort).
    registerMobileDevice(userId);
    Promise.all([fetchSavedIds(userId), fetchAppliedMap(userId)])
      .then(([saved, applied]) => {
        if (active) useAppStore.getState().hydrate({ saved, applied });
      })
      .catch((e) => {
        captureError(e, { scope: 'hydrate-user-state' });
        // Don't leave the apply gate stuck on "Checking…" if the row fetch
        // failed — mark hydrated so the UI proceeds. The server trigger is the
        // authoritative limit; the client count is only a hint.
        if (active) useAppStore.setState({ hydrated: true });
      });
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
          // Recently viewed is device-local and may belong to a different
          // account even though its employer fields are stored masked.
          useRecentJobs.getState().clear();
          // Remove this user's push tokens while still authenticated (RLS),
          // so a shared device stops delivering their alerts after sign-out.
          const uid = session?.user?.id;
          if (uid) await settleWithin(clearPushTokens(uid), 2000);
          await clearAuthSession({
            signOut: (options) => supabase.auth.signOut(options),
            removeItem: (key) => supabaseAuthStorage.removeItem(key),
            storageKey: supabaseAuthStorageKey,
          });
        }
        // Signing out must immediately leave the authenticated UI even when
        // the network and Supabase's local cleanup both fail.
        setSession(null);
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
