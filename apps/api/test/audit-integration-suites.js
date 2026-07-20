/**
 * Program 2 · P2-R016A-2b — SINGLE SOURCE OF TRUTH for the nine DB-touching audit suites (every
 * `createTestPrisma` consumer). These must run serialized (maxWorkers: 1) on the shared isolated test
 * database to avoid parallel-worker contention; all other suites (unit + unrelated) stay parallel.
 *
 * Referenced by BOTH:
 *   - jest.integration.config.js  → exact INCLUDE (testMatch)
 *   - jest.config.js              → exact EXCLUDE (testPathIgnorePatterns)
 * Do NOT duplicate this list anywhere else. The boundary is an explicit path list (not a naming glob),
 * because `.service.spec.ts` / `.integration.spec.ts` suffixes do NOT reliably separate DB-backed specs
 * from pure unit specs (e.g. query/audit-query.service.spec.ts is a pure unit spec).
 */
const AUDIT_INTEGRATION_SUITES = [
  'src/modules/audit/audit-recorder.integration.spec.ts',
  'src/modules/audit/audit-constraint.integration.spec.ts',
  'src/modules/audit/phi-read-capture.integration.spec.ts',
  'src/modules/audit/phi-aggregate-capture.integration.spec.ts',
  'src/modules/audit/query/audit-query.integration.spec.ts',
  'src/modules/audit/query/audit-query.capture.integration.spec.ts',
  'src/modules/audit/audit-chain.service.spec.ts',
  'src/modules/audit/audit-verification.service.spec.ts',
  'src/modules/audit/system-chain-contamination.regression.spec.ts',
];

// Escape every regex-significant character so a path can never widen the match accidentally.
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// The main jest config uses rootDir='src', so paths are anchored under <rootDir> with the 'src/' prefix removed.
const underRootDir = (p) => p.replace(/^src\//, '');

module.exports = {
  AUDIT_INTEGRATION_SUITES,
  /** Exact INCLUDE for the integration config (rootDir='src'): literal <rootDir>-anchored globs. */
  integrationTestMatch: AUDIT_INTEGRATION_SUITES.map((p) => `<rootDir>/${underRootDir(p)}`),
  /**
   * Exact EXCLUDE for the main config: anchored, dot-escaped regexes matched against the END of the
   * absolute test path (the leading `/` before the path segment + trailing `$` make the match
   * unambiguous, so no unrelated file can be captured).
   */
  integrationIgnorePatterns: AUDIT_INTEGRATION_SUITES.map((p) => `/${escapeRegExp(underRootDir(p))}$`),
};
