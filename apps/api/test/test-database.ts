/**
 * Program 2 · P2-R016A — audit test-database isolation & identity guard.
 *
 * ROOT CAUSE (P2-R016 forensic): audit integration tests connected with a bare `new PrismaClient()`,
 * which reads the DEV `DATABASE_URL` (`…/cytolab`). Running against the same database a live app writes
 * to — combined with teardown that deleted shared `system`/`cross-lab` chain heads — corrupted the
 * shared SYSTEM chain. This module makes that impossible: every audit integration test obtains its
 * client through {@link createTestPrisma}, which resolves an ISOLATED test database and **fails closed**
 * unless the connected database is explicitly an approved test database.
 *
 * This is test-infrastructure only — it changes no production runtime, chain, recorder, or schema code.
 */
import { PrismaClient } from '@prisma/client';

/** Databases we must NEVER let integration tests mutate (the development/runtime database). */
export const DENIED_DB_NAMES = ['cytolab'] as const;
/** Only local hosts are permitted for the isolated test database (never a remote/production host). */
export const APPROVED_TEST_HOSTS = ['localhost', '127.0.0.1', '::1'] as const;
/** A database is approved for tests only if its name carries this marker. */
export const TEST_DB_MARKER = 'test';

export class TestDatabaseIsolationError extends Error {
  constructor(message: string) {
    super(
      `Audit integration test BLOCKED to prevent audit-ledger corruption (P2-R016A): ${message}. ` +
        `Point the tests at an isolated test database (e.g. set TEST_DATABASE_URL to a "*_test" database, ` +
        `or run "npm run db:test:prepare").`,
    );
    this.name = 'TestDatabaseIsolationError';
  }
}

/** host + database name only — never user, password, query string, or the full URL. */
export function redactDbUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.hostname}/${u.pathname.replace(/^\//, '') || '(none)'}`;
  } catch {
    return '(unparseable database url)';
  }
}

function dbName(raw: string): string {
  return new URL(raw).pathname.replace(/^\//, '');
}

/** Swap a connection URL's database name to its isolated `<name>_test` sibling (idempotent). */
export function deriveTestUrl(raw: string): string {
  const u = new URL(raw);
  const name = u.pathname.replace(/^\//, '');
  u.pathname = `/${name.endsWith(`_${TEST_DB_MARKER}`) ? name : `${name}_${TEST_DB_MARKER}`}`;
  return u.toString();
}

/**
 * The runtime (client) test URL. Precedence: explicit `TEST_DATABASE_URL`, else the isolated sibling of
 * `DATABASE_URL`. Never returns the dev URL unchanged (the sibling always carries the `_test` marker).
 */
export function resolveTestDatabaseUrl(): string {
  const explicit = process.env.TEST_DATABASE_URL;
  if (explicit) return explicit;
  const dev = process.env.DATABASE_URL;
  if (!dev) throw new TestDatabaseIsolationError('neither TEST_DATABASE_URL nor DATABASE_URL is set');
  return deriveTestUrl(dev);
}

/** The migration (directUrl) test URL — privileged user, isolated `_test` database. */
export function resolveTestMigrationUrl(): string {
  const explicit = process.env.TEST_DATABASE_MIGRATION_URL;
  if (explicit) return explicit;
  const base = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
  if (!base) throw new TestDatabaseIsolationError('no DATABASE_MIGRATION_URL/DATABASE_URL to derive from');
  return deriveTestUrl(base);
}

/**
 * FAIL-CLOSED identity guard. Proceeds ONLY for an explicitly-approved isolated test database; any
 * uncertainty aborts. Never a warning. Never prints credentials.
 */
export function assertIsolatedTestDatabase(rawUrl: string, label = 'test database'): void {
  if (process.env.NODE_ENV === 'production') {
    throw new TestDatabaseIsolationError(`NODE_ENV=production — refusing to touch any database as a ${label}`);
  }
  let name: string;
  let host: string;
  try {
    const u = new URL(rawUrl);
    name = u.pathname.replace(/^\//, '');
    host = u.hostname;
  } catch {
    throw new TestDatabaseIsolationError(`${label} connection string is not a valid URL`);
  }
  if (!name) throw new TestDatabaseIsolationError(`${label} has no database name (${redactDbUrl(rawUrl)})`);
  if (!(APPROVED_TEST_HOSTS as readonly string[]).includes(host)) {
    throw new TestDatabaseIsolationError(`${label} host "${host}" is not a permitted local test host`);
  }
  if ((DENIED_DB_NAMES as readonly string[]).includes(name)) {
    throw new TestDatabaseIsolationError(`${label} "${name}" is the development database (${redactDbUrl(rawUrl)})`);
  }
  if (!name.toLowerCase().includes(TEST_DB_MARKER)) {
    throw new TestDatabaseIsolationError(
      `${label} "${name}" is not an approved test database — its name must contain "${TEST_DB_MARKER}" (got ${redactDbUrl(rawUrl)})`,
    );
  }
}

/**
 * The ONLY sanctioned way for an audit integration test to obtain a Prisma client. Resolves the
 * isolated test URL, runs the fail-closed guard, and binds the client to it — a test can never
 * silently connect to the development database.
 */
export function createTestPrisma(): PrismaClient {
  const url = resolveTestDatabaseUrl();
  assertIsolatedTestDatabase(url, 'audit integration test database');
  return new PrismaClient({ datasourceUrl: url });
}

/**
 * Reset specific chains (events + head) in the ISOLATED test database. This is the ONLY sanctioned way
 * for a test to clear a shared chain identity (`system` / `cross-lab`): it re-runs the fail-closed
 * isolation guard first, so it can NEVER delete a shared head in the development database — unlike the
 * raw `DELETE FROM "AuditChainHead" … IN ('system','cross-lab')` teardown that caused R-016 (which the
 * P2-R016A static guard now forbids in test files). Deleting by explicit chainId only; never a wildcard.
 */
export async function resetIsolatedChain(prisma: PrismaClient, ...chainIds: string[]): Promise<void> {
  // Defense-in-depth: refuse to run against anything but an approved isolated test database.
  assertIsolatedTestDatabase(resolveTestDatabaseUrl(), 'chain-reset target');
  for (const chainId of chainIds) {
    if (!chainId) continue;
    await prisma.auditEvent.deleteMany({ where: { chainId } });
    await prisma.auditChainHead.deleteMany({ where: { chainId } });
  }
}
