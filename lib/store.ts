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
  // Actions
  login:      (user: User, token: string) => void;
  logout:     () => void;
  setUser:    (user: User | null) => void;
  updateUser: (patch: Partial<User>) => void;
  incrementDailyApp: () => void;
  // Selectors (functions so they always read latest state)
  isLoggedIn: () => boolean;
  isPro:      () => boolean;
  isAdmin:    () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user:  null,
      token: null,
      dailyAppsUsed: 0,

      login:      (user, token) => set({ user, token }),
      logout:     () => { resetJobsStoreForNewUser(); set({ user: null, token: null, dailyAppsUsed: 0 }); },
      setUser:    (user) => set((s) => {
        // If the signed-in user actually changed (different id, or signed out
        // entirely), wipe any cached saved-jobs/applications from the previous
        // account so the new user doesn't see stale data.
        const prevId = s.user?.id ?? null;
        const nextId = user?.id ?? null;
        if (prevId !== nextId) resetJobsStoreForNewUser();
        return {
          user,
          dailyAppsUsed: (user?.plan === 'daily' && s.user?.plan !== 'daily') ? 0 : s.dailyAppsUsed,
        };
      }),
      updateUser: (patch) =>
        set((s) => ({ user: s.user ? { ...s.user, ...patch } : null })),
      incrementDailyApp: () => set((s) => ({ dailyAppsUsed: s.dailyAppsUsed + 1 })),

      isLoggedIn: () => !!get().user,
      isPro:      () => ['daily', 'pro', 'admin'].includes(get().user?.plan ?? ''),
      isAdmin:    () => get().user?.role === 'admin',
    }),
    {
      name:    'rj44-auth',
      storage: createJSONStorage(storage),
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
    }
  )
);

// ── Language Store ────────────────────────────────────────────────────────────
type Locale = 'en' | 'fr' | 'es' | 'de' | 'pt' | 'ar' | 'zh' | 'ja';
interface LangState {
  locale:    Locale;
  setLocale: (l: Locale) => void;
}

export const useLangStore = create<LangState>()(
  persist(
    (set) => ({
      locale: 'en' as Locale,
      setLocale: (locale) => set({ locale }),
    }),
    { name: 'rj44-lang' }
  )
);
