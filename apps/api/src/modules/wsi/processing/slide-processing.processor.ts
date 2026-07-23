import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { DERIVATIVE_OBJECT_STORE, DerivativeObjectStore } from '../storage/derivative-object-store';
import { SOURCE_MATERIALIZER, SourceMaterializer } from './source-materializer';
import { TILING_ENGINE, TilingEngine, TilingResult } from './tiling-engine';
import { validateTilingOutput } from './tiling-output-validator';
import { loadTilingConfig, TilingConfig } from './tiling-config';
import { JobLeaseService } from './job-lease.service';
import type { ClaimedJob } from './job-lease.service';
import { GenerationSealer } from './generation-sealer';
import { boundedAssetKey, generationPrefix, generationPyramidPrefix } from './derivative-keys';

/** The lease was lost (or never held) at a checkpoint — the worker must perform no further mutation. */
export class LeaseLostError extends Error {
  constructor(stage: string) {
    super(`lease lost before ${stage}; aborting attempt`);
    this.name = 'LeaseLostError';
  }
}

/** Engine-derived source metadata materially conflicts with existing non-null slide metadata. */
export class AcquisitionMetadataConflictError extends Error {
  constructor(public readonly fields: string[]) {
    super(`acquisition metadata conflict on: ${fields.join(', ')}`);
    this.name = 'AcquisitionMetadataConflictError';
  }
}

/**
 * Program 5A · P5-3B.1C-ii — the JobProcessor: a claimed job → an UNSEALED PROCESSING generation with
 * derivative bytes stored and SlideAsset rows registered. It NEVER constructs a manifest, seals,
 * verifies, or marks the job SUCCEEDED — that is B.2. The end-to-end worker loop stays disabled; this
 * processor is invoked directly (tests) until B.2 wires it in and completes the same attempt.
 *
 * Lease-safe: ownership is re-checked (renew) before generation creation, before promotion, and again
 * before the single final registration transaction (which itself re-guards ownership). A stale worker
 * performs no DB mutation after ownership loss. All system-level writes use raw SQL (no lab context).
 */
@Injectable()
export class SlideProcessingProcessor {
  private readonly logger = new Logger(SlideProcessingProcessor.name);
  private readonly config: TilingConfig = loadTilingConfig();

  constructor(
    private readonly prisma: PrismaService,
    private readonly lease: JobLeaseService,
    @Inject(SOURCE_MATERIALIZER) private readonly materializer: SourceMaterializer,
    @Inject(TILING_ENGINE) private readonly engine: TilingEngine,
    @Inject(DERIVATIVE_OBJECT_STORE) private readonly derivStore: DerivativeObjectStore,
    private readonly sealer: GenerationSealer,
  ) {}

  async process(job: ClaimedJob, workerId: string): Promise<{ generationId: string; manifestChecksum: string }> {
    const ing = await this.loadVerifiedIngestion(job.ingestionId);
    const materialized = await this.materializer.materializeVerifiedSource({
      sourceObjectKey: ing.sourceObjectKey,
      expectedChecksum: ing.sourceChecksum,
    });
    const engineOut = await fs.mkdtemp(path.join(os.tmpdir(), 'wsi-engine-out-'));
    const abort = new AbortController();

    try {
      // Lease-guarded generation creation (SELECT job FOR UPDATE owned+RUNNING+lease-valid → INSERT).
      const generationId = await this.createGeneration(job, workerId, ing.slideId, job.labId);

      const result = await this.engine.tile({
        workingFilePath: materialized.path,
        outputDirectory: engineOut,
        config: this.config,
        abortSignal: abort.signal,
      });
      await validateTilingOutput(result, engineOut); // untrusted output

      if (!(await this.lease.renew(job.id, workerId))) throw new LeaseLostError('promotion');
      const promoted = await this.promote(result, engineOut, job.labId, ing.slideId, generationId);

      // ONE final ownership-guarded transaction: acquisition-metadata reconcile + generation metadata +
      // all SlideAsset inserts commit atomically (or none do — a conflict/lease-loss rolls back all three;
      // any already-promoted bytes remain safe orphans under the generation prefix).
      if (!(await this.lease.renew(job.id, workerId))) throw new LeaseLostError('finalization');
      await this.finalizeGeneration(job, workerId, generationId, job.labId, ing.slideId, result, promoted);

      // P5-3B.2B — the final phase of the attempt: build + persist + round-trip the canonical manifest,
      // then atomically seal (PROCESSING → QC_PENDING, sealed=true) and complete the job (→ SUCCEEDED).
      const sealed = await this.sealer.seal({
        jobId: job.id,
        workerId,
        generationId,
        labId: job.labId,
        slideId: ing.slideId,
        ingestionId: job.ingestionId,
        sourceObjectKey: ing.sourceObjectKey,
        sourceChecksum: ing.sourceChecksum,
        result,
        config: this.config,
      });

      return { generationId, manifestChecksum: sealed.manifestChecksum };
    } finally {
      await materialized.dispose().catch(() => undefined);
      await fs.rm(engineOut, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async loadVerifiedIngestion(ingestionId: string) {
    const rows = await this.prisma.$queryRaw<{ slideId: string; sourceObjectKey: string | null; sourceChecksum: string | null }[]>`
      SELECT "slideId", "sourceObjectKey", "sourceChecksum" FROM "SlideIngestion"
      WHERE id = ${ingestionId} AND status = 'VERIFIED'
    `;
    const r = rows[0];
    if (!r || !r.sourceObjectKey || !r.sourceChecksum) throw new Error('ingestion is not VERIFIED / has no source');
    return { slideId: r.slideId, sourceObjectKey: r.sourceObjectKey, sourceChecksum: r.sourceChecksum };
  }

  /**
   * Lease-guarded generation bootstrap. Ownership DOMINATES the idempotency check: the job row is locked
   * FOR UPDATE and re-validated (RUNNING + owned + unexpired) FIRST; only then is an existing generation
   * returned or a new one inserted. A stale worker can never continue on a generation it created earlier.
   */
  private async createGeneration(job: ClaimedJob, workerId: string, slideId: string, labId: string): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const owned = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "SlideProcessingJob"
        WHERE id = ${job.id} AND "workerId" = ${workerId} AND status = 'RUNNING' AND "leaseExpiresAt" > ${now}
        FOR UPDATE
      `;
      if (!owned[0]) throw new LeaseLostError('generation creation'); // ownership guard dominates

      const existing = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "DerivativeGeneration" WHERE "jobId" = ${job.id}`;
      if (existing[0]) return existing[0].id; // idempotent — only after proving current ownership

      const genId = randomUUID();
      await tx.$executeRaw`
        INSERT INTO "DerivativeGeneration" (id, "labId", "slideId", "jobId", status, "tileSourceType", sealed, verified, "createdAt", "updatedAt")
        VALUES (${genId}, ${labId}, ${slideId}, ${job.id}, 'PROCESSING'::"GenerationStatus", 'DZI'::"TileSourceType", false, false, ${now}, ${now})
      `;
      return genId;
    });
  }

  private async promote(result: TilingResult, engineOut: string, labId: string, slideId: string, generationId: string) {
    const prefix = generationPrefix(labId, slideId, generationId);
    const promoted: { role: string; storageKey: string; checksum: string | null; sizeBytes: number }[] = [];
    for (const a of result.assets) {
      const abs = path.resolve(engineOut, a.relativePath); // path already validated within the output root
      if (a.kind === 'tree') {
        const treePrefix = generationPyramidPrefix(prefix);
        const res = await this.derivStore.putImmutableTree(treePrefix, abs);
        promoted.push({ role: a.role, storageKey: treePrefix, checksum: null, sizeBytes: res.byteCount });
      } else {
        const key = boundedAssetKey(prefix, a.role);
        const res = await this.derivStore.putImmutableObject(key, createReadStream(abs));
        promoted.push({ role: a.role, storageKey: key, checksum: res.checksum, sizeBytes: res.sizeBytes });
      }
    }
    return promoted;
  }

  /**
   * The single final ownership-guarded transaction. Re-locks + re-validates job ownership, then commits
   * — ATOMICALLY — the acquisition-metadata reconciliation, the generation structural metadata, and every
   * SlideAsset row. A material acquisition conflict (or lost ownership) throws → the whole transaction
   * rolls back (no slide-metadata change, no generation-metadata change, no asset rows); already-promoted
   * derivative bytes remain safe orphans under the generation prefix.
   */
  private async finalizeGeneration(
    job: ClaimedJob,
    workerId: string,
    generationId: string,
    labId: string,
    slideId: string,
    result: TilingResult,
    promoted: { role: string; storageKey: string; checksum: string | null; sizeBytes: number }[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const owned = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "SlideProcessingJob"
        WHERE id = ${job.id} AND "workerId" = ${workerId} AND status = 'RUNNING' AND "leaseExpiresAt" > ${now}
        FOR UPDATE
      `;
      if (!owned[0]) throw new LeaseLostError('finalization (tx guard)');

      // Acquisition reconciliation, INSIDE the transaction (slide row locked): missing (null incoming)
      // skipped, equivalent is a no-op, a material conflict on an existing non-null value rolls back all.
      const acq = result.acquisition;
      const srows = await tx.$queryRaw<
        { sourceWidth: number | null; sourceHeight: number | null; objectivePower: number | null; mpp: number | null; scanner: string | null }[]
      >`SELECT "sourceWidth", "sourceHeight", "objectivePower", "mpp", scanner FROM "DigitalSlide" WHERE id = ${slideId} FOR UPDATE`;
      const cur = srows[0];
      if (!cur) throw new Error('slide not found for acquisition metadata');
      const conflicts: string[] = [];
      const check = (field: string, current: unknown, incoming: unknown) => {
        if (incoming == null) return;
        if (current != null && current !== incoming) conflicts.push(field);
      };
      check('sourceWidth', cur.sourceWidth, acq.sourceWidth);
      check('sourceHeight', cur.sourceHeight, acq.sourceHeight);
      check('objectivePower', cur.objectivePower, acq.objectivePower);
      check('mpp', cur.mpp, acq.mpp);
      check('scanner', cur.scanner, acq.vendor);
      if (conflicts.length) throw new AcquisitionMetadataConflictError(conflicts);

      await tx.$executeRaw`
        UPDATE "DigitalSlide"
        SET "sourceWidth" = COALESCE("sourceWidth", ${acq.sourceWidth}),
            "sourceHeight" = COALESCE("sourceHeight", ${acq.sourceHeight}),
            "objectivePower" = COALESCE("objectivePower", ${acq.objectivePower}),
            "mpp" = COALESCE("mpp", ${acq.mpp}),
            scanner = COALESCE(scanner, ${acq.vendor}),
            "updatedAt" = ${now}
        WHERE id = ${slideId}
      `;

      const s = result.structure;
      await tx.$executeRaw`
        UPDATE "DerivativeGeneration"
        SET "tiledWidth" = ${s.tiledWidth}, "tiledHeight" = ${s.tiledHeight}, "tileSize" = ${s.tileSize},
            "levelCount" = ${s.levelCount}, "updatedAt" = ${now}
        WHERE id = ${generationId}
      `;
      for (const p of promoted) {
        await tx.$executeRaw`
          INSERT INTO "SlideAsset" (id, "labId", "generationId", role, "storageKey", checksum, "sizeBytes", "createdAt")
          VALUES (${randomUUID()}, ${labId}, ${generationId}, ${p.role}::"SlideAssetRole", ${p.storageKey}, ${p.checksum}, ${p.sizeBytes}, ${now})
        `;
      }
    });
  }
}
