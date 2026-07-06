'use client';
// components/providers/AuthSyncProvider.tsx
//
// Top-level provider that drives the auth-sync side-effects exactly once
// per session. Replaces the giant useEffect that used to live inside
// Header.tsx — moving it here means the Header is purely a renderer
// (subscribing to Zustand for `user` / `isLoggedIn` / `isAdmin`) and the
// auth pipeline isn't tangled with the visual concerns of the top bar.
//
// What runs here:
//   * On mount, syncAuth() validates the persisted Supabase session,
//     fetches the user's profile row, and writes the resolved user into
//     useAuthStore. The Zustand store is the single source of truth that
//     every UI component reads.
//   * onAuthStateChange listens for TOKEN_REFRESHED / SIGNED_IN /
//     SIGNED_OUT / USER_UPDATED and re-syncs without a network roundtrip
//     where it can. Random-logout protection (the SIGNED_OUT 2.5s grace +
//     cookie regex + cross-tab reconciliation) lives here in one place.
//
// The provider renders nothing — it returns `{children}` directly. That
// keeps it free to wrap the whole tree in app/layout.tsx without
// introducing an extra DOM node.
import { useEffect } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { createClient, getAuthedUserSafe } from '@/lib/supabase/client';
import { documentHasSupabaseAuthCookie } from '@/lib/supabase/cookies';
import { useAuthStore, useJobsStore } from '@/lib/store';
import { resolveRole } from '@/lib/auth/redirect';
import { resolvePlan } from '@/lib/auth/plan';
import { fetchServerSavedJobs } from '@/lib/saved-jobs-sync';

export function AuthSyncProvider({ children }: { children: React.ReactNode }) {
  const setUser = useAuthStore(s => s.setUser);

  useEffect(() => {
    // Both stores were configured with `skipHydration: true` so SSR and
    // the first client paint render the empty default state. Trigger the
    // localStorage read here on mount — Zustand re-renders subscribed
    // components with the persisted values as a normal state update,
    // not a hydration mismatch. Without this call, persisted users would
    // appear logged-out forever client-side.
    //
    // rehydrate() returns a Promise. Save the handle so the saved-jobs
    // hydrate IIFE below can await it BEFORE applying the server set —
    // otherwise the rehydrate firing after the fetch would overwrite
    // the fresh server set with stale localStorage. Either order is
    // possible without the await; pinning it removes the race.
    const jobsRehydrate: Promise<void> = (() => {
      try { return (useJobsStore as any).persist?.rehydrate?.() ?? Promise.resolve(); }
      catch { return Promise.resolve(); }
    })();
    try { (useAuthStore as any).persist?.rehydrate?.(); } catch {}

    const supabase = createClient();
    let ignoreNextSignedOut = false;

    async function fetchProfile(userId: string) {
      try {
        const queryPromise = supabase
          .from('profiles').select('name,plan,role,created_at,profile_completion,plan_expires_at')
          .eq('id', userId).maybeSingle()
          .then(({ data }: { data: any }) => data);
        const timeoutPromise = new Promise<null>(res => setTimeout(() => res(null), 5000));
        return await Promise.race([queryPromise, timeoutPromise]);
      } catch { return null; }
    }

    function buildUser(authUser: { id: string; email?: string | null }, profile: any) {
      const role = resolveRole({ profileRole: profile?.role, email: authUser.email });
      const plan = resolvePlan({
        role,
        dbPlan: profile?.plan,
        planExpiresAt: profile?.plan_expires_at,
        currentClientPlan: useAuthStore.getState().user?.plan,
      });
      return {
        id:    authUser.id,
        email: authUser.email!,
        name:  profile?.name ?? authUser.email!.split('@')[0],
        plan,
        role,
        joinedAt: profile?.created_at ?? new Date().toISOString(),
        profileCompletion: profile?.profile_completion ?? 20,
      };
    }

    // Active session recovery. When the browser still has an auth cookie /
    // local session but we couldn't resolve a user (stale access token, or a
    // session the client hasn't reconstructed after the login redirect),
    // force a token refresh. On success this re-reads the refresh token from
    // the cookie, gives us a user, and emits TOKEN_REFRESHED so the rest of
    // the app re-syncs — instead of leaving the UI stuck on "Verifying your
    // session…" waiting for an auto-refresh event that may never fire.
    // Returns true only when a user was populated.
    async function tryRecoverSession(): Promise<boolean> {
      try {
        // Only force a refresh when rotation can actually help: no locally
        // reconstructable session (the original stuck-verifying case), or an
        // access token that is expired / about to expire. If the local token
        // is still comfortably valid, the failed getUser was a network blip —
        // refreshSession() would burn a refresh-token ROTATION whose response
        // can be lost on exactly those flaky connections, leaving the browser
        // holding an already-consumed refresh token. GoTrue's reuse detection
        // then revokes the whole session family: a real, permanent logout
        // manufactured by our own recovery path. Skipping the rotation costs
        // nothing — the token still works, and the next nav re-validates.
        const { data: { session: local } } = await supabase.auth.getSession();
        if (local?.expires_at && local.expires_at * 1000 - Date.now() > 60_000) {
          return false;
        }
        const { data, error } = await supabase.auth.refreshSession();
        if (error || !data?.user) return false;
        const profile = await fetchProfile(data.user.id);
        setUser(buildUser(data.user, profile));
        return true;
      } catch {
        return false;
      }
    }

    async function syncAuth() {
      const { setHydrated } = useAuthStore.getState();
      try {
        const { user: authUser, status, sessionUserId } = await getAuthedUserSafe(supabase);
        if (status === 'unauthed') {
          // 'unauthed' means getSession() found no usable local session. But
          // the browser can momentarily fail to read a freshly-set or chunked
          // auth cookie right after a login redirect — and wiping the user
          // here is exactly what surfaces the false "Your session expired" on
          // /dashboard. Only clear when NO Supabase auth cookie remains;
          // otherwise keep state and let the next onAuthStateChange / page nav
          // re-validate. Mirrors the SIGNED_OUT handler's cookie guard below,
          // so the two stay consistent (drift here reintroduces random logout).
          if (documentHasSupabaseAuthCookie()) {
            // Cookie present but no usable session yet. Actively try to
            // recover (force a refresh) instead of leaving the UI stuck on
            // "Verifying your session…". Only if recovery fails do we keep
            // the existing state and wait for a later nav / auth event.
            if (await tryRecoverSession()) return;
            setHydrated(true);
            return;
          }
          setUser(null);
          return;
        }

        // SECURITY: if the persisted user (from localStorage) is for a
        // different person than the live Supabase session, wipe it. Use
        // sessionUserId (from the local session, not the network call)
        // so the wipe also fires on `transient` — without that, a
        // logged-out user whose first validation comes back transient
        // would keep seeing the previous user's name/plan/role from
        // Zustand until a non-transient call eventually succeeded.
        //
        // ONLY wipe here when we're about to return without a follow-up
        // setUser — otherwise the next setUser(buildUser(...)) below
        // overwrites atomically (setUser already wipes the jobs store on
        // user-id change via resetJobsStoreForNewUser). Calling
        // setUser(null) before setUser(buildUser) caused a one-frame
        // logged-out flash visible in components subscribed to `user`.
        const persisted = useAuthStore.getState().user;
        const crossAccount = !!(persisted && sessionUserId && persisted.id !== sessionUserId);

        if (status === 'transient') {
          if (crossAccount) { setUser(null); setHydrated(true); return; }
          // Stale access token / failed getUser — force a refresh rather than
          // passively waiting for an auto-refresh event. Recovers the common
          // "logged in but stuck verifying" case in one round-trip.
          if (await tryRecoverSession()) return;
          setHydrated(true);
          return;
        }
        if (!authUser) { setUser(null); return; }

        const profile = await fetchProfile(authUser.id);
        if (!profile) {
          // Profile fetch returned null. Two distinct cases:
          //   (a) Fetch timed out / errored (5s cap in fetchProfile). Common
          //       on mobile / cold lambda. If Zustand already has a user
          //       for THIS authUser.id, the persisted plan is more reliable
          //       than a freshly-built skeleton — DO NOT call setUser, just
          //       mark hydrated. Otherwise the persisted 'daily' / 'pro'
          //       gets clobbered to 'free' for the rest of the session.
          //       This was the "Subscribe-button flash after payment" bug.
          //   (b) Cold load, no row yet (fresh Google OAuth, etc.) — write
          //       a skeleton from authUser so downstream code has a user.
          const stillPersisted = useAuthStore.getState().user;
          if (stillPersisted && stillPersisted.id === authUser.id) {
            setHydrated(true);
            return;
          }
          setUser(buildUser(authUser, null));
          return;
        }
        setUser(buildUser(authUser, profile));
      } catch {
        setHydrated(true);
      }
    }

    syncAuth();

    // Server-side saved-jobs hydrate. Fires once on mount whenever
    // there's an authed session — fetches /api/saved-jobs and
    // replaces the in-store set so the server (source of truth)
    // wins over stale localStorage from a previous device.
    //
    // Three guards on the apply step:
    //   * Await the jobs-store rehydrate first so a late-finishing
    //     localStorage read can't overwrite the server set after
    //     we've already applied it.
    //   * Verify the auth user hasn't changed mid-fetch (user can
    //     log out while we're waiting on the GET; without the
    //     re-check we'd repopulate the just-cleared store with the
    //     previous user's saves).
    //   * Always apply the result — including an empty array — so a
    //     cross-device unsave that emptied the server set actually
    //     wipes the local set. Previous code skipped on empty and
    //     left stale ids around.
    (async () => {
      try {
        await jobsRehydrate;
        const { data: { session: s } } = await supabase.auth.getSession();
        if (!s?.user) return;
        const initialUserId = s.user.id;
        const ids = await fetchServerSavedJobs();
        const { data: { session: s2 } } = await supabase.auth.getSession();
        if (s2?.user?.id !== initialUserId) return; // logout / switch happened
        useJobsStore.getState().setSavedJobIds(ids);
      } catch { /* network blip — next page nav will retry */ }
    })();

    // Server-side applications hydrate. The free-trial "N free left" hint and
    // the per-job "Applied" state read useJobsStore.applications, which was
    // previously only backfilled on /dashboard and /applications — so a fresh
    // navigation straight to /jobs showed a stale "3 left" for a user who had
    // already used their allowance. Backfill from the server on mount (same
    // rehydrate-await + user-switch guards as the saved-jobs hydrate above).
    (async () => {
      try {
        await jobsRehydrate;
        const { data: { session: s } } = await supabase.auth.getSession();
        if (!s?.user) return;
        const initialUserId = s.user.id;
        const res = await fetch('/api/applications');
        if (!res.ok) return;
        const json = await res.json();
        const list = Array.isArray(json.applications) ? json.applications : [];
        const { data: { session: s2 } } = await supabase.auth.getSession();
        if (s2?.user?.id !== initialUserId) return; // logout / switch happened
        const store = useJobsStore.getState();
        const known = new Set(store.applications.map((a) => a.id));
        for (const a of list) if (!known.has(a.id)) store.addApplication(a);
      } catch { /* network blip — dashboard / next nav will retry */ }
    })();

    async function handleAuthEvent(event: AuthChangeEvent, session: Session | null) {
      if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        ignoreNextSignedOut = true;
        setTimeout(() => { ignoreNextSignedOut = false; }, 3000);
        if (session?.user) {
          const profile = await fetchProfile(session.user.id);
          // Same guard as syncAuth: if profile fetch failed but Zustand
          // already has a paid user for THIS id, keep the persisted plan
          // rather than overwriting with a plan='free' skeleton.
          if (!profile) {
            const stillPersisted = useAuthStore.getState().user;
            if (stillPersisted && stillPersisted.id === session.user.id) return;
          }
          setUser(buildUser(session.user, profile));
        }
        return;
      }
      if (event === 'SIGNED_OUT') {
        // Do NOT auto-logout from the auth event listener. Supabase can
        // fire SIGNED_OUT during a brief token-refresh race after a normal
        // API call (e.g., right after submitting an application), and a
        // single getUser() check at that moment may legitimately return
        // 401 even though the session is about to recover via the next
        // TOKEN_REFRESHED event.
        //
        // The user's own logout buttons (Header / dashboard / profile)
        // explicitly call setUser(null) + signOut() + redirect — those
        // are the only places that should drop local state. Cross-tab
        // logouts will reconcile on the next page load via syncAuth.
        if (ignoreNextSignedOut) return;
        // Wait a moment for any in-flight TOKEN_REFRESHED to land. If
        // session is genuinely gone AND no auth cookie remains, then
        // log out — otherwise keep state and let the next syncAuth /
        // page nav resolve.
        await new Promise(r => setTimeout(r, 2500));
        const { data: { session: stillSession } } = await supabase.auth.getSession();
        if (stillSession?.user) return; // recovered
        // Final defense: keep persisted state if any sb-* cookie still
        // exists in document.cookie — only log out when storage is
        // truly empty. (Matches the chunked-cookie variant supabase/ssr
        // uses for large sessions, e.g., Google OAuth.) Helper lives in
        // lib/supabase/cookies.ts and is shared with middleware so the
        // two checks stay in lock-step.
        if (documentHasSupabaseAuthCookie()) return;
        setUser(null);
        return;
      }
      if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session?.user) {
        // Same 3s guard as TOKEN_REFRESHED — Supabase v2 can emit a
        // transient SIGNED_OUT immediately after a fresh SIGNED_IN on
        // flaky connections, and the SIGNED_OUT handler's 2.5s wait
        // + cookie regex isn't sufficient on Safari ITP. Suppress the
        // next SIGNED_OUT for 3s so a sign-in event can't be cancelled
        // out by a spurious sign-out right after it.
        ignoreNextSignedOut = true;
        setTimeout(() => { ignoreNextSignedOut = false; }, 3000);
        const profile = await fetchProfile(session.user.id);
        if (!profile) {
          const stillPersisted = useAuthStore.getState().user;
          if (stillPersisted && stillPersisted.id === session.user.id) return;
        }
        setUser(buildUser(session.user, profile));
      }
    }

    // The callback passed to onAuthStateChange MUST stay synchronous.
    // auth-js awaits every subscriber callback while still holding the
    // client-wide auth lock — and in browsers that lock is a navigator.locks
    // Web Lock shared across ALL tabs, with a 5s acquire timeout on every
    // auth call. handleAuthEvent awaits PostgREST queries (fetchProfile),
    // and every PostgREST call internally runs auth.getSession() to attach
    // the access token — which queues behind that same held lock. Running
    // the handler inline therefore deadlocked until fetchProfile's 5s race
    // expired: every SIGNED_IN / TOKEN_REFRESHED / USER_UPDATED held the
    // cross-tab lock ~5s (so event-driven profile fetches ALWAYS came back
    // null), and any auth call racing it from another tab — most visibly
    // updateUser() on /reset-password — either stalled or threw
    // NavigatorLockAcquireTimeoutError after 5s. Deferring to a macrotask
    // lets _notifyAllSubscribers finish and the lock release first; events
    // still start processing in arrival order (FIFO macrotask queue), so the
    // ignoreNextSignedOut sequencing below is preserved.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setTimeout(() => { void handleAuthEvent(event, session); }, 0);
    });

    return () => subscription.unsubscribe();
    // setUser is a stable Zustand selector; empty deps ensure the
    // listener mounts exactly once per session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>{children}</>;
}
