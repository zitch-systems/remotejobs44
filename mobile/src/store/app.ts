// src/store/app.ts — lightweight client state for saved + applied jobs.
// Mirrors the web app's Zustand store. Seeded from the handoff; in production
// hydrate these from the signed-in user's Supabase rows and persist mutations
// back (saved_jobs / applications tables).
import { create } from 'zustand';
import type { AppStatus } from '@/lib/types';
import { SEED_APPLIED, SEED_SAVED } from '@/lib/seed';

interface AppState {
  saved: string[];
  applied: Record<string, AppStatus>;

  isSaved: (id: string) => boolean;
  isApplied: (id: string) => boolean;
  toggleSaved: (id: string) => void;
  applyTo: (id: string) => void;
  /** Reset to a clean slate (used on sign-out). */
  reset: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  saved: [...SEED_SAVED],
  applied: { ...SEED_APPLIED },

  isSaved: (id) => get().saved.includes(id),
  isApplied: (id) => id in get().applied,

  toggleSaved: (id) =>
    set((s) => ({
      saved: s.saved.includes(id) ? s.saved.filter((x) => x !== id) : [...s.saved, id],
    })),

  // Applying seeds the 'applied' status; review/interview transitions come
  // from the backend in production.
  applyTo: (id) =>
    set((s) => (id in s.applied ? s : { applied: { ...s.applied, [id]: 'applied' } })),

  reset: () => set({ saved: [], applied: {} }),
}));
