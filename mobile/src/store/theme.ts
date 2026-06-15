// src/store/theme.ts — user's appearance preference (System / Light / Dark),
// persisted to AsyncStorage. useTheme() (src/theme) reads this.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'system' | 'light' | 'dark';

const ORDER: ThemeMode[] = ['system', 'light', 'dark'];

interface ThemeState {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  /** Cycle System → Light → Dark → System. */
  cycle: () => void;
}

export const useThemeMode = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: 'system',
      setMode: (mode) => set({ mode }),
      cycle: () => set({ mode: ORDER[(ORDER.indexOf(get().mode) + 1) % ORDER.length] }),
    }),
    { name: 'rj44-theme', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
