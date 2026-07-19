/**
 * Program 2 · P2-R016A (hardened 2026-07) — per-worker jest setup.
 *
 * Loads apps/api/.env, then REWRITES `DATABASE_URL` / `DATABASE_MIGRATION_URL` to the isolated
 * `_test` database for the entire worker BEFORE any spec constructs a Prisma client. This closes the
 * gap where non-audit integration/e2e specs used a bare `new PrismaClient()` (which reads the dev
 * `DATABASE_URL`) and therefore ran — and once issued a `DELETE FROM "Record"` — against the
 * development/demo database. Now every `new PrismaClient()` and `PrismaService` in a spec resolves to
 * the isolated `_test` DB (provisioned by globalSetup), so no test can ever reach the demo database.
 *
 * Fail-closed: if the resolved URL is not a recognised isolated test database, we throw here — before a
 * single test runs — rather than risk touching real data.
 */
import { join } from 'path';
import { assertIsolatedTestDatabase, resolveTestDatabaseUrl, resolveTestMigrationUrl } from './test-database';

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('dotenv').config({ path: join(__dirname, '..', '.env') });
} catch {
  /* dotenv absent → rely on an externally-provided environment (CI) */
}

// Redirect ALL database access for this worker to the isolated `_test` sibling. resolveTest*Url()
// prefers an explicit TEST_DATABASE_URL (CI), else derives the `<name>_test` sibling of DATABASE_URL.
const runtimeUrl = resolveTestDatabaseUrl();
assertIsolatedTestDatabase(runtimeUrl, 'jest runtime database');
process.env.DATABASE_URL = runtimeUrl;

const migrationUrl = resolveTestMigrationUrl();
assertIsolatedTestDatabase(migrationUrl, 'jest migration database');
process.env.DATABASE_MIGRATION_URL = migrationUrl;
