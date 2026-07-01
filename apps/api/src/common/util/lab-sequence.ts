import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

// Anything with a raw-query method (PrismaService, a $transaction client, etc).
type RawCapable = Pick<PrismaClient, '$queryRaw'>;

/**
 * Atomically allocate the next value of a per-lab counter (`LabSequence`) for
 * `name`. A single `INSERT … ON CONFLICT DO UPDATE … RETURNING` — so concurrent
 * allocations are serialized by the row lock and can never return the same
 * value. Raw SQL bypasses the tenancy extension, so `labId` is passed
 * explicitly. The first allocation for a lab returns `base + 1`; the migration
 * seeds `value` to `max(numeric imported)` so generated ids never collide with
 * imported ones (see DATA_MIGRATION_PLAN.md).
 */
export async function allocateSequence(
  prisma: RawCapable,
  labId: string,
  name: string,
  base: bigint,
): Promise<bigint> {
  const rows = await prisma.$queryRaw<{ value: bigint }[]>`
    INSERT INTO "LabSequence" ("id", "labId", "name", "value", "updatedAt")
    VALUES (${randomUUID()}, ${labId}, ${name}, ${base + 1n}, now())
    ON CONFLICT ("labId", "name")
    DO UPDATE SET "value" = "LabSequence"."value" + 1, "updatedAt" = now()
    RETURNING "value";
  `;
  return rows[0].value;
}

/**
 * True when the error is a unique-constraint violation (P2002) on the given
 * column — the fail-closed backstop for seeded-counter identifiers: on the rare
 * collision (e.g. a mis-seeded counter hitting an imported value) the caller
 * re-allocates and retries rather than overwriting.
 */
export function isUniqueConflict(e: unknown, column: string): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') return false;
  const target = (e.meta as { target?: unknown })?.target;
  return Array.isArray(target) ? (target as string[]).includes(column) : true;
}
