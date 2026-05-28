import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Vitest config for unit-testing the pure helpers in lib/. The Playwright
// e2e suite stays separate (npm test) — vitest only picks up files matching
// `*.test.ts` so the two never collide.
export default defineConfig({
  test: {
    environment:    'node',
    include:        ['lib/**/*.test.ts', 'app/**/*.test.ts'],
    exclude:        ['node_modules/**', 'tests/e2e/**', '.next/**'],
    reporters:      ['default'],
    coverage: {
      provider:     'v8',
      reporter:     ['text', 'html'],
      include:      ['lib/**/*.ts'],
      exclude:      ['lib/**/*.test.ts', 'lib/mock-data.ts', 'lib/types.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
