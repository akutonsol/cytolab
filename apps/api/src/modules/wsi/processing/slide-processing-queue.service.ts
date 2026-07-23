import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { tenantCreate } from '../../../common/tenancy/tenancy.extension';
import { isRetryable } from './processing-error';
import { backoffForAttempt } from './processing-config';
import { PROCESSING_CONFIG, ProcessingConfig } from './processing-tokens';

/** A Prisma transaction client (interactive-transaction callback argument). */
type Tx = Prisma.TransactionClient;

/**
 * Program 5A · P5-3B.1A — processing-job enqueue + reconciliation.
 *
 * TWO enqueue paths, both idempotent against the active-job partial unique index
 * (UNIQUE(ingestionId) WHERE status IN ('QUEUED','RUNNING')) via ON CONFLICT DO NOTHING (`skipDuplicates`):
 *   • the normal path — `enqueueForIngestion` runs INSIDE the ingestion's VERIFIED transaction, so the
 *     VERIFIED transition and the initial QUEUED job commit atomically (lab-scoped; tenancy stamps labId);
 *   • the recovery path — `reconcile` (system-level, raw SQL) repairs any VERIFIED ingestion left
 *     without an active job, and schedules retries using the prior attempt's `finishedAt` + backoff
 *     (so no `nextAttemptAt` schema column is required).
 *
 * B.1A does NO processing: no engine, no generation, no sealing, no SUCCEEDED. Reconciliation only
 * creates QUEUED rows; nothing consumes them until B.1C/B.2. The scheduler that would call `reconcile`
 * is gated off in B.1A.
 */
@Injectable()
export class SlideProcessingQueueService {
  private readonly logger = new Logger(SlideProcessingQueueService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PROCESSING_CONFIG) private readonly cfg: ProcessingConfig,
  ) {}

  /**
   * Enqueue the initial QUEUED job for a VERIFIED ingestion, INSIDE the caller's transaction (lab
   * context present). Idempotent: `skipDuplicates` + the partial unique index make a concurrent/duplicate
   * enqueue a no-op rather than an error, so the surrounding VERIFIED transaction never aborts.
   */
  async enqueueForIngestion(tx: Tx, ingestionId: string): Promise<void> {
    await tx.slideProcessingJob.createMany({
      data: [tenantCreate<Prisma.SlideProcessingJobUncheckedCreateInput>({ ingestionId, status: 'QUEUED', attempt: 1 })],
      skipDuplicates: true,
    });
  }

  /**
   * Recovery sweep (system-level). For every VERIFIED ingestion with no active job and no sealed
   * generation and a remaining attempt budget, enqueue the next attempt when it is DUE:
   *   • no prior job at all → enqueue attempt 1 immediately (repairs a missed transactional enqueue);
   *   • last terminal job is a retryable FAILED and `finishedAt + backoff(attempt)` has elapsed → attempt+1;
   *   • non-retryable / budget-exhausted / a SUCCEEDED job or sealed generation exists → skip.
   * Returns the number of jobs enqueued. Must be run inside `LabContext.runSystem` (raw, cross-lab).
   */
  async reconcile(): Promise<number> {
    const now = new Date();
    // Candidate ingestions: VERIFIED, no active (QUEUED/RUNNING) job, no SEALED generation.
    const candidates = await this.prisma.$queryRaw<{ id: string; labId: string }[]>`
      SELECT i.id, i."labId"
      FROM "SlideIngestion" i
      WHERE i.status = 'VERIFIED'
        AND NOT EXISTS (
          SELECT 1 FROM "SlideProcessingJob" j
          WHERE j."ingestionId" = i.id AND j.status IN ('QUEUED', 'RUNNING')
        )
        AND NOT EXISTS (
          SELECT 1 FROM "DerivativeGeneration" g
          WHERE g."slideId" = i."slideId" AND g.sealed = true
        )
      LIMIT 500
    `;

    let enqueued = 0;
    for (const ing of candidates) {
      const last = await this.prisma.$queryRaw<{ status: string; attempt: number; errorCode: string | null; finishedAt: Date | null }[]>`
        SELECT status::text AS status, attempt, "errorCode", "finishedAt"
        FROM "SlideProcessingJob"
        WHERE "ingestionId" = ${ing.id}
        ORDER BY attempt DESC, "createdAt" DESC
        LIMIT 1
      `;
      const prior = last[0];

      let nextAttempt: number | null = null;
      if (!prior) {
        nextAttempt = 1; // never enqueued (or a missed transactional enqueue)
      } else if (prior.status === 'FAILED' || prior.status === 'TIMED_OUT') {
        const code = (prior.errorCode ?? 'UNKNOWN') as any;
        const dueAt = (prior.finishedAt?.getTime() ?? 0) + backoffForAttempt(this.cfg, prior.attempt);
        if (isRetryable(code) && prior.attempt < this.cfg.maxAttempts && now.getTime() >= dueAt) {
          nextAttempt = prior.attempt + 1;
        }
      }
      if (nextAttempt == null) continue;

      // System-level raw insert (no lab context); idempotent vs the active-job partial unique index.
      const inserted = await this.prisma.$executeRaw`
        INSERT INTO "SlideProcessingJob" (id, "labId", "ingestionId", status, attempt, "createdAt", "updatedAt")
        VALUES (${randomUUID()}, ${ing.labId}, ${ing.id}, 'QUEUED', ${nextAttempt}, ${now}, ${now})
        ON CONFLICT DO NOTHING
      `;
      enqueued += inserted;
    }
    if (enqueued > 0) this.logger.log(`reconcile enqueued ${enqueued} processing job(s)`);
    return enqueued;
  }
}
