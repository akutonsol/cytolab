import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { GENESIS_PREV_HASH } from './audit-chain';

/** Result of allocating the next slot in a chain: the sequence to use and the previous selfHash. */
export interface ChainAllocation {
  sequence: bigint;
  prevHash: string;
}

/**
 * Program 2 · P2-4C — internal chain allocator. Operates ONLY on a supplied Prisma transaction
 * client; it opens no transaction of its own and is never exported outside AuditModule.
 *
 * The `AuditChainHead` row is the per-chain serialization point. Concurrency is handled with a
 * seed-then-lock pattern:
 *   1. `INSERT … ON CONFLICT DO NOTHING` guarantees a head row exists (seeded lastSequence=0,
 *      lastSelfHash=GENESIS_PREV_HASH) without a race — two first-writers cannot both create it.
 *   2. `SELECT … FOR UPDATE` locks that single row, so same-chain writers serialize here while
 *      different-chain writers (different rows) proceed independently.
 * The lock is held until the caller's transaction commits, so allocation, the AuditEvent insert,
 * and the head advance are one atomic unit. No `max(sequence)+1`, no Postgres SEQUENCE (which
 * would gap on rollback), no application-memory lock, no retry infrastructure.
 */
@Injectable()
export class AuditChainService {
  /**
   * Reserve the next sequence for `chainId` and return it with the prevHash to link against.
   * Genesis (an empty chain) yields `sequence = 1`, `prevHash = GENESIS_PREV_HASH` — because the
   * seed row starts at lastSequence=0 / lastSelfHash=GENESIS_PREV_HASH, so the same increment path
   * covers genesis and every subsequent event with no special case.
   */
  async allocate(tx: Prisma.TransactionClient, chainId: string): Promise<ChainAllocation> {
    // Race-safe head creation. NOW() is fine — recordedAt/hash timestamps are app-stamped separately.
    await tx.$executeRaw`
      INSERT INTO "AuditChainHead" ("chainId", "lastSequence", "lastSelfHash", "updatedAt")
      VALUES (${chainId}, 0, ${GENESIS_PREV_HASH}, NOW())
      ON CONFLICT ("chainId") DO NOTHING
    `;

    // Lock the head row for the rest of this transaction; same-chain writers block here.
    const rows = await tx.$queryRaw<Array<{ lastSequence: bigint; lastSelfHash: string }>>`
      SELECT "lastSequence", "lastSelfHash"
      FROM "AuditChainHead"
      WHERE "chainId" = ${chainId}
      FOR UPDATE
    `;
    if (rows.length !== 1) {
      throw new Error(`AuditChainHead row missing for chain "${chainId}" after seed`);
    }

    const head = rows[0];
    return { sequence: head.lastSequence + 1n, prevHash: head.lastSelfHash };
  }

  /**
   * Advance the (locked) head after the AuditEvent insert. Runs on the SAME transaction, so the
   * insert and this advance commit or roll back together — a rolled-back write consumes no sequence.
   */
  async advance(
    tx: Prisma.TransactionClient,
    chainId: string,
    sequence: bigint,
    selfHash: string,
  ): Promise<void> {
    await tx.$executeRaw`
      UPDATE "AuditChainHead"
      SET "lastSequence" = ${sequence}, "lastSelfHash" = ${selfHash}, "updatedAt" = NOW()
      WHERE "chainId" = ${chainId}
    `;
  }
}
