/**
 * Program 2 · P2-R016A-2b — dedicated SERIALIZED runner for the nine DB-touching audit suites.
 * maxWorkers:1 eliminates the parallel-worker contention on the shared isolated test database.
 * It reuses the main config's preset, environment, module mapping, setup files, and globalSetup, but
 * replaces the file selection with an EXACT testMatch of the nine suites (the single source of truth in
 * test/audit-integration-suites.js) and does NOT inherit the main config's testRegex or its
 * testPathIgnorePatterns (which exclude these very nine).
 * @type {import('ts-jest').JestConfigWithTsJest}
 */
const base = require('./jest.config');
const { integrationTestMatch } = require('./test/audit-integration-suites');

module.exports = {
  preset: base.preset,
  testEnvironment: base.testEnvironment,
  rootDir: base.rootDir,
  roots: base.roots,
  moduleNameMapper: base.moduleNameMapper,
  globalSetup: base.globalSetup,
  setupFiles: base.setupFiles,
  // Serialize: one worker → no contention on the shared isolated DB / shared chain heads.
  maxWorkers: 1,
  // Run EXACTLY the nine DB-touching audit suites (testMatch, not the inherited testRegex).
  testMatch: integrationTestMatch,
};
