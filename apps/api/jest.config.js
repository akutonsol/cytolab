/** @type {import('ts-jest').JestConfigWithTsJest} */
// P2-R016A-2b — the nine DB-touching audit suites are EXCLUDED here and run serialized via
// jest.integration.config.js (npm run test:integration). `npm test` runs BOTH (see package.json), so
// the full-test command never silently omits them.
const { integrationIgnorePatterns } = require('./test/audit-integration-suites');

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  // Also discover operational-tooling tests under apps/api/scripts (kept out of the app
  // build so remediation code never ships in dist). See scripts/remediation/**.
  roots: ['<rootDir>', '<rootDir>/../scripts', '<rootDir>/../test'],
  testRegex: '.*\\.spec\\.ts$',
  // P2-R016A-2bA/2bB — cap canonical parallelism. The default worker count (~cores-1) oversubscribes
  // the shared PostgreSQL-backed test environment: many DB-heavy/app-booting suites run at once,
  // exhausting the Prisma connection pool and thrashing CPU, which makes the canonical run both slow
  // and non-deterministic. Discovery (2bA) measured a full-green run at 50% and FASTER than default
  // (no thrash). '50%' is relative to cores so it adapts across dev machines/CI. This governs ONLY the
  // parallel pool; jest.integration.config.js sets its own maxWorkers:1 and does not inherit this.
  maxWorkers: '50%',
  // P2-R016A-2b — exclude exactly the nine DB-touching audit suites from the ordinary parallel run;
  // they run serialized via jest.integration.config.js. Patterns come from the single source of truth.
  testPathIgnorePatterns: ['/node_modules/', ...integrationIgnorePatterns],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    // P2-R016A — audit test-infrastructure (isolation guard, helpers). Lives OUTSIDE src so it
    // never enters the production build; reachable from specs as `@test/...`.
    '^@test/(.*)$': '<rootDir>/../test/$1',
  },
  // P2-R016A — prepare & reset an ISOLATED audit test database (never the dev database) once per run.
  globalSetup: '<rootDir>/../test/global-setup.ts',
  // P2-R016A — load .env in each worker so the isolation helper can resolve the `_test` URL.
  setupFiles: ['<rootDir>/../test/jest-setup.ts'],
};
