import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { PROCESSING_CONFIG, ProcessingConfig } from './processing-tokens';

/**
 * Program 5A · P5-3B.1A — lease-based job ownership (the concurrency core).
 *
 * A background worker is NOT lab-scoped, so claim/renew/reclaim use raw SQL (which bypasses the Prisma
 * tenancy extension) at the system level. `FOR UPDATE SKIP LOCKED` gives safe multi-instance claiming;
 * a lease (`leaseExpiresAt`) — not a wall-clock ceiling — is the authority on ownership. Every
 * state-changing operation re-checks `workerId` + `status='RUNNING'`; a lost lease returns 0 rows and
 * the caller MUST abandon its attempt.
 *
 * B.1A does NO processing: there is no engine, no generation, no sealing, and NO transition to
 * SUCCEEDED (which, per the approved lifecycle, happens only after B.2 sealing). This service manages
 * only the SlideProcessingJob rows.
 */
export interface ClaimedJob {
  id: string;
  ingestionId: string;
  labId: string;
  attempt: number;
  leaseExpiresAt: Date;
}

@Injectable()
export class JobLeaseService {
  private readonly logger = new Logger(JobLeaseService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PROCESSING_CONFIG) private readonly cfg: ProcessingConfig,
  ) {}

  /** Atomically claim the oldest QUEUED job and take a lease. Returns null if none is available. */
  async claim(workerId: string): Promise<ClaimedJob | null> {
    const now = new Date();
    const leaseExpiry = new Date(now.getTime() + this.cfg.leaseDurationMs);
    const rows = await this.prisma.$queryRaw<ClaimedJob[]>`
      UPDATE "SlideProcessingJob" AS j
      SET status = 'RUNNING',
          "workerId" = ${workerId},
          "startedAt" = COALESCE(j."startedAt", ${now}),
          "heartbeatAt" = ${now},
          "leaseExpiresAt" = ${leaseExpiry},
          "updatedAt" = ${now}
      WHERE j.id = (
        SELECT c.id FROM "SlideProcessingJob" c
        WHERE c.status = 'QUEUED'
        ORDER BY c."createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING j.id, j."ingestionId", j."labId", j.attempt, j."leaseExpiresAt"
    `;
    return rows[0] ?? null;
  }

  /** Renew the lease. Succeeds ONLY while this worker still owns a RUNNING job; 0 rows → ownership lost. */
  async renew(jobId: string, workerId: string): Promise<boolean> {
    const now = new Date();
    const leaseExpiry = new Date(now.getTime() + this.cfg.leaseDurationMs);
    const count = await this.prisma.$executeRaw`
      UPDATE "SlideProcessingJob"
      SET "heartbeatAt" = ${now}, "leaseExpiresAt" = ${leaseExpiry}, "updatedAt" = ${now}
      WHERE id = ${jobId} AND "workerId" = ${workerId} AND status = 'RUNNING'
    `;
    return count > 0;
  }

  /**
   * Terminalize a job THIS worker owns (graceful shutdown / classified failure). Ownership-checked; a
   * lost lease returns false and the caller writes nothing further. Does NOT enqueue a retry (the
   * reconciler / reclaimer own retry scheduling).
   */
  async terminalizeOwned(jobId: string, workerId: string, status: 'FAILED' | 'TIMED_OUT', errorCode: string): Promise<boolean> {
    const now = new Date();
    const count = await this.prisma.$executeRaw`
      UPDATE "SlideProcessingJob"
      SET status = ${status}::"ProcessingJobStatus", "finishedAt" = ${now}, "errorCode" = ${errorCode},
          "leaseExpiresAt" = NULL, "updatedAt" = ${now}
      WHERE id = ${jobId} AND "workerId" = ${workerId} AND status = 'RUNNING'
    `;
    return count > 0;
  }

  /**
   * Reclaim jobs whose lease has expired (crashed/abandoned workers): RUNNING + leaseExpiresAt < now →
   * TIMED_OUT, and — since a reclaimed attempt's work is lost — immediately enqueue a retry (attempt+1)
   * within the SAME transaction, bounded by maxAttempts. The active-job partial unique index guarantees
   * only one replacement becomes active. Returns the number of jobs reclaimed.
   */
  async reclaimExpired(): Promise<number> {
    let reclaimed = 0;
    for (;;) {
      const did = await this.prisma.$transaction(async (tx) => {
        const now = new Date();
        const rows = await tx.$queryRaw<{ id: string; ingestionId: string; labId: string; attempt: number }[]>`
          SELECT id, "ingestionId", "labId", attempt FROM "SlideProcessingJob"
          WHERE status = 'RUNNING' AND "leaseExpiresAt" < ${now}
          ORDER BY "leaseExpiresAt" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        `;
        const job = rows[0];
        if (!job) return false;

        await tx.$executeRaw`
          UPDATE "SlideProcessingJob"
          SET status = 'TIMED_OUT', "finishedAt" = ${now}, "errorCode" = 'WORKER_TERMINATED',
              "leaseExpiresAt" = NULL, "updatedAt" = ${now}
          WHERE id = ${job.id}
        `;
        if (job.attempt < this.cfg.maxAttempts) {
          await tx.$executeRaw`
            INSERT INTO "SlideProcessingJob" (id, "labId", "ingestionId", status, attempt, "createdAt", "updatedAt")
            VALUES (${randomUUID()}, ${job.labId}, ${job.ingestionId}, 'QUEUED', ${job.attempt + 1}, ${now}, ${now})
            ON CONFLICT DO NOTHING
          `;
        }
        return true;
      });
      if (!did) break;
      reclaimed++;
      if (reclaimed > 10_000) break; // defensive backstop
    }
    if (reclaimed > 0) this.logger.warn(`reclaimed ${reclaimed} expired processing job(s)`);
    return reclaimed;
  }
}
