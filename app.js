// RemoteJobs44 — theme tokens (light + dark). Mirrors the PWA's Deep Ocean palette.
export const palette = {
  brand50: '#eff6ff', brand100: '#dbeafe', brand400: '#60a5fa', brand500: '#3b82f6',
  brand600: '#2563eb', brand700: '#1d4ed8', accent: '#f97316', success: '#22c55e',
  ocean1: '#0c2249', ocean2: '#0a1a36', ocean3: '#07142a',
};

export const light = {
  mode: 'light' as const,
  bg: '#f4f7fc', bgElev: '#ffffff', card: '#ffffff',
  fg1: '#0f172a', fg2: '#475569', fg3: '#64748b', fg4: '#94a3b8',
  line: '#e8eef6', line2: '#dde5f0', ...palette,
};
export const dark = {
  mode: 'dark' as const,
  bg: '#070d1c', bgElev: '#0d1830', card: '#101c38',
  fg1: '#f1f5fb', fg2: '#aebfd6', fg3: '#8497b4', fg4: '#5e7295',
  line: '#1c2c4d', line2: '#243558', ...palette,
};
export type Theme = typeof light;

export const font = {
  // Load Sora + DM Sans via expo-font in a real build; system fallback here.
  display: undefined as string | undefined,
  body: undefined as string | undefined,
};

export const grads: Record<string, [string, string]> = {
  Engineering: ['#2563eb', '#1e3a8a'], Design: ['#9333ea', '#6b21a8'],
  Marketing: ['#db2777', '#9d174d'], Data: ['#0891b2', '#155e75'],
  Support: ['#ea580c', '#9a3412'], Sales: ['#e11d48', '#9f1239'],
  Product: ['#4f46e5', '#3730a3'], VA: ['#0d9488', '#115e59'],
};
