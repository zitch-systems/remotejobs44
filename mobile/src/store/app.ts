// src/store/app.ts — client state for saved + applied jobs.
// Demo mode (no backend) is seeded from the handoff; live mode starts empty
// and hydrates from Supabase on sign-in, with optimistic write-through on
// every mutation.
import { create } from 'zustand';
import type { AppStatus, Job } from '@/lib/types';
import { SEED_APPLIED, SEED_SAVED } from '@/lib/seed';
import { isSupabaseConfigured } from '@/lib/supabase';
import { applyRemote, setSavedRemote } from '@/lib/user-state';
import { captureError } from '@/lib/sentry';

interface AppState {
  userId: string | null;
  saved: string[];
  applied: Record<string, AppStatus>;

  isSaved: (id: string) => boolean;
  isApplied: (id: string) => boolean;

  setUserId: (id: string | null) => void;
  hydrate: (data: { saved: string[]; applied: Record<string, AppStatus> }) => void;
  toggleSaved: (id: string) => void;
  applyTo: (job: Job) => void;
  /** Reset to a clean slate (sign-out). */
  reset: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  userId: null,
  // Seed only in demo mode; a real signed-in user starts from their own rows.
  saved: isSupabaseConfigured ? [] : [...SEED_SAVED],
  applied: isSupabaseConfigured ? {} : { ...SEED_APPLIED },

  isSaved: (id) => get().saved.includes(id),
  isApplied: (id) => id in get().applied,

  setUserId: (id) => set({ userId: id }),
  hydrate: ({ saved, applied }) => set({ saved, applied }),

  toggleSaved: (id) => {
    const willSave = !get().saved.includes(id);
    // Optimistic local update.
    set((s) => ({ saved: willSave ? [...s.saved, id] : s.saved.filter((x) => x !== id) }));
    const { userId } = get();
    if (isSupabaseConfigured && userId) {
      setSavedRemote(userId, id, willSave).catch((e) => {
        captureError(e, { scope: 'toggleSaved', id });
        // Roll back on failure.
        set((s) => ({ saved: willSave ? s.saved.filter((x) => x !== id) : [...s.saved, id] }));
      });
    }
  },

  applyTo: (job) => {
    if (job.id in get().applied) return;
    set((s) => ({ applied: { ...s.applied, [job.id]: 'applied' } }));
    const { userId } = get();
    if (isSupabaseConfigured && userId) {
      applyRemote(userId, job).catch((e) => {
        captureError(e, { scope: 'applyTo', id: job.id });
        set((s) => {
          const next = { ...s.applied };
          delete next[job.id];
          return { applied: next };
        });
      });
    }
  },

  reset: () => set({ saved: [], applied: {}, userId: null }),
}));
