/**
 * Incremental-sync high-water mark, persisted in the target DB. The nightly job
 * reads the last successful run's start time, syncs everything changed since,
 * and — only on success — advances the mark. Using the run's START time (not its
 * end) guarantees no window is ever skipped, at the cost of harmless re-processing
 * of rows changed mid-run (upserts are idempotent).
 */
import type { PrismaClient } from '@prisma/client';

const KEY = 'legacy-sync';

export class SyncState {
  private ready = false;
  constructor(private prisma: PrismaClient) {}

  private async ensure(): Promise<void> {
    if (this.ready) return;
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS etl_sync_state (
         id          text PRIMARY KEY,
         last_run_at timestamptz
       )`,
    );
    this.ready = true;
  }

  /** The last successful run's high-water mark, or null if never run. */
  async lastRunAt(): Promise<Date | null> {
    await this.ensure();
    const rows = await this.prisma.$queryRawUnsafe<{ last_run_at: Date | null }[]>(
      `SELECT last_run_at FROM etl_sync_state WHERE id = $1`,
      KEY,
    );
    return rows[0]?.last_run_at ?? null;
  }

  /** Advance the mark to `at` (the run's start time). */
  async setLastRunAt(at: Date): Promise<void> {
    await this.ensure();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO etl_sync_state (id, last_run_at) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET last_run_at = EXCLUDED.last_run_at`,
      KEY,
      at,
    );
  }
}
