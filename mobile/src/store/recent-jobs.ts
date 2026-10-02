// src/store/recent-jobs.ts — jobs the user has opened, most-recent first,
// persisted. Recorded from the job detail; shown on Home as "Recently viewed".
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { persistentStorage } from '@/lib/persistent-storage';
import { isSupabaseConfigured } from '@/lib/supabase';
import type { Job } from '@/lib/types';
import { mergeRecentState, migrateRecentState, pushRecent, toRecent, type RecentJob } from '@/lib/recent';

interface RecentState {
  items: RecentJob[];
  add: (job: Job) => void;
  clear: () => void;
}

export const useRecentJobs = create<RecentState>()(
  persist(
    (set) => ({
      items: [],
      // Live builds keep useful navigation history without persisting employer
      // identity that may only be visible to the current Pro account.
      add: (job) => set((s) => ({ items: pushRecent(s.items, toRecent(job, isSupabaseConfigured)) })),
      clear: () => set({ items: [] }),
    }),
    {
      name: 'rj44-recent-jobs',
      storage: createJSONStorage(() => persistentStorage),
      version: 1,
      migrate: migrateRecentState as (persistedState: unknown, version: number) => RecentState,
      // Configured builds start each process with an empty history. This prevents
      // async hydration from restoring another account's device-local activity;
      // current-session additions are still kept and persisted in masked form.
      merge: (persistedState, currentState) =>
        mergeRecentState(persistedState, currentState, isSupabaseConfigured),
    },
  ),
);
