import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { GenerationVerdictService } from './generation-verdict.service';
import { ProcessingConfig } from './processing-config';

/**
 * Program 5A · Worker Activation (W-ii) — the verification worker runtime, a workload INDEPENDENT of
 * processing (Option B). Two triggers feed one dedup'd `verifyOne`: an immediate best-effort enqueue after
 * a seal, and a periodic reconciler over QC_PENDING generations. It drives each to a terminal READY |
 * QC_FAILED via GenerationVerdictService (which owns the FOR UPDATE + certified-state guard + terminal
 * idempotency). It NEVER publishes, NEVER reprocesses, and NEVER mutates the already-SUCCEEDED processing
 * job — a RETRYABLE/STALE/infra outcome simply leaves the generation QC_PENDING for a later pass.
 */

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms).unref?.());

export class VerificationWorkerRuntime {
  private readonly inFlight = new Map<string, Promise<void>>();
  private draining = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly verdict: GenerationVerdictService,
    private readonly cfg: ProcessingConfig,
    private readonly workerId: string,
    private readonly logger: Logger,
  ) {}

  get inFlightCount(): number {
    return this.inFlight.size;
  }
  private free(): number {
    return Math.max(0, this.cfg.verifyMaxConcurrent - this.inFlight.size);
  }

  /** Immediate best-effort trigger. Drops when already in-flight or at capacity — the reconciler recovers it. */
  enqueue(generationId: string): void {
    if (this.draining || this.inFlight.has(generationId) || this.free() === 0) return;
    this.start(generationId);
  }

  /** Periodic reconciler: fill ALL free slots from the ordered eligible batch (skipping in-flight). */
  async reconcileTick(): Promise<number> {
    if (this.draining || this.free() === 0) return 0;
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT g.id AS id
      FROM "DerivativeGeneration" g
      JOIN "SlideProcessingJob" j ON j.id = g."jobId"
      WHERE g.status = 'QC_PENDING'::"GenerationStatus" AND g.sealed = true AND j.status = 'SUCCEEDED'::"ProcessingJobStatus"
      ORDER BY g."sealedAt" ASC NULLS LAST, g."createdAt" ASC
      LIMIT ${this.cfg.verifyBatchSize}
    `;
    let free = this.free();
    let started = 0;
    for (const r of rows) {
      if (free === 0) break;
      if (this.inFlight.has(r.id)) continue; // duplicate within this process — skip, keep scanning
      this.start(r.id);
      free -= 1;
      started += 1;
    }
    await this.logDivergentAnomaly();
    return started;
  }

  private start(generationId: string): void {
    const p = this.verifyOne(generationId).finally(() => this.inFlight.delete(generationId));
    this.inFlight.set(generationId, p);
  }

  private async verifyOne(generationId: string): Promise<void> {
    try {
      const r = await this.verdict.applyVerdict(generationId);
      switch (r.outcome) {
        case 'READY':
          this.logger.log(`worker=${this.workerId} generation ${generationId} verified → READY (applied=${r.applied})`);
          break;
        case 'QC_FAILED':
          this.logger.warn(`worker=${this.workerId} generation ${generationId} verified → QC_FAILED (applied=${r.applied})`);
          break;
        case 'RETRYABLE':
          this.logger.warn(`generation ${generationId} verification RETRYABLE — left QC_PENDING (${r.cause})`);
          break;
        case 'STALE':
          this.logger.warn(`generation ${generationId} verification STALE — left QC_PENDING (retry later)`);
          break;
        case 'NOT_VERIFIABLE':
          this.logger.log(`generation ${generationId} not verifiable (status=${r.generationStatus}) — idempotent no-op`);
          break;
      }
    } catch (e) {
      // Infrastructure/DB error — leave QC_PENDING. NEVER convert to QC_FAILED; NEVER touch the processing job.
      this.logger.error(`generation ${generationId} verification threw (left QC_PENDING for retry): ${(e as Error)?.message}`);
    }
  }

  /** Observability: a sealed QC_PENDING generation whose job is NOT SUCCEEDED is lifecycle divergence. */
  private async logDivergentAnomaly(): Promise<void> {
    const rows = await this.prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM "DerivativeGeneration" g JOIN "SlideProcessingJob" j ON j.id = g."jobId"
      WHERE g.status = 'QC_PENDING'::"GenerationStatus" AND g.sealed = true AND j.status <> 'SUCCEEDED'::"ProcessingJobStatus"
    `;
    if (rows[0]?.n > 0) this.logger.warn(`verification anomaly: ${rows[0].n} sealed QC_PENDING generation(s) with a non-SUCCEEDED job (not auto-verified)`);
  }

  /** Await verification in-flight up to drainTimeoutMs; unfinished work simply remains recoverable QC_PENDING. */
  async drain(): Promise<void> {
    this.draining = true;
    const pending = [...this.inFlight.values()];
    if (pending.length > 0) await Promise.race([Promise.allSettled(pending), delay(this.cfg.drainTimeoutMs)]);
  }

  /** Await all in-flight verifications WITHOUT draining (tests). */
  async awaitInFlight(): Promise<void> {
    await Promise.allSettled([...this.inFlight.values()]);
  }
}
