/**
 * ETL CLI. Thin wrapper over the engine (engine.ts).
 *
 * Run INSIDE the customer cloud (PHI never leaves). Never point DATABASE_URL at
 * the demo database.
 *
 * Usage:
 *   ts-node scripts/migration/run.ts --dry-run
 *   ts-node scripts/migration/run.ts --full
 *   ts-node scripts/migration/run.ts --incremental --since=2026-07-19T00:00:00Z
 *
 * Legacy connection via env: LEGACY_PGHOST, LEGACY_PGPORT, LEGACY_PGUSER,
 * LEGACY_PGPASSWORD, LEGACY_PGDATABASE. Target via Prisma DATABASE_URL.
 */
import { PrismaClient } from '@prisma/client';
import { LegacySource } from './core/legacy-source';
import { IdMap, MemoryIdMapStore } from './core/id-map';
import { PrismaIdMapStore } from './core/id-map-store';
import { runEtl } from './engine';
import { formatReport } from './core/reconcile';

function parseArgs(argv: string[]) {
  const has = (f: string) => argv.includes(f);
  const val = (f: string) => {
    const hit = argv.find((a) => a.startsWith(`${f}=`));
    return hit ? hit.slice(f.length + 1) : undefined;
  };
  const sinceRaw = val('--since');
  const limitRaw = val('--limit');
  return {
    dryRun: has('--dry-run'),
    full: has('--full'),
    incremental: has('--incremental'),
    since: sinceRaw ? new Date(sinceRaw) : null,
    limit: limitRaw ? Number(limitRaw) : null,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.dryRun && !args.full && !args.incremental) {
    console.error('Specify one of: --dry-run | --full | --incremental');
    process.exit(2);
  }

  const legacy = new LegacySource({
    host: process.env.LEGACY_PGHOST,
    port: process.env.LEGACY_PGPORT ? Number(process.env.LEGACY_PGPORT) : 5432,
    user: process.env.LEGACY_PGUSER,
    password: process.env.LEGACY_PGPASSWORD,
    database: process.env.LEGACY_PGDATABASE,
    since: args.since,
    limit: args.limit,
  });
  if (args.limit) console.log(`[sample mode] processing at most ${args.limit} rows per table`);
  const prisma = new PrismaClient();
  // Dry-run never writes, so an in-memory id-map is enough; real runs need the
  // durable store so re-runs and the nightly sync stay idempotent.
  const idMap = new IdMap(args.dryRun ? new MemoryIdMapStore() : new PrismaIdMapStore(prisma), args.dryRun);

  await legacy.connect();
  try {
    const report = await runEtl({ legacy, prisma, idMap, dryRun: args.dryRun, incremental: args.incremental });
    console.log('\n' + formatReport(report));
    if (!report.ok) process.exitCode = 1;
  } finally {
    await legacy.end();
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('ETL failed:', e);
  process.exit(1);
});
