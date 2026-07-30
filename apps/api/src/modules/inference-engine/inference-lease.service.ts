import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { INFERENCE_CONFIG, InferenceConfig } from './inference-tokens';

/**
 * Program 6 · Phase 6C — lease-based ownership for inference jobs (the concurrency core; mirrors the Program-5
 * JobLeaseService). A background worker is NOT lab-scoped, so claim/renew/reclaim use raw SQL (bypassing the Prisma
 * tenancy extension) at the system level. `FOR UPDATE SKIP LOCKED` gives safe multi-instance claiming; the lease
 * (`leaseExpiresAt`) — not a wall clock — is the authority on ownership. Every state-changing op re-checks
 * `workerId` + `status='RUNNING'`; a lost lease returns 0 rows and the caller MUST abandon its attempt.
 *
 * Reclaim marks an expired RUNNING job TIMED_OUT and RELEASES it — it does NOT auto-enqueue a retry (Decision 6:
 * manual dispatch only). Because the timed-out job is no longer active, the partial-unique index frees a later
 * manual re-dispatch of the same (modelVersion, subject, input).
 */
export interface ClaimedInferenceJob {
  id: string;
  labId: string;
  modelVersionId: string;
  subjectSlideId: string | null;
  inputDigest: string;
  configDigest: string | null;
  adapterId: string;
  attempt: number;
  startedAt: Date;
  leaseExpiresAt: Date;
}

@Injectable()
export class InferenceLeaseService {
  private readonly logger = new Logger(InferenceLeaseService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(INFERENCE_CONFIG) private readonly cfg: InferenceConfig,
  ) {}

  /** Atomically claim the oldest QUEUED job and take a lease. Returns null if none is available. */
  async claim(workerId: string): Promise<ClaimedInferenceJob | null> {
    const now = new Date();
    const leaseExpiry = new Date(now.getTime() + this.cfg.leaseDurationMs);
    const rows = await this.prisma.$queryRaw<ClaimedInferenceJob[]>`
      UPDATE "InferenceJob" AS j
      SET status = 'RUNNING',
          "workerId" = ${workerId},
          "startedAt" = COALESCE(j."startedAt", ${now}),
          "heartbeatAt" = ${now},
          "leaseExpiresAt" = ${leaseExpiry},
          "updatedAt" = ${now}
      WHERE j.id = (
        SELECT c.id FROM "InferenceJob" c
        WHERE c.status = 'QUEUED'
        ORDER BY c."createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING j.id, j."labId", j."modelVersionId", j."subjectSlideId", j."inputDigest",
                j."configDigest", j."adapterId", j.attempt, j."startedAt", j."leaseExpiresAt"
    `;
    return rows[0] ?? null;
  }

  /** Renew the lease. Succeeds ONLY while this worker still owns a RUNNING job; 0 rows → ownership lost. */
  async renew(jobId: string, workerId: string): Promise<boolean> {
    const now = new Date();
    const leaseExpiry = new Date(now.getTime() + this.cfg.leaseDurationMs);
    const count = await this.prisma.$executeRaw`
      UPDATE "InferenceJob"
      SET "heartbeatAt" = ${now}, "leaseExpiresAt" = ${leaseExpiry}, "updatedAt" = ${now}
      WHERE id = ${jobId} AND "workerId" = ${workerId} AND status = 'RUNNING'
    `;
    return count > 0;
  }

  /**
   * Reclaim jobs whose lease has expired (crashed/abandoned workers): RUNNING + leaseExpiresAt < now → TIMED_OUT,
   * released (leaseExpiresAt NULL). NO retry is enqueued (manual dispatch only). Returns the number reclaimed.
   */
  async reclaimExpired(): Promise<number> {
    const now = new Date();
    const reclaimed = await this.prisma.$executeRaw`
      UPDATE "InferenceJob"
      SET status = 'TIMED_OUT', "finishedAt" = ${now}, "errorCode" = 'WORKER_TERMINATED',
          "leaseExpiresAt" = NULL, "updatedAt" = ${now}
      WHERE status = 'RUNNING' AND "leaseExpiresAt" < ${now}
    `;
    if (reclaimed > 0) this.logger.warn(`reclaimed ${reclaimed} expired inference job(s)`);
    return reclaimed;
  }
}
