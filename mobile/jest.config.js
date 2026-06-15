/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // We only unit-test the pure logic in src/lib for now; the preset still
  // provides the TS/Babel transform + RN module resolution.
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  testPathIgnorePatterns: ['/node_modules/'],
};
