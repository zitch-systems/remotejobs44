// src/store/prefs.ts — persisted app preferences: whether onboarding has been
// seen, and notification toggles. `hydrated` (runtime-only) flips true once the
// persisted values have loaded from AsyncStorage, so routing can wait for it.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface PrefsState {
  hydrated: boolean;
  onboarded: boolean;
  alertsMatches: boolean;
  alertsApplications: boolean;
  setOnboarded: (v: boolean) => void;
  setAlertsMatches: (v: boolean) => void;
  setAlertsApplications: (v: boolean) => void;
}

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      hydrated: false,
      onboarded: false,
      alertsMatches: true,
      alertsApplications: true,
      setOnboarded: (onboarded) => set({ onboarded }),
      setAlertsMatches: (alertsMatches) => set({ alertsMatches }),
      setAlertsApplications: (alertsApplications) => set({ alertsApplications }),
    }),
    {
      name: 'rj44-prefs',
      storage: createJSONStorage(() => AsyncStorage),
      // Persist only the data fields (not the runtime `hydrated` flag/actions).
      partialize: (s) => ({ onboarded: s.onboarded, alertsMatches: s.alertsMatches, alertsApplications: s.alertsApplications }),
      onRehydrateStorage: () => () => {
        usePrefs.setState({ hydrated: true });
      },
    },
  ),
);
