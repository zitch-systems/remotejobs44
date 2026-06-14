// src/theme/index.ts — theme barrel + the useTheme() hook.
// Static design tokens (spacing/radii/fonts/etc.) are imported directly;
// only the color set switches with the OS color scheme.
import { useColorScheme } from 'react-native';
import { lightColors, darkColors, type Colors } from './tokens';

export * from './tokens';

export type Theme = {
  colors: Colors;
  scheme: 'light' | 'dark';
  isDark: boolean;
};

export function useTheme(): Theme {
  // useColorScheme() can be 'light' | 'dark' | 'unspecified' | null; collapse
  // anything that isn't an explicit 'dark' to 'light'.
  const isDark = useColorScheme() === 'dark';
  return { colors: isDark ? darkColors : lightColors, scheme: isDark ? 'dark' : 'light', isDark };
}
