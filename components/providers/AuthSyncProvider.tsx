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
import { createClient, getAuthedUserSafe } from '@/lib/supabase/client';
import { documentHasSupabaseAuthCookie } from '@/lib/supabase/cookies';
import { useAuthStore } from '@/lib/store';
import { resolveRole } from '@/lib/auth/redirect';
import { resolvePlan } from '@/lib/auth/plan';

export function AuthSyncProvider({ children }: { children: React.ReactNode }) {
  const setUser = useAuthStore(s => s.setUser);

  useEffect(() => {
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

    async function syncAuth() {
      const { setHydrated } = useAuthStore.getState();
      try {
        const { user: authUser, status, sessionUserId } = await getAuthedUserSafe(supabase);
        if (status === 'unauthed')  { setUser(null); return; }

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
          if (crossAccount) setUser(null);
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
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
    });

    return () => subscription.unsubscribe();
    // setUser is a stable Zustand selector; empty deps ensure the
    // listener mounts exactly once per session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>{children}</>;
}
