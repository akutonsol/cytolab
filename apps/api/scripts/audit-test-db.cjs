#!/usr/bin/env node
/**
 * Program 2 · P2-R016A — operational helper to prepare / reset the ISOLATED audit test database.
 * Operational tooling (kept under apps/api/scripts, never shipped in dist). It NEVER touches the dev
 * database: the target name must contain "test" and resolve on a local host, or it aborts.
 *
 *   node scripts/audit-test-db.cjs prepare   # create the *_test database (schema applied by jest globalSetup / migrate deploy)
 *   node scripts/audit-test-db.cjs reset     # drop the *_test database so the next run re-provisions clean
 */
const path = require('path');
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (_) {
  /* rely on the ambient environment */
}
const { PrismaClient } = require('@prisma/client');

function deriveTestName(url) {
  const u = new URL(url);
  const name = u.pathname.replace(/^\//, '');
  return name.endsWith('_test') ? name : `${name}_test`;
}

function assertTestName(name, host) {
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error(`refusing non-local host "${host}"`);
  if (name === 'cytolab') throw new Error('refusing the development database "cytolab"');
  if (!name.toLowerCase().includes('test')) throw new Error(`"${name}" is not an approved test database (needs "test")`);
}

async function main() {
  const cmd = process.argv[2];
  const dev = process.env.TEST_DATABASE_MIGRATION_URL || process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
  if (!dev) throw new Error('no DATABASE_URL/DATABASE_MIGRATION_URL available to derive the test database');
  const u = new URL(dev);
  const testName = process.env.TEST_DATABASE_MIGRATION_URL ? u.pathname.replace(/^\//, '') : deriveTestName(dev);
  assertTestName(testName, u.hostname);
  const admin = new PrismaClient({ datasourceUrl: (() => { const a = new URL(dev); a.pathname = '/postgres'; return a.toString(); })() });
  try {
    if (cmd === 'reset') {
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${testName.replace(/"/g, '""')}" WITH (FORCE)`);
      console.log(`[P2-R016A] dropped ${u.hostname}/${testName} (next test run re-provisions clean)`);
    } else if (cmd === 'prepare') {
      const exists = await admin.$queryRawUnsafe('SELECT 1 n FROM pg_database WHERE datname=$1', testName);
      if (!exists.length) await admin.$executeRawUnsafe(`CREATE DATABASE "${testName.replace(/"/g, '""')}"`);
      console.log(`[P2-R016A] ${u.hostname}/${testName} ready (schema applied by jest globalSetup / migrate deploy)`);
    } else {
      throw new Error('usage: audit-test-db.cjs <prepare|reset>');
    }
  } finally {
    await admin.$disconnect();
  }
}
main().catch((e) => {
  console.error(`[P2-R016A] ${e.message}`);
  process.exit(1);
});
