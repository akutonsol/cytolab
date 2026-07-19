/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  // Also discover operational-tooling tests under apps/api/scripts (kept out of the app
  // build so remediation code never ships in dist). See scripts/remediation/**.
  roots: ['<rootDir>', '<rootDir>/../scripts', '<rootDir>/../test'],
  testRegex: '.*\\.spec\\.ts$',
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
