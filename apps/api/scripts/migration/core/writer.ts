/**
 * Batched write helper. Mappers collect a stream-batch's upserts as unexecuted
 * Prisma promises and flush them in ONE `$transaction` round-trip instead of
 * awaiting per row. Over a proxy/tunnel this is the difference between ~13
 * rows/sec and thousands/sec. No-op in dry-run.
 */
import type { EtlContext } from './context';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function flush(ctx: EtlContext, ops: any[]): Promise<void> {
  if (ctx.dryRun || ops.length === 0) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ctx.prisma.$transaction(ops as any);
}
