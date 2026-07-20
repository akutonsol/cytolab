/**
 * Nightly incremental sync (Option B). Designed to be invoked once at 19:00 by
 * cron / Cloud Scheduler — NOT a self-scheduling daemon (stateless invocation is
 * the robust pattern). Each run:
 *
 *   1. reads the last successful run's high-water mark from etl_sync_state,
 *   2. syncs every legacy row changed since (idempotent upserts),
 *   3. advances the mark to THIS run's start time — only if reconciliation is OK.
 *
 * Legacy stays authoritative until cutover; the final freeze-sync is just this
 * job with the legacy DB set read-only. Same env as run.ts.
 */
import { PrismaClient } from '@prisma/client';
import { LegacySource } from './core/legacy-source';
import { IdMap } from './core/id-map';
import { PrismaIdMapStore } from './core/id-map-store';
import { SyncState } from './core/sync-state';
import { runEtl } from './engine';
import { formatReport } from './core/reconcile';

async function main() {
  const prisma = new PrismaClient();
  const state = new SyncState(prisma);
  const runStart = new Date();

  const since = await state.lastRunAt(); // null on the very first run -> full pull
  const legacy = new LegacySource({
    host: process.env.LEGACY_PGHOST,
    port: process.env.LEGACY_PGPORT ? Number(process.env.LEGACY_PGPORT) : 5432,
    user: process.env.LEGACY_PGUSER,
    password: process.env.LEGACY_PGPASSWORD,
    database: process.env.LEGACY_PGDATABASE,
    since,
  });
  const idMap = new IdMap(new PrismaIdMapStore(prisma));

  console.log(`[nightly] start ${runStart.toISOString()} — since ${since ? since.toISOString() : '(initial full)'}`);
  await legacy.connect();
  try {
    const report = await runEtl({ legacy, prisma, idMap, dryRun: false, incremental: since != null });
    console.log('\n' + formatReport(report));
    if (report.ok) {
      await state.setLastRunAt(runStart);
      console.log(`[nightly] OK — high-water mark advanced to ${runStart.toISOString()}`);
    } else {
      console.error('[nightly] reconciliation MISMATCH — high-water mark NOT advanced; investigate');
      process.exitCode = 1;
    }
  } finally {
    await legacy.end();
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('[nightly] failed:', e);
  process.exit(1);
});
