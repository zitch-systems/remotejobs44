// lib/store.ts
// Using zustand 4.4.7 — pinned in package.json to avoid createWithEqualityFn deprecation
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User, Toast, Application, SearchFilters } from './types';

// Safe localStorage wrapper — works in SSR (no window) and client
const storage = () =>
  typeof window !== 'undefined'
    ? localStorage
    : { getItem: () => null, setItem: () => {}, removeItem: () => {} };

// Reset the jobs/applications store when the signed-in user changes (or signs out).
// Declared up top because useAuthStore.setUser needs to call it. Using getState()
// is safe since useJobsStore is defined below in the same module — by the time
// setUser fires at runtime the store exists.
function resetJobsStoreForNewUser() {
  // Lazy reference to avoid TDZ during module init.
  const jobs = (useJobsStore as any)?.getState?.();
  if (jobs?.reset) jobs.reset();
}

// ── Auth Store ──────────────────────────────────────────────────────────────
interface AuthState {
  user: User | null;
  token: string | null;
  dailyAppsUsed: number;
  // True after Header's syncAuth has confirmed the persisted user matches a
  // real Supabase session (or cleared it). Until then, persisted role/plan
  // might be from a *previous* account on this browser, so role-dependent UI
  // (Admin link, plan badge) must not render.
  hydrated: boolean;
  // Actions
  login:      (user: User, token: string) => void;
  logout:     () => void;
  setUser:    (user: User | null) => void;
  setHydrated:(v: boolean) => void;
  updateUser: (patch: Partial<User>) => void;
  incrementDailyApp: () => void;
  // Selectors (functions so they always read latest state)
  isLoggedIn: () => boolean;
  isPro:      () => boolean;
  isAdmin:    () => boolean;
  isAgent:    () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user:  null,
      token: null,
      dailyAppsUsed: 0,
      hydrated: false,

      login:      (user, token) => set({ user, token, hydrated: true }),
      logout:     () => {
        // Wipe in-memory + persisted state from BOTH stores. The previous
        // version called resetJobsStoreForNewUser() (which only clears
        // useJobsStore in-memory) but didn't wipe the auth localStorage —
        // any caller using store.logout() without doing its own cleanup
        // left rj44-auth around for the next user on this device.
        resetJobsStoreForNewUser();
        set({ user: null, token: null, dailyAppsUsed: 0, hydrated: true });
        try {
          localStorage.removeItem('rj44-auth');
          localStorage.removeItem('rj44-jobs');
        } catch {}
      },
      setHydrated:(v) => set({ hydrated: v }),
      setUser:    (user) => set((s) => {
        // Only reset jobs / dailyAppsUsed when the user GENUINELY switched
        // accounts (both prev AND next are non-null, AND ids differ). The
        // previous version also reset on (prev=A, next=null) and
        // (prev=null, next=A) which wiped applications every time a
        // transient auth blip caused setUser(null) — that's why users
        // reported "applied 10 jobs then upgraded → counter shows 0".
        //
        // Real account switches (user A logs out → user B logs in on the
        // same device) are handled by login/register's explicit
        // localStorage.removeItem('rj44-jobs') call BEFORE setUser, AND
        // by the prev=A → next=B branch below.
        //
        // The pure logout path (setUser(null)) does NOT reset here — it
        // goes through handleLogout which clears localStorage explicitly.
        const prevId = s.user?.id ?? null;
        const nextId = user?.id ?? null;
        const realAccountSwitch = !!(prevId && nextId && prevId !== nextId);
        if (realAccountSwitch) resetJobsStoreForNewUser();
        return {
          user,
          hydrated: true, // any explicit setUser counts as a confirmed sync
          dailyAppsUsed: realAccountSwitch
            ? 0
            : (user?.plan === 'daily' && s.user?.plan !== 'daily' ? 0 : s.dailyAppsUsed),
        };
      }),
      updateUser: (patch) =>
        set((s) => ({ user: s.user ? { ...s.user, ...patch } : null })),
      incrementDailyApp: () => set((s) => ({ dailyAppsUsed: s.dailyAppsUsed + 1 })),

      isLoggedIn: () => !!get().user,
      isPro:      () => ['daily', 'pro', 'admin'].includes(get().user?.plan ?? ''),
      isAdmin:    () => get().user?.role === 'admin',
      isAgent:    () => get().user?.role === 'agent',
    }),
    {
      name:    'rj44-auth',
      storage: createJSONStorage(storage),
      // skipHydration: true means Zustand will NOT auto-read localStorage
      // at module-load time on the client. Both SSR and the first client
      // render see the empty default state (user: null, dailyAppsUsed: 0)
      // — preventing the hydration mismatch where logged-in JobCard
      // headers, BottomNav badges and JobActionsCard "Apply" buttons
      // diverged between the server HTML (logged-out look) and the first
      // client render (logged-in look from localStorage). AuthSyncProvider
      // explicitly calls useAuthStore.persist.rehydrate() after mount.
      skipHydration: true,
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        dailyAppsUsed: state.dailyAppsUsed,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = false;
      },
    }
  )
);

// ── UI / Toast Store ─────────────────────────────────────────────────────────
interface UIState {
  toasts:         Toast[];
  mobileMenuOpen: boolean;
  addToast:       (toast: Omit<Toast, 'id'>) => void;
  removeToast:    (id: string) => void;
  setMobileMenuOpen: (open: boolean) => void;
  toast: (message: string, type?: Toast['type'], duration?: number) => void;
}

export const useUIStore = create<UIState>((set) => ({
  toasts:         [],
  mobileMenuOpen: false,

  addToast: (t) => {
    const id = Math.random().toString(36).slice(2, 8);
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    const dur = t.duration ?? 4000;
    if (dur > 0)
      setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), dur);
  },

  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  setMobileMenuOpen: (open) => set({ mobileMenuOpen: open }),

  toast: (message, type = 'info', duration = 4000) => {
    const id = Math.random().toString(36).slice(2, 8);
    set((s) => ({ toasts: [...s.toasts, { id, message, type, duration }] }));
    if (duration > 0)
      setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), duration);
  },
}));

// ── Jobs / Saved Store ────────────────────────────────────────────────────────
interface JobsState {
  savedJobIds:   string[];
  applications:  Application[];
  savedFilters:  SearchFilters;
  toggleSave:    (id: string) => boolean;
  isSaved:       (id: string) => boolean;
  addApplication:(app: Application) => void;
  hasApplied:    (jobId: string) => boolean;
  setSavedFilters:(f: SearchFilters) => void;
  /** Replace the saved set wholesale — used by the AuthSync hydrate
   *  call to merge the server-side `saved_jobs` table into Zustand. */
  setSavedJobIds:(ids: string[]) => void;
  reset:         () => void;
}

export const useJobsStore = create<JobsState>()(
  persist(
    (set, get) => ({
      savedJobIds:  [],
      applications: [],
      savedFilters: {},

      toggleSave: (id) => {
        const saved = get().savedJobIds.includes(id);
        set((s) => ({
          savedJobIds: saved
            ? s.savedJobIds.filter((x) => x !== id)
            : [...s.savedJobIds, id],
        }));
        return !saved;
      },

      isSaved:        (id)    => get().savedJobIds.includes(id),
      // Server-sourced replace. Used by the AuthSync hydrate fetch on
      // mount so the server (source of truth) wins over any stale
      // localStorage from a different device. If a user unsaves a
      // job on device B, device A on next load sees the server set
      // and the locally-cached id disappears — without this it would
      // resurrect on every page load via a merge.
      //
      // The race against an in-flight optimistic toggleSave is real
      // but narrow (the AuthSync useEffect fires before the UI is
      // interactive, ~100ms window). If a user does manage to click
      // Save in that window, the server POST still fires and the
      // next page nav reconciles via this same path.
      setSavedJobIds: (ids)   => set(() => ({
        savedJobIds: Array.from(new Set(ids)),
      })),
      addApplication: (app)   => set((s) => ({ applications: [app, ...s.applications] })),
      hasApplied:     (jobId) => get().applications.some((a) => a.jobId === jobId),
      setSavedFilters:(f)     => set({ savedFilters: f }),
      // Wipe in-memory state AND the persisted localStorage entry. Called from
      // useAuthStore.setUser whenever the signed-in user changes.
      reset: () => {
        set({ savedJobIds: [], applications: [], savedFilters: {} });
        try { localStorage.removeItem('rj44-jobs'); } catch {}
      },
    }),
    {
      name:    'rj44-jobs',
      storage: createJSONStorage(storage),
      // Same skipHydration treatment as useAuthStore — savedJobIds is read
      // by JobCard's "Saved" badge and the BottomNav saved-count pill,
      // both rendered server-side. AuthSyncProvider triggers rehydration
      // after mount via useJobsStore.persist.rehydrate().
      skipHydration: true,
    }
  )
);

// useLangStore was scaffolded for a multi-locale feature that never
// shipped — no component imported it and the persisted `rj44-lang`
// localStorage entry was dead weight. Removed in this commit. If
// internationalisation comes back, lift from this commit's parent.
