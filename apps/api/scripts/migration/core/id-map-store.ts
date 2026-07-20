/**
 * Durable id-map store, backed by a table in the TARGET (fresh prod) database.
 *
 * The in-memory store is fine for a single full run, but idempotent re-runs and
 * the nightly incremental sync need mappings to persist: entities upserted by
 * their minted uuid (record_status, result_line, specimen, …) would otherwise
 * mint NEW uuids on a second run and duplicate. This store makes
 * (legacyTable, legacyId) -> uuid permanent, colocated with the data it maps.
 */
import type { PrismaClient } from '@prisma/client';
import { IdMapStore } from './id-map';

export class PrismaIdMapStore implements IdMapStore {
  private ready = false;
  constructor(private prisma: PrismaClient) {}

  private async ensure(): Promise<void> {
    if (this.ready) return;
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS etl_id_map (
         legacy_table text   NOT NULL,
         legacy_id    bigint NOT NULL,
         uuid         text   NOT NULL,
         created_at   timestamptz NOT NULL DEFAULT now(),
         PRIMARY KEY (legacy_table, legacy_id)
       )`,
    );
    this.ready = true;
  }

  async load(table: string): Promise<Map<number, string>> {
    await this.ensure();
    const rows = await this.prisma.$queryRawUnsafe<{ legacy_id: bigint; uuid: string }[]>(
      `SELECT legacy_id, uuid FROM etl_id_map WHERE legacy_table = $1`,
      table,
    );
    const m = new Map<number, string>();
    for (const r of rows) m.set(Number(r.legacy_id), r.uuid);
    return m;
  }

  async put(table: string, legacyId: number, uuid: string): Promise<void> {
    await this.ensure();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO etl_id_map (legacy_table, legacy_id, uuid)
       VALUES ($1, $2, $3)
       ON CONFLICT (legacy_table, legacy_id) DO NOTHING`,
      table,
      legacyId,
      uuid,
    );
  }
}
