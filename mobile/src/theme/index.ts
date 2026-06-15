// src/theme/index.ts — theme barrel + the useTheme() hook.
// Static design tokens (spacing/radii/fonts/etc.) are imported directly; the
// color set follows the user's appearance preference (System/Light/Dark).
import { useColorScheme } from 'react-native';
import { lightColors, darkColors, type Colors } from './tokens';
import { useThemeMode } from '@/store/theme';

export * from './tokens';

export type Theme = {
  colors: Colors;
  scheme: 'light' | 'dark';
  isDark: boolean;
};

export function useTheme(): Theme {
  const mode = useThemeMode((s) => s.mode);
  // useColorScheme() can be 'light' | 'dark' | 'unspecified' | null.
  const systemDark = useColorScheme() === 'dark';
  const isDark = mode === 'system' ? systemDark : mode === 'dark';
  return { colors: isDark ? darkColors : lightColors, scheme: isDark ? 'dark' : 'light', isDark };
}

