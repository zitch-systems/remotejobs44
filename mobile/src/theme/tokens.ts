// src/theme/tokens.ts
// RemoteJobs44 design tokens — a 1:1 port of design-reference/colors_and_type.css
// (itself lifted from the web app's tailwind.config.js + globals.css). This is
// the single source of truth for the native app's colors, type, spacing,
// radii and shadows. Keep it in sync with the web tokens.

// ---------------------------------------------------------------------------
// Brand palette — "Deep Ocean" blue
// ---------------------------------------------------------------------------
export const palette = {
  brand50: '#eff6ff',
  brand100: '#dbeafe',
  brand200: '#bfdbfe',
  brand300: '#93c5fd',
  brand400: '#60a5fa',
  brand500: '#3b82f6',
  brand600: '#2563eb', // primary action, links, focus ring
  brand700: '#1d4ed8', // primary hover / heavy text-on-light
  brand800: '#1e3a5f', // dark surface tier 1
  brand900: '#0f1e38', // dark surface tier 2
  brand950: '#060e1f',

  // Accent — "Sunrise orange"
  accent: '#f97316', // logo dot, FAB, Apply button, saved bookmark
  accentLight: '#fbbf46',
  accentDark: '#d48a0a',

  white: '#ffffff',
  black: '#000000',
} as const;

// ---------------------------------------------------------------------------
// Semantic colors — light + dark. Resolve via useTheme().
// Note the handoff uses a slightly cooler screen bg (#f4f7fc) than the web
// (#f8faff); we follow the handoff for the app surface.
// ---------------------------------------------------------------------------
export const lightColors = {
  bgApp: '#f4f7fc',
  bgSection: '#f1f5f9',
  bgCard: '#ffffff',

  border1: '#eaeef6', // card border
  border2: '#e6ecf5', // input / chip border
  border3: '#f1f5f9', // hairline divider

  fg1: '#0f172a', // primary text
  fg2: '#475569', // body text
  fg3: '#64748b', // secondary / labels
  fg4: '#94a3b8', // placeholder / meta / muted icons
  fg5: '#cbd5e1', // disabled / chevrons

  // `as string` widens these off palette's literal types so darkColors
  // (brand500/400) is assignable to `typeof lightColors`.
  brand: palette.brand600 as string,
  brandStrong: palette.brand700 as string,
  accent: palette.accent as string,

  // Semantic status (verified, match, application statuses)
  success: '#1ea05e',
  successText: '#15803d',
  successBg: '#eafaf1',
  successBorder: '#bbf7d0',
  warnText: '#c2410c',
  warnBg: '#fff4ec',
  warnBorder: '#fed7aa',
  infoText: '#1d4ed8',
  infoBg: '#eff6ff',
  infoBorder: '#dbeafe',
  danger: '#dc2626',

  // app chrome
  tabBar: '#ffffff',
  rail: '#0d1b34',
  overlay: 'rgba(15,30,56,0.45)',
  // Intentionally NOT `as const`: values stay `string` so darkColors (different
  // hexes) structurally matches `typeof lightColors`.
};

export const darkColors: typeof lightColors = {
  bgApp: '#0a1628',
  bgSection: '#0f1e38',
  bgCard: '#111c35',

  border1: '#1e2d4a',
  border2: '#1e3a5f',
  border3: '#0f1e38',

  fg1: '#e2e8f4',
  fg2: '#cbd5e1',
  fg3: '#94a3b8',
  fg4: '#64748b',
  fg5: '#334155',

  brand: palette.brand500,
  brandStrong: palette.brand400,
  accent: palette.accent,

  success: '#1ea05e',
  successText: '#34d399',
  successBg: 'rgba(30,160,94,0.14)',
  successBorder: 'rgba(30,160,94,0.35)',
  warnText: '#fbbf46',
  warnBg: 'rgba(245,158,11,0.14)',
  warnBorder: 'rgba(245,158,11,0.35)',
  infoText: '#60a5fa',
  infoBg: 'rgba(37,99,235,0.14)',
  infoBorder: 'rgba(37,99,235,0.35)',
  danger: '#f87171',

  tabBar: '#0d1a2e',
  rail: '#060e1f',
  overlay: 'rgba(0,0,0,0.6)',
} as const;

export type Colors = typeof lightColors;

// ---------------------------------------------------------------------------
// Type — font families come from @expo-google-fonts (loaded in the root
// layout). In React Native each weight is its OWN family name, so we map
// semantic roles → family strings rather than using fontWeight.
// ---------------------------------------------------------------------------
export const fonts = {
  // Sora (display) — headings, buttons, labels, numbers, nav labels
  displayRegular: 'Sora_400Regular',
  displayMedium: 'Sora_500Medium',
  displaySemibold: 'Sora_600SemiBold',
  displayBold: 'Sora_700Bold',
  displayExtrabold: 'Sora_800ExtraBold',
  // DM Sans (body) — paragraphs, descriptions, field text, meta
  body: 'DMSans_400Regular',
  bodyMedium: 'DMSans_500Medium',
  bodyBold: 'DMSans_700Bold',
} as const;

export const fontSizes = {
  '2xs': 10,
  xs: 11,
  sm: 13,
  base: 15,
  md: 17,
  lg: 20,
  xl: 24,
  '2xl': 30,
  '3xl': 38,
  '4xl': 50,
  '5xl': 64,
} as const;

export const lineHeights = {
  tight: 1.05,
  snug: 1.15,
  normal: 1.5,
  relaxed: 1.6,
  loose: 1.75,
} as const;

export const tracking = {
  tight: -0.4, // ~ -0.02em on display sizes (RN letterSpacing is in px)
  normal: 0,
  wide: 0.6, // badge / eyebrow
  wider: 1.0, // uppercase mini-label
} as const;

// ---------------------------------------------------------------------------
// Spacing (4px base), radii, layout
// ---------------------------------------------------------------------------
export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  screenX: 22, // most views
  authX: 28, // auth view side padding
} as const;

export const radii = {
  xs: 4,
  sm: 6,
  md: 10,
  logo: 12, // logo / icon button tiles
  field: 14, // fields / chips / stat cards
  row: 15, // rows / primary buttons / list groups
  lg: 16,
  card: 18, // job cards
  promo: 20,
  xl: 24,
  '2xl': 32,
  pill: 9999,
} as const;

export const layout = {
  headerHeight: 68,
  bottomNavHeight: 68,
  containerMax: 1440,
} as const;

export const motion = {
  fast: 150,
  normal: 200,
  slow: 300,
  // react-native-reanimated spring approximating cubic-bezier(.34,1.56,.64,1)
  spring: { damping: 14, stiffness: 180, mass: 0.7 },
} as const;

// ---------------------------------------------------------------------------
// Shadows — RN shadow descriptors (iOS shadow* + Android elevation).
// Ported from the handoff's CSS box-shadows.
// ---------------------------------------------------------------------------
type Shadow = {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
};

export const shadows = {
  card: {
    shadowColor: '#0f1e38',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 3,
  } as Shadow,
  field: {
    shadowColor: '#0f1e38',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 1,
  } as Shadow,
  primary: {
    shadowColor: palette.brand600,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.35,
    shadowRadius: 28,
    elevation: 8,
  } as Shadow,
  accent: {
    shadowColor: palette.accent,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 26,
    elevation: 9,
  } as Shadow,
} as const;
