import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { GENESIS_PREV_HASH, GENESIS_SEQUENCE } from './audit-chain';

/** Result of allocating the next slot in a chain: the sequence to use and the previous selfHash. */
export interface ChainAllocation {
  sequence: bigint;
  prevHash: string;
}

/**
 * Program 2 · P2-R016B-B1 — the distinguishable failure raised when the writer refuses to allocate
 * because the existing head and ledger cannot be proven consistent. It is a fail-closed integrity
 * incident, NOT a normal error: allocation stops, the transaction rolls back, and the chain is left
 * exactly as it was. CRITICAL_TRANSACTIONAL callers roll back the business mutation with it;
 * OPERATIONAL callers swallow-and-log it (availability policy unchanged) but MUST NOT mutate the chain.
 *
 * GUARANTEE BOUNDARY (canonical — do not weaken this understanding):
 *   The fail-closed writer guard guarantees STRUCTURAL head↔ledger consistency (a head exists iff
 *   events exist, the head matches the unique terminal event's sequence + selfHash, and the sequence
 *   space is contiguous from genesis). It does NOT guarantee full cryptographic verification of
 *   historical linkage — it does not recompute every event hash or re-check every prevHash link on the
 *   write path (that is O(n) per append and would make the business-critical audit write progressively
 *   more expensive). A surgical tamper of an interior event's prevHash under an otherwise-consistent
 *   head passes this guard yet fails verification. Full linkage verification is the responsibility of
 *   the verifier and integrity-monitoring pipeline (R016B-C), never this writer guard.
 */
export type AuditChainIntegrityIncidentKind =
  | 'HEADLESS_HISTORY' // no valid head, but events already exist (the R-016 condition)
  | 'HEAD_WITHOUT_HISTORY' // head claims a sequence, but the ledger has no events
  | 'HEAD_SEQUENCE_MISMATCH' // head.lastSequence != ledger terminal sequence (stale-ahead/behind)
  | 'MISSING_GENESIS' // ledger does not start at the genesis sequence
  | 'SEQUENCE_DISCONTINUITY' // a gap in the 1..N sequence space
  | 'HEAD_HASH_MISMATCH'; // head.lastSelfHash != terminal event's selfHash

/**
 * Recoverability guidance for the future integrity-monitoring/recovery pipeline (R016B-C). `NO` = the
 * ledger has lost or contradicted history and can only be continued via an authorized generation
 * rollover (never a silent in-place repair). `DEPENDS` = the head is out of step with an otherwise
 * intact ledger, so a metadata-only reconciliation of the head MAY be provable (subject to full
 * verification). Every kind here is a high-severity integrity incident; this map only conveys whether
 * forward writes could be restored without a new generation. It carries NO behaviour — the writer
 * always fails closed regardless.
 */
export const AUDIT_CHAIN_INTEGRITY_RECOVERABILITY: Record<AuditChainIntegrityIncidentKind, 'NO' | 'DEPENDS'> = {
  HEADLESS_HISTORY: 'NO',
  HEAD_WITHOUT_HISTORY: 'NO',
  HEAD_SEQUENCE_MISMATCH: 'DEPENDS',
  MISSING_GENESIS: 'NO',
  SEQUENCE_DISCONTINUITY: 'NO',
  HEAD_HASH_MISMATCH: 'NO',
};

export class AuditChainIntegrityError extends Error {
  /** Whether forward writes could be restored without an authorized generation rollover. */
  readonly recoverable: 'NO' | 'DEPENDS';

  constructor(
    readonly chainId: string,
    readonly kind: AuditChainIntegrityIncidentKind,
    detail: string,
  ) {
    super(`Audit chain integrity incident [${kind}] on chain "${chainId}": ${detail}`);
    this.name = 'AuditChainIntegrityError';
    this.recoverable = AUDIT_CHAIN_INTEGRITY_RECOVERABILITY[kind];
  }
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

    // P2-R016B-B1 — Fail-closed integrity guard. Before allocating, prove the (now-locked) head and
    // the ledger agree. All reads run on this transaction under the head's FOR UPDATE lock, so no
    // concurrent writer can change the chain between inspection and allocation. On any mismatch we
    // throw and the whole transaction (including the ON CONFLICT DO NOTHING seed above) rolls back —
    // the chain is never observably mutated. This closes the R-016 mechanism where a missing head over
    // surviving events silently re-genesised. It proves HEAD↔LEDGER consistency + contiguity in O(1)
    // (the DB UNIQUE(chainId, sequence) guarantees distinct sequences, so count==max==lastSequence
    // with min==genesis proves a gapless 1..N space). Deep per-event predecessor re-verification of
    // pre-existing history is intentionally NOT done on this hot path — it is the monitoring/verifier
    // layer's job (R016B-C); a chain built entirely under this guard is inductively linkage-consistent.
    await this.assertHeadLedgerConsistent(tx, chainId, head);

    return { sequence: head.lastSequence + 1n, prevHash: head.lastSelfHash };
  }

  /**
   * Read-only head↔ledger consistency proof, on the caller's transaction under the head lock.
   * Genesis (seed) state is valid ONLY for a truly empty chain; a head that claims history must match
   * the ledger's terminal sequence, hash, genesis start, and contiguous count. Any mismatch is a
   * fail-closed {@link AuditChainIntegrityError}.
   */
  private async assertHeadLedgerConsistent(
    tx: Prisma.TransactionClient,
    chainId: string,
    head: { lastSequence: bigint; lastSelfHash: string },
  ): Promise<void> {
    const count = await tx.auditEvent.count({ where: { chainId } });
    const agg = await tx.auditEvent.aggregate({
      where: { chainId },
      _max: { sequence: true },
      _min: { sequence: true },
    });
    const maxSeq = agg._max.sequence;
    const minSeq = agg._min.sequence;

    if (head.lastSequence === 0n) {
      // Freshly-seeded genesis state: permitted ONLY when no history survives.
      if (count > 0) {
        throw new AuditChainIntegrityError(
          chainId,
          'HEADLESS_HISTORY',
          `head is at the genesis seed (lastSequence=0) but ${count} event(s) already exist — refusing to re-initialise over surviving history`,
        );
      }
      return; // empty chain → genesis allocation is safe
    }

    // Head claims history; the ledger must agree on every structural fact before allocation.
    if (count === 0 || maxSeq === null || minSeq === null) {
      throw new AuditChainIntegrityError(
        chainId,
        'HEAD_WITHOUT_HISTORY',
        `head claims lastSequence=${head.lastSequence} but the ledger holds no events`,
      );
    }
    if (maxSeq !== head.lastSequence) {
      throw new AuditChainIntegrityError(
        chainId,
        'HEAD_SEQUENCE_MISMATCH',
        `head lastSequence=${head.lastSequence} does not match the ledger terminal sequence=${maxSeq}`,
      );
    }
    if (minSeq !== GENESIS_SEQUENCE) {
      throw new AuditChainIntegrityError(
        chainId,
        'MISSING_GENESIS',
        `ledger starts at sequence=${minSeq}, not the genesis sequence ${GENESIS_SEQUENCE}`,
      );
    }
    if (BigInt(count) !== head.lastSequence) {
      throw new AuditChainIntegrityError(
        chainId,
        'SEQUENCE_DISCONTINUITY',
        `ledger event count=${count} does not equal head lastSequence=${head.lastSequence} — a gap exists in the 1..N sequence space`,
      );
    }
    const terminal = await tx.auditEvent.findFirst({
      where: { chainId, sequence: maxSeq },
      select: { selfHash: true },
    });
    if (!terminal || terminal.selfHash !== head.lastSelfHash) {
      throw new AuditChainIntegrityError(
        chainId,
        'HEAD_HASH_MISMATCH',
        `head lastSelfHash does not match the terminal event's selfHash at sequence ${maxSeq}`,
      );
    }
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
