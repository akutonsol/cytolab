/**
 * Batched write helper. Mappers collect a stream-batch's rows and flush them in
 * ONE round-trip:
 *   - bulk mode (full load, fresh DB): `createMany({ skipDuplicates })` — a single
 *     multi-row INSERT per batch (thousands of rows/sec even over a proxy/tunnel).
 *   - non-bulk (incremental sync): `$transaction` of upserts so existing rows update.
 * No-op in dry-run.
 */
import type { EtlContext } from './context';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface UpsertRow { where: any; data: any }

export async function writeBatch(ctx: EtlContext, model: string, rows: UpsertRow[]): Promise<void> {
  if (ctx.dryRun || rows.length === 0) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delegate = (ctx.prisma as any)[model];
  if (ctx.bulk) {
    await delegate.createMany({ data: rows.map((r) => r.data), skipDuplicates: true });
  } else {
    await ctx.prisma.$transaction(rows.map((r) => delegate.upsert({ where: r.where, create: r.data, update: r.data })));
  }
}
