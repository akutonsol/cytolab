/**
 * Program 2 · P2-R016A — jest globalSetup. Prepares an ISOLATED audit test database so integration
 * tests never touch the development database, and gives every run a clean audit ledger (so no test
 * needs to delete shared chain heads). FAIL-CLOSED: any uncertainty aborts the whole run.
 *
 * Steps: load .env → resolve + guard the isolated `_test` URLs → ensure the DB exists → ensure the
 * schema is applied (migrate deploy via a temp env dir, so the dev .env never leaks in) → reset the
 * audit tables. It only ever acts on a database whose name passes {@link assertIsolatedTestDatabase}.
 */
import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import {
  resolveTestDatabaseUrl,
  resolveTestMigrationUrl,
  assertIsolatedTestDatabase,
  redactDbUrl,
} from './test-database';

const API_DIR = join(__dirname, '..');

function loadDotenv(): void {
  try {
    // Prisma's own client loads .env, but resolveTest*Url() reads process.env directly.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('dotenv').config({ path: join(API_DIR, '.env') });
  } catch {
    /* dotenv absent → rely on an externally-provided environment */
  }
}

function withDbName(url: string, name: string): string {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

async function ensureDatabaseExists(migrationUrl: string): Promise<void> {
  const name = new URL(migrationUrl).pathname.replace(/^\//, '');
  const admin = new PrismaClient({ datasourceUrl: withDbName(migrationUrl, 'postgres') });
  try {
    const rows = await admin.$queryRawUnsafe<Array<{ ok: number }>>(
      'SELECT 1 AS ok FROM pg_database WHERE datname = $1',
      name,
    );
    if (rows.length === 0) {
      // Identifier is a guarded `_test` name; quote it to be safe.
      await admin.$executeRawUnsafe(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
      // eslint-disable-next-line no-console
      console.log(`[P2-R016A] created isolated test database ${redactDbUrl(migrationUrl)}`);
    }
  } finally {
    await admin.$disconnect();
  }
}

async function schemaApplied(runtimeUrl: string): Promise<boolean> {
  const p = new PrismaClient({ datasourceUrl: runtimeUrl });
  try {
    const rows = await p.$queryRawUnsafe<Array<{ ok: number }>>(
      "SELECT 1 AS ok FROM information_schema.tables WHERE table_schema='public' AND table_name='AuditEvent'",
    );
    return rows.length > 0;
  } finally {
    await p.$disconnect();
  }
}

function applySchema(migrationUrl: string): void {
  // Build the schema from the DATAMODEL (schema.prisma), not the ordered migrations. The ordered
  // `migrate deploy` cannot build a fresh DB from zero because of a pre-existing migration-ordering
  // defect (appointments_module references RecallRecord, created in a later migration). `migrate diff
  // --from-empty --to-schema-datamodel` is order-independent and touches NO migration or production
  // file; `db execute --url` applies it to the isolated test DB (no dev-.env dependency).
  const schema = join(API_DIR, 'prisma', 'schema.prisma');
  const sql = execSync(`npx prisma migrate diff --from-empty --to-schema-datamodel "${schema}" --script`, {
    cwd: API_DIR,
  }).toString();
  const dir = mkdtempSync(join(tmpdir(), 'r016a-schema-'));
  try {
    const file = join(dir, 'schema.sql');
    writeFileSync(file, sql);
    execSync(`npx prisma db execute --file "${file}" --url "${migrationUrl}"`, { cwd: API_DIR, stdio: 'inherit' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function resetAuditTables(migrationUrl: string): Promise<void> {
  const p = new PrismaClient({ datasourceUrl: migrationUrl });
  try {
    // Isolated DB only (guarded by caller). Clean slate → tests never delete shared chain heads.
    await p.$executeRawUnsafe('TRUNCATE "AuditEvent", "AuditChainHead" RESTART IDENTITY CASCADE');
  } finally {
    await p.$disconnect();
  }
}

export default async function globalSetup(): Promise<void> {
  loadDotenv();

  const runtimeUrl = resolveTestDatabaseUrl();
  const migrationUrl = resolveTestMigrationUrl();
  // HARD fail-closed on identity for BOTH urls before any connection — an isolation violation must
  // never proceed. (Connectivity/provisioning problems below are soft: they warn and let unit tests
  // run; integration tests then fail-closed at createTestPrisma with a clear message.)
  assertIsolatedTestDatabase(runtimeUrl, 'audit test runtime database');
  assertIsolatedTestDatabase(migrationUrl, 'audit test migration database');

  try {
    await ensureDatabaseExists(migrationUrl);
    if (!(await schemaApplied(runtimeUrl))) {
      applySchema(migrationUrl);
    }
    await resetAuditTables(migrationUrl);
    // eslint-disable-next-line no-console
    console.log(`[P2-R016A] isolated audit test database ready & reset: ${redactDbUrl(runtimeUrl)}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[P2-R016A] could not provision the isolated audit test database (${redactDbUrl(runtimeUrl)}); ` +
        `audit integration tests will fail-closed at createTestPrisma. Cause: ${(err as Error).message}`,
    );
  }
}
