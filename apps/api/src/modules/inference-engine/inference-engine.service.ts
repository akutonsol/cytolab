import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, AiModelLifecycleState, InferenceOutcome } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { AuditRecorder } from '../audit/audit-recorder.service';
import { INFERENCE_ADAPTER, INFERENCE_ENGINE_VERSION } from './inference-tokens';
import { InferenceAdapter } from './inference-adapter';
import { InferenceLeaseService, ClaimedInferenceJob } from './inference-lease.service';
import { isEligibleForInference, isValidationOnly } from './inference-job-status';
import { DispatchInferenceDto } from './dto/inference-engine.dto';

/** Result of running one claimed job to terminalization. `ABANDONED` = the lease was lost before the write. */
export interface RunOutcome {
  jobId: string;
  outcome: InferenceOutcome | 'ABANDONED';
}

/**
 * Program 6 · Phase 6C — inference execution ENGINE (orchestration only; never clinical interpretation).
 *
 * Manual dispatch enqueues a lab-scoped InferenceJob (eligibility-checked, idempotent). The worker path claims a
 * job under a lease, invokes the pluggable adapter, then — at terminalization — writes the immutable InferenceRecord
 * evidence ONCE and an append-only InferenceEvent, using system-level raw SQL (the worker is not lab-scoped). Adapter
 * failure never escapes into a clinical path (Decision 8): it is recorded as FAILED evidence + audit, then finishes.
 * Results are digest/reference only — no bytes, no PHI, no diagnostic claim.
 */
@Injectable()
export class InferenceEngineService {
  private readonly logger = new Logger(InferenceEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditRecorder,
    private readonly lease: InferenceLeaseService,
    @Inject(INFERENCE_ADAPTER) private readonly adapter: InferenceAdapter,
  ) {}

  // ── dispatch (manual trigger; lab-scoped) ──────────────────────────────────────────────────────────────────
  async dispatch(dto: DispatchInferenceDto, actorId?: string | null) {
    // Model version must exist in this lab AND be eligible (VALIDATION/APPROVED) — Decision 3.
    const version = await this.prisma.aiModelVersion.findFirst({ where: { id: dto.modelVersionId }, select: { id: true, lifecycleState: true } });
    if (!version) throw new NotFoundException('AI model version not found');
    if (!isEligibleForInference(version.lifecycleState)) {
      throw new BadRequestException(`model version is ${version.lifecycleState}; only VALIDATION or APPROVED versions are eligible for inference`);
    }
    // Optional subject slide must belong to this lab (findFirst is lab-scoped → cross-lab fails closed).
    if (dto.subjectSlideId) {
      const slide = await this.prisma.digitalSlide.findFirst({ where: { id: dto.subjectSlideId }, select: { id: true } });
      if (!slide) throw new BadRequestException('referenced slide not found in this lab');
    }
    const inputDigest = this.resolveInputDigest(dto);
    const configDigest = dto.config == null ? null : this.digest(this.stableStringify(dto.config));

    try {
      const job = await this.prisma.inferenceJob.create({
        data: tenantCreate<Prisma.InferenceJobUncheckedCreateInput>({
          modelVersionId: dto.modelVersionId,
          subjectSlideId: dto.subjectSlideId ?? null,
          inputDigest,
          configDigest,
          adapterId: this.adapter.adapterId,
          createdById: actorId ?? null,
        }),
      });
      await this.audit.recordEntityCreated({ resource: { type: 'InferenceJob', id: job.id }, producerModule: 'inference-engine' }).catch(() => undefined);
      return job;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('an active inference already exists for this model version, subject, and input');
      }
      throw e;
    }
  }

  listJobs() {
    return this.prisma.inferenceJob.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async getJob(id: string) {
    const job = await this.prisma.inferenceJob.findFirst({ where: { id }, include: { record: true, events: { orderBy: { occurredAt: 'asc' } } } });
    if (!job) throw new NotFoundException('inference job not found');
    return job;
  }

  // ── worker path (system-level; not lab-scoped) ─────────────────────────────────────────────────────────────
  /** Claim the oldest QUEUED job and run it to terminalization. Returns null when the queue is empty. */
  async claimAndRun(workerId: string, signal?: AbortSignal): Promise<RunOutcome | null> {
    const claimed = await this.lease.claim(workerId);
    if (!claimed) return null;
    return this.runClaimed(claimed, workerId, signal);
  }

  /** Manual drain (permissioned) — process up to `max` claimable jobs. Returns per-job outcomes. */
  async drain(workerId: string, max = 100): Promise<RunOutcome[]> {
    const out: RunOutcome[] = [];
    for (let i = 0; i < max; i++) {
      const r = await this.claimAndRun(workerId);
      if (!r) break;
      out.push(r);
    }
    return out;
  }

  reclaimExpired(): Promise<number> {
    return this.lease.reclaimExpired();
  }

  /**
   * Execute a claimed job through the adapter and terminalize it: write the immutable InferenceRecord evidence
   * ONCE and one append-only InferenceEvent, all under an ownership-checked compare-and-set. Never throws into a
   * clinical path — an adapter failure is recorded as FAILED evidence. A lost lease (CAS 0 rows) writes nothing.
   */
  private async runClaimed(claimed: ClaimedInferenceJob, workerId: string, signal?: AbortSignal): Promise<RunOutcome> {
    // Eligibility provenance captured AT RUN (immutable) — Decision 3 / Decision 10.
    const stateRow = (await this.prisma.$queryRaw<{ lifecycleState: AiModelLifecycleState }[]>`
      SELECT "lifecycleState" FROM "AiModelVersion" WHERE id = ${claimed.modelVersionId}
    `)[0];
    const lifecycleStateAtRun = stateRow?.lifecycleState ?? null;
    const validationOnly = lifecycleStateAtRun ? isValidationOnly(lifecycleStateAtRun) : false;

    let outcome: InferenceOutcome;
    let resultDigest: string | null = null;
    let resultRef: string | null = null;
    let errorCode: string | null = null;
    let errorDetail: string | null = null;
    try {
      const r = await this.adapter.execute({ modelVersionId: claimed.modelVersionId, inputDigest: claimed.inputDigest, configDigest: claimed.configDigest }, signal);
      resultDigest = r.resultDigest;
      resultRef = r.resultRef;
      outcome = 'SUCCEEDED';
    } catch (err) {
      // Decision 8 — failure never propagates into a clinical path; record it as evidence instead.
      outcome = 'FAILED';
      errorCode = 'ADAPTER_ERROR';
      errorDetail = (err instanceof Error ? err.message : String(err)).slice(0, 500);
      this.logger.warn(`inference job ${claimed.id} adapter FAILED: ${errorDetail}`);
    }

    const finishedAt = new Date();
    const durationMs = Math.max(0, finishedAt.getTime() - claimed.startedAt.getTime());
    const wrote = await this.prisma.$transaction(async (tx) => {
      // Ownership-checked CAS: terminalize ONLY if this worker still owns a RUNNING job.
      const cas = await tx.$executeRaw`
        UPDATE "InferenceJob"
        SET status = ${outcome}::"InferenceJobStatus", "finishedAt" = ${finishedAt}, "leaseExpiresAt" = NULL,
            "errorCode" = ${errorCode}, "errorDetail" = ${errorDetail}, "updatedAt" = ${finishedAt}
        WHERE id = ${claimed.id} AND "workerId" = ${workerId} AND status = 'RUNNING'
      `;
      if (cas < 1) return false; // lease lost → abandon; write no evidence

      // Immutable evidence — written exactly once (jobId is UNIQUE).
      await tx.$executeRaw`
        INSERT INTO "InferenceRecord"
          (id, "recordUuid", "labId", "modelVersionId", "subjectSlideId", "inputDigest", "requestedAt", "createdAt",
           "jobId", "adapterId", "adapterVersion", "engineVersion", "configDigest", "modelLifecycleStateAtRun",
           "validationOnly", outcome, "resultDigest", "resultRef", "startedAt", "finishedAt", "durationMs")
        VALUES
          (${randomUUID()}, ${randomUUID()}, ${claimed.labId}, ${claimed.modelVersionId}, ${claimed.subjectSlideId},
           ${claimed.inputDigest}, ${claimed.startedAt}, ${finishedAt}, ${claimed.id}, ${this.adapter.adapterId},
           ${this.adapter.adapterVersion}, ${INFERENCE_ENGINE_VERSION}, ${claimed.configDigest},
           ${lifecycleStateAtRun}::"AiModelLifecycleState", ${validationOnly}, ${outcome}::"InferenceOutcome",
           ${resultDigest}, ${resultRef}, ${claimed.startedAt}, ${finishedAt}, ${durationMs})
      `;
      // Append-only audit event for the terminal transition.
      await tx.$executeRaw`
        INSERT INTO "InferenceEvent" (id, "labId", "jobId", "fromStatus", "toStatus", "actorId", detail, "eventId", "occurredAt")
        VALUES (${randomUUID()}, ${claimed.labId}, ${claimed.id}, 'RUNNING'::"InferenceJobStatus",
                ${outcome}::"InferenceJobStatus", NULL, ${errorCode}, ${randomUUID()}, ${finishedAt})
      `;
      return true;
    });

    if (!wrote) {
      this.logger.warn(`inference job ${claimed.id} lease lost before terminalization → abandoned (no evidence written)`);
      return { jobId: claimed.id, outcome: 'ABANDONED' };
    }
    await this.audit.recordEntityUpdated({ resource: { type: 'InferenceJob', id: claimed.id }, changedFields: ['status', 'finishedAt'], producerModule: 'inference-engine' }).catch(() => undefined);
    return { jobId: claimed.id, outcome };
  }

  // ── helpers ────────────────────────────────────────────────────────────────────────────────────────────────
  private resolveInputDigest(dto: DispatchInferenceDto): string {
    if (dto.inputDigest) return dto.inputDigest;
    if (dto.inputRef != null) return this.digest(dto.inputRef);
    throw new BadRequestException('an inputRef or inputDigest is required');
  }

  private digest(s: string): string {
    return createHash('sha256').update(s).digest('hex');
  }

  /** Deterministic, key-sorted JSON so a config digest is stable regardless of key order (Guardrail 1 + 2). */
  private stableStringify(value: unknown): string {
    const seen = new WeakSet();
    const norm = (v: unknown): unknown => {
      if (v === null || typeof v !== 'object') return v;
      if (seen.has(v as object)) throw new BadRequestException('config must not contain circular references');
      seen.add(v as object);
      if (Array.isArray(v)) return v.map(norm);
      return Object.keys(v as Record<string, unknown>)
        .sort()
        .reduce((acc, k) => {
          acc[k] = norm((v as Record<string, unknown>)[k]);
          return acc;
        }, {} as Record<string, unknown>);
    };
    return JSON.stringify(norm(value));
  }
}
