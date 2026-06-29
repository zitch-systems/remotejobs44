// eslint.config.js — ESLint 9 flat config.
//
// Migrated from .eslintrc.json when bumping to Next 16 (which requires
// eslint-config-next 16 + ESLint 9). The flat-config format is the
// only supported shape in ESLint 9; .eslintrc.* files are ignored.
//
// eslint-config-next ships both an array of flat configs at
// `eslint-config-next/core-web-vitals` and the legacy export at
// `eslint-config-next`. We use the core-web-vitals preset for parity
// with the pre-bump configuration.
// CJS interop oddity: eslint-config-next ships the flat-config array as
// the module.exports directly (not `.default`). Trying `.default` here
// yields undefined and an "is not iterable" TypeError at load time.
const nextCoreWebVitals = require('eslint-config-next/core-web-vitals');

module.exports = [
  // Ignore globs — directly equivalent to .eslintignore which is also
  // gone in flat config.
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'out/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      // The Expo/React Native app is a self-contained subproject with its own
      // tsconfig, ESLint (expo lint) and toolchain — keep the web lint/
      // type-check out of it (it would choke on RN types + @/ aliases).
      'mobile/**',
      // Supabase Edge Functions are Deno (remote ESM imports + Deno globals) —
      // not part of the Next/web tsconfig or lint.
      'supabase/functions/**',
      // Generated files
      'next-env.d.ts',
      'public/**',
      // Stray design-handoff bundle artifacts dumped at the repo root by the
      // "critical updates" commit. They are NOT part of the Next.js app (the
      // real source lives in app/ components/ lib/ hooks/) — several are
      // actually images/JSON saved with .ts/.tsx/.js extensions — so they
      // can't be parsed and must be kept out of the web lint/type-check.
      // (tsconfig.json scopes `include` to the app dirs for the same reason.)
      'App.tsx', 'app.js', 'data.ts', 'detail.js', 'pro.tsx',
      'screens.js', 'screens.tsx', 'shared.js', 'store.js', 'store.tsx',
      'sw.js', 'theme.ts', 'ui.js', 'ui.tsx',
    ],
  },
  // Next.js + core-web-vitals presets (already include react, react-hooks,
  // jsx-a11y, import, @next/next plugins).
  ...nextCoreWebVitals,
  // Project-level overrides — same shape as the previous .eslintrc.json
  // `rules` block.
  {
    rules: {
      // The unescaped-entity warnings were fixed in commit 00fb79c but
      // we keep the rule at "warn" rather than "error" so future text
      // typos surface in CI without failing the build.
      'react/no-unescaped-entities': 'warn',

      // eslint-plugin-react-hooks v6 (shipped with eslint-config-next
      // 16 for React Compiler) graduated several previously-internal
      // rules to errors. We don't run the React Compiler yet, so these
      // would fail the build without giving us any of the upside.
      // Demote to "warn" — the messages still surface in CI so we can
      // clean them up incrementally, but they don't block deploys.
      //
      // When we adopt React Compiler, re-promote these to "error"
      // (probably with a separate cleanup PR per file).
      'react-hooks/exhaustive-deps':             'warn',
      'react-hooks/static-components':           'warn',
      'react-hooks/set-state-in-effect':         'warn',
      'react-hooks/purity':                      'warn',
      'react-hooks/immutability':                'warn',
      'react-hooks/globals':                     'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
];
