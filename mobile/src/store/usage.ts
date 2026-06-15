// src/store/usage.ts — per-day usage counters (persisted) for plan limits.
// Currently tracks applications submitted today; rolls over automatically when
// the local date changes.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

const today = () => new Date().toISOString().slice(0, 10);

interface UsageState {
  date: string;
  applications: number;
  /** Applications submitted today (0 once the day rolls over). */
  todayApplications: () => number;
  bumpApplication: () => void;
}

export const useUsage = create<UsageState>()(
  persist(
    (set, get) => ({
      date: today(),
      applications: 0,
      todayApplications: () => (get().date === today() ? get().applications : 0),
      bumpApplication: () =>
        set((s) => (s.date === today() ? { applications: s.applications + 1 } : { date: today(), applications: 1 })),
    }),
    { name: 'rj44-usage', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
