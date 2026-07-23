import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import {
  DERIVATIVE_OBJECT_STORE,
  DerivativeObjectStore,
  DerivativeWriteOnceError,
} from '../storage/derivative-object-store';
import { JobLeaseService } from './job-lease.service';
import { TilingConfig } from './tiling-config';
import { TilingResult } from './tiling-engine';
import { buildManifest, ManifestInput } from './manifest/manifest-builder';
import { ManifestAsset, ManifestProcessingConfig, ManifestStructure } from './manifest/manifest';
import { digestPyramid } from './manifest/pyramid-digest';
import { generationManifestKey, generationPrefix, generationPyramidPrefix } from './derivative-keys';

/** The lease was lost (or never held) at a seal checkpoint — the worker must perform no further mutation. */
export class SealLeaseLostError extends Error {
  constructor(stage: string) {
    super(`lease lost before ${stage}; aborting seal`);
    this.name = 'SealLeaseLostError';
  }
}

/** The generation is already sealed (a prior legitimate completion). Distinct from lost-ownership. */
export class GenerationAlreadySealedError extends Error {
  constructor(generationId: string) {
    super(`generation ${generationId} is already sealed`);
    this.name = 'GenerationAlreadySealedError';
  }
}

/** The generation/job is in an unexpected (illegal) state at seal — neither lost-ownership nor already-sealed. */
export class GenerationStateError extends Error {
  constructor(detail: string) {
    super(`illegal state at seal: ${detail}`);
    this.name = 'GenerationStateError';
  }
}

/** The persisted manifest bytes do not round-trip to the intended manifest. */
export class ManifestRoundTripError extends Error {
  constructor(detail: string) {
    super(`manifest round-trip failed: ${detail}`);
    this.name = 'ManifestRoundTripError';
  }
}

/** Persisted manifest size disagrees with the builder byte length (storage/registration divergence). */
export class ManifestSizeMismatchError extends Error {
  constructor(detail: string) {
    super(`manifest size mismatch: ${detail}`);
    this.name = 'ManifestSizeMismatchError';
  }
}

/** The pyramid re-derived from persisted bytes disagrees with the registered TILE_PYRAMID asset. */
export class PyramidAggregateMismatchError extends Error {
  constructor(detail: string) {
    super(`pyramid aggregate mismatch: ${detail}`);
    this.name = 'PyramidAggregateMismatchError';
  }
}

/** The registered non-manifest asset roles violate a pre-seal invariant. */
export class AssetRoleInvariantError extends Error {
  constructor(detail: string) {
    super(`asset-role invariant violated: ${detail}`);
    this.name = 'AssetRoleInvariantError';
  }
}

/** The exactly-one-canonical-MANIFEST invariant was violated inside the seal transaction. */
export class ManifestInvariantError extends Error {
  constructor(detail: string) {
    super(`manifest invariant violated: ${detail}`);
    this.name = 'ManifestInvariantError';
  }
}

export interface SealInput {
  jobId: string;
  workerId: string;
  generationId: string;
  labId: string;
  slideId: string;
  ingestionId: string;
  sourceObjectKey: string;
  sourceChecksum: string;
  result: TilingResult;
  config: TilingConfig;
}

export interface SealResult {
  generationId: string;
  manifestChecksum: string;
  manifestKey: string;
  manifestSizeBytes: number;
}

interface PersistedAsset {
  role: string;
  storageKey: string;
  checksum: string | null;
  sizeBytes: number | null;
}

const OPTIONAL_ROLES = ['LABEL', 'MACRO', 'THUMBNAIL'];
const KNOWN_ROLES = ['DZI_DESCRIPTOR', 'TILE_PYRAMID', ...OPTIONAL_ROLES];

/**
 * Program 5A · P5-3B.2B — the GenerationSealer.
 *
 * Turns an UNSEALED PROCESSING generation into a SEALED, QC_PENDING (unverified) generation, and completes
 * the owning job. Heavy integrity work (digesting persisted bytes, building + persisting + round-trip
 * proving the canonical manifest) happens BEFORE the database transaction; the single lease-guarded seal
 * transaction performs only state validation + atomic mutation. It NEVER verifies, sets verified=true,
 * publishes, or advances beyond QC_PENDING — that is B.3+. Independent of engine execution: the manifest's
 * per-level integrity is re-derived from persisted storage, never from the engine's temp output.
 */
@Injectable()
export class GenerationSealer {
  private readonly logger = new Logger(GenerationSealer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lease: JobLeaseService,
    @Inject(DERIVATIVE_OBJECT_STORE) private readonly store: DerivativeObjectStore,
  ) {}

  async seal(input: SealInput): Promise<SealResult> {
    const prefix = generationPrefix(input.labId, input.slideId, input.generationId);
    const manifestKey = generationManifestKey(prefix);

    // ── Phase A: construct the manifest from PERSISTED state (no DB writes) ──────────────────────────
    const assets = await this.loadPersistedAssets(input.generationId);
    this.assertAssetRoleInvariants(assets); // Refinement 3 — re-verify roles at the last irreversible gate

    const pyramidAsset = assets.find((a) => a.role === 'TILE_PYRAMID')!; // guaranteed by the invariant check
    const pyr = await digestPyramid(this.store, generationPyramidPrefix(prefix), input.result.structure.levels);
    if (pyramidAsset.sizeBytes == null || pyr.aggregateBytes !== pyramidAsset.sizeBytes) {
      throw new PyramidAggregateMismatchError(
        `persisted pyramid ${pyr.aggregateBytes}B/${pyr.aggregateObjects} objects vs registered ${pyramidAsset.sizeBytes}B`,
      );
    }

    const manifestAssets: ManifestAsset[] = assets.map((a) => {
      if (a.sizeBytes == null) throw new AssetRoleInvariantError(`asset ${a.role} has null sizeBytes`);
      return a.role === 'TILE_PYRAMID'
        ? { role: a.role, storageKey: a.storageKey, checksum: null, sizeBytes: a.sizeBytes, objectCount: pyr.aggregateObjects }
        : { role: a.role, storageKey: a.storageKey, checksum: a.checksum, sizeBytes: a.sizeBytes };
    });

    const built = buildManifest(this.toManifestInput(input, manifestAssets, pyr.levels));

    // ── Phase B: persist immutably + prove the round-trip (bytes → storage → bytes) ─────────────────
    await this.storeManifestIdempotent(manifestKey, built.bytes);
    const persisted = await this.readAll(this.store.openReadStream(manifestKey));
    if (!persisted.equals(built.bytes)) {
      throw new ManifestRoundTripError(`persisted manifest at ${manifestKey} differs from builder output`);
    }
    if (this.sha256(persisted) !== built.checksum) {
      throw new ManifestRoundTripError('persisted manifest checksum ≠ builder checksum');
    }

    // ── Phase C: the single lease-guarded seal transaction (no object I/O under the row lock) ───────
    if (!(await this.lease.renew(input.jobId, input.workerId))) throw new SealLeaseLostError('seal (pre-transaction renew)');
    await this.sealTransaction(input, manifestKey, built.bytes.length, built.checksum, persisted.length);

    this.logger.log(`sealed generation ${input.generationId} → QC_PENDING (manifest ${built.checksum})`);
    return { generationId: input.generationId, manifestChecksum: built.checksum, manifestKey, manifestSizeBytes: built.bytes.length };
  }

  private async sealTransaction(
    input: SealInput,
    manifestKey: string,
    manifestBytes: number,
    manifestChecksum: string,
    persistedSize: number,
  ): Promise<void> {
    // Refinement 1 — persisted object size, the manifest we will register, and the builder byte length
    // must all agree BEFORE the generation becomes immutable.
    if (persistedSize !== manifestBytes) {
      throw new ManifestSizeMismatchError(`persisted ${persistedSize}B ≠ builder ${manifestBytes}B`);
    }

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();

      // Ownership guard (OD-6 in-tx brace). Distinguish lost-ownership from illegal state (OD-8).
      const jobRows = await tx.$queryRaw<{ status: string; workerId: string | null; leaseExpiresAt: Date | null }[]>`
        SELECT status, "workerId", "leaseExpiresAt" FROM "SlideProcessingJob" WHERE id = ${input.jobId} FOR UPDATE
      `;
      const jr = jobRows[0];
      if (!jr) throw new GenerationStateError(`job ${input.jobId} not found`);
      if (jr.status !== 'RUNNING' || jr.workerId !== input.workerId || !(jr.leaseExpiresAt && jr.leaseExpiresAt > now)) {
        throw new SealLeaseLostError('seal (transaction ownership guard)');
      }

      // Generation precondition (OD-8): already-sealed vs illegal-state are distinct conditions.
      const genRows = await tx.$queryRaw<{ status: string; sealed: boolean }[]>`
        SELECT status, sealed FROM "DerivativeGeneration" WHERE id = ${input.generationId} FOR UPDATE
      `;
      const gr = genRows[0];
      if (!gr) throw new GenerationStateError(`generation ${input.generationId} not found`);
      if (gr.sealed) throw new GenerationAlreadySealedError(input.generationId);
      if (gr.status !== 'PROCESSING') throw new GenerationStateError(`generation ${input.generationId} is ${gr.status}, expected PROCESSING`);

      // Refinement 2 side-effect + required invariant: exactly one canonical MANIFEST asset.
      const before = await tx.$queryRaw<{ n: number }[]>`
        SELECT COUNT(*)::int AS n FROM "SlideAsset" WHERE "generationId" = ${input.generationId} AND role = 'MANIFEST'::"SlideAssetRole"
      `;
      if (before[0].n !== 0) throw new ManifestInvariantError(`expected 0 pre-existing MANIFEST assets, found ${before[0].n}`);

      await tx.$executeRaw`
        INSERT INTO "SlideAsset" (id, "labId", "generationId", role, "storageKey", checksum, "sizeBytes", "createdAt")
        VALUES (${randomUUID()}, ${input.labId}, ${input.generationId}, 'MANIFEST'::"SlideAssetRole", ${manifestKey}, ${manifestChecksum}, ${manifestBytes}, ${now})
      `;

      const after = await tx.$queryRaw<{ n: number }[]>`
        SELECT COUNT(*)::int AS n FROM "SlideAsset" WHERE "generationId" = ${input.generationId} AND role = 'MANIFEST'::"SlideAssetRole"
      `;
      if (after[0].n !== 1) throw new ManifestInvariantError(`expected exactly 1 MANIFEST asset after insert, found ${after[0].n}`);

      // Seal: PROCESSING → QC_PENDING, sealed=true, checksum written. verified stays false; publishedAt untouched.
      const sealed = await tx.$executeRaw`
        UPDATE "DerivativeGeneration"
        SET "derivativeManifestChecksum" = ${manifestChecksum}, status = 'QC_PENDING'::"GenerationStatus",
            sealed = true, "sealedAt" = ${now}, "updatedAt" = ${now}
        WHERE id = ${input.generationId} AND status = 'PROCESSING'::"GenerationStatus" AND sealed = false
      `;
      if (sealed !== 1) throw new GenerationStateError(`seal update affected ${sealed} rows (expected 1)`);

      // Complete the job. Historical lease fields (workerId/leaseExpiresAt) are preserved (OD-7).
      const done = await tx.$executeRaw`
        UPDATE "SlideProcessingJob"
        SET status = 'SUCCEEDED'::"ProcessingJobStatus", "finishedAt" = ${now}, "updatedAt" = ${now}
        WHERE id = ${input.jobId} AND "workerId" = ${input.workerId} AND status = 'RUNNING'::"ProcessingJobStatus"
      `;
      if (done !== 1) throw new SealLeaseLostError('seal (job completion)');
    });
  }

  private async loadPersistedAssets(generationId: string): Promise<PersistedAsset[]> {
    return this.prisma.$queryRaw<PersistedAsset[]>`
      SELECT role::text AS role, "storageKey", checksum, "sizeBytes"
      FROM "SlideAsset"
      WHERE "generationId" = ${generationId} AND role <> 'MANIFEST'::"SlideAssetRole"
      ORDER BY role, "storageKey"
    `;
  }

  /** Refinement 3 — exactly one DZI_DESCRIPTOR + TILE_PYRAMID, ≤1 of each optional, no duplicate/unknown roles. */
  private assertAssetRoleInvariants(assets: PersistedAsset[]): void {
    const counts = new Map<string, number>();
    for (const a of assets) counts.set(a.role, (counts.get(a.role) ?? 0) + 1);
    for (const role of ['DZI_DESCRIPTOR', 'TILE_PYRAMID']) {
      const n = counts.get(role) ?? 0;
      if (n !== 1) throw new AssetRoleInvariantError(`expected exactly 1 ${role}, found ${n}`);
    }
    for (const role of OPTIONAL_ROLES) {
      const n = counts.get(role) ?? 0;
      if (n > 1) throw new AssetRoleInvariantError(`expected at most 1 ${role}, found ${n}`);
    }
    for (const role of counts.keys()) {
      if (!KNOWN_ROLES.includes(role)) throw new AssetRoleInvariantError(`unexpected asset role ${role}`);
    }
  }

  /** Write the manifest write-once; on a same-checksum replay treat as idempotent, on a different one fail. */
  private async storeManifestIdempotent(key: string, bytes: Buffer): Promise<void> {
    try {
      await this.store.putImmutableObject(key, Readable.from(bytes));
    } catch (e) {
      if (!(e instanceof DerivativeWriteOnceError)) throw e;
      const existing = await this.readAll(this.store.openReadStream(key));
      if (!existing.equals(bytes)) throw new ManifestRoundTripError(`existing manifest at ${key} differs from intended bytes`);
    }
  }

  private toManifestInput(input: SealInput, assets: ManifestAsset[], levels: ManifestInput['levels']): ManifestInput {
    const c = input.config;
    const processingConfig: ManifestProcessingConfig = {
      configVersion: c.configVersion,
      tileSize: c.tileSize,
      overlap: c.overlap,
      tileFormat: c.tileFormat,
      quality: c.quality,
      pyramidLayout: c.pyramidLayout,
      associatedImages: c.associatedImages,
      thumbnail: c.thumbnail,
    };
    const s = input.result.structure;
    const structure: ManifestStructure = {
      tiledWidth: s.tiledWidth,
      tiledHeight: s.tiledHeight,
      tileSize: s.tileSize,
      overlap: s.overlap,
      tileFormat: s.tileFormat,
      levelCount: s.levelCount,
    };
    return {
      generationId: input.generationId,
      slideId: input.slideId,
      ingestionId: input.ingestionId,
      sourceObjectKey: input.sourceObjectKey,
      sourceChecksum: input.sourceChecksum,
      engineName: input.result.engine.name,
      engineVersion: input.result.engine.version,
      processingConfig,
      structure,
      acquisition: input.result.acquisition, // OD-1 — this generation's own observed acquisition
      assets,
      levels,
    };
  }

  private sha256(buf: Buffer): string {
    return createHash('sha256').update(buf).digest('hex');
  }

  private readAll(stream: NodeJS.ReadableStream): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (d) => chunks.push(d as Buffer));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }
}
