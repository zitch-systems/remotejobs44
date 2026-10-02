import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';

/** Keep system icons readable only while a dark hero screen has focus. */
export function useLightStatusBarOnFocus() {
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light', true);
      return () => setStatusBarStyle('auto', true);
    }, []),
  );
}
