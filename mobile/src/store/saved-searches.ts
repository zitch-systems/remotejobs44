// src/store/saved-searches.ts — persisted saved job searches (Jobs tab).
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isEmptySearch, sameCriteria, type SavedSearch, type SearchCriteria } from '@/lib/saved-search';

const MAX = 12;
let seq = 0;

interface SavedSearchState {
  items: SavedSearch[];
  add: (c: SearchCriteria) => void;
  remove: (id: string) => void;
}

export const useSavedSearches = create<SavedSearchState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (c) => {
        if (isEmptySearch(c) || get().items.some((s) => sameCriteria(s, c))) return;
        const item: SavedSearch = {
          id: `${Date.now()}-${seq++}`,
          query: c.query.trim(),
          category: c.category,
          type: c.type,
          level: c.level,
          sort: c.sort,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ items: [item, ...s.items].slice(0, MAX) }));
      },
      remove: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
    }),
    { name: 'rj44-saved-searches', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
