// src/store/recent-jobs.ts — jobs the user has opened, most-recent first,
// persisted. Recorded from the job detail; shown on Home as "Recently viewed".
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Job } from '@/lib/types';
import { pushRecent, toRecent, type RecentJob } from '@/lib/recent';

interface RecentState {
  items: RecentJob[];
  add: (job: Job) => void;
  clear: () => void;
}

export const useRecentJobs = create<RecentState>()(
  persist(
    (set) => ({
      items: [],
      add: (job) => set((s) => ({ items: pushRecent(s.items, toRecent(job)) })),
      clear: () => set({ items: [] }),
    }),
    { name: 'rj44-recent-jobs', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
