// src/store/search.ts — recent feed searches, persisted (most-recent first).
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MAX = 8;

interface SearchState {
  recent: string[];
  add: (q: string) => void;
  remove: (q: string) => void;
  clear: () => void;
}

export const useSearchHistory = create<SearchState>()(
  persist(
    (set) => ({
      recent: [],
      add: (q) =>
        set((s) => {
          const term = q.trim();
          if (!term) return s;
          return { recent: [term, ...s.recent.filter((x) => x.toLowerCase() !== term.toLowerCase())].slice(0, MAX) };
        }),
      remove: (q) => set((s) => ({ recent: s.recent.filter((x) => x !== q) })),
      clear: () => set({ recent: [] }),
    }),
    { name: 'rj44-search', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
