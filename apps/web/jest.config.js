/**
 * Program 2 · P2-8B — scoped unit runner for the Audit UI PURE logic only (transport normalization,
 * cursor store, query keys, filters, capabilities). apps/web has no component test runner (no jsdom);
 * React components + responsive/states are verified via the codebase-native Playwright/visual flow
 * (CLAUDE.md). Uses the workspace-hoisted jest + ts-jest — no new dependency is added.
 * @type {import('ts-jest').JestConfigWithTsJest}
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src/lib/audit', '<rootDir>/src/lib/portal'],
  testMatch: ['**/*.spec.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          esModuleInterop: true,
          jsx: 'react-jsx',
          target: 'es2020',
          moduleResolution: 'node',
          skipLibCheck: true,
          resolveJsonModule: true,
        },
      },
    ],
  },
};
