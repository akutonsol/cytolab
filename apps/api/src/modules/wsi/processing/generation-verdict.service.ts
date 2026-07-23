import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { GenerationVerifier, VerificationOutcome, VERIFICATION_VERSION } from './generation-verifier';
import { buildCertifiedSurface, fingerprintCertifiedSurface } from './verification-fingerprint';

/**
 * Program 5A · P5-3B.3B-ii-b — the verdict applier.
 *
 * Runs the FROZEN GenerationVerifier OUTSIDE any transaction, then in one short transaction re-proves the
 * certified DB state is unchanged (via the shared ii-a fingerprint) and atomically writes a
 * GenerationVerification row + transitions QC_PENDING → READY | QC_FAILED. No object-store I/O under the
 * lock. A transient (RETRYABLE) result or a stale fingerprint NEVER mutates and NEVER marks QC_FAILED.
 * Terminal generations are idempotent (no second provenance row, no READY ↔ QC_FAILED flip). This service
 * introduces NO publication, scheduling, reprocessing, or forced re-verification.
 */

export type VerdictResult =
  | { outcome: 'READY'; applied: boolean; verificationId?: string }
  | { outcome: 'QC_FAILED'; applied: boolean; verificationId?: string }
  | { outcome: 'RETRYABLE'; cause: string } // verifier hit a transient storage fault — no mutation
  | { outcome: 'STALE' } // certified state changed between compute and commit — retry later, no mutation
  | { outcome: 'NOT_VERIFIABLE'; generationStatus: string }; // neither QC_PENDING nor terminal

/** A generation is in an illegal state for a verdict (QC_PENDING but not sealed / missing manifest checksum). */
export class GenerationStateError extends Error {
  constructor(detail: string) {
    super(`illegal generation state for verdict: ${detail}`);
    this.name = 'GenerationStateError';
  }
}

interface DbSurfaceRow {
  labId: string;
  status: string;
  sealed: boolean;
  slideId: string;
  jobId: string;
  tileSourceType: string;
  derivativeManifestChecksum: string | null;
  tiledWidth: number | null;
  tiledHeight: number | null;
  tileSize: number | null;
  levelCount: number | null;
}

@Injectable()
export class GenerationVerdictService {
  private readonly logger = new Logger(GenerationVerdictService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly verifier: GenerationVerifier,
  ) {}

  /** Orchestrate: short-circuit terminals, run the verifier OUTSIDE the tx, then commit a terminal verdict. */
  async applyVerdict(generationId: string): Promise<VerdictResult> {
    const pre = await this.prisma.$queryRaw<{ status: string }[]>`
      SELECT status FROM "DerivativeGeneration" WHERE id = ${generationId}
    `;
    if (!pre[0]) throw new Error(`generation ${generationId} not found`);
    if (pre[0].status === 'READY') return { outcome: 'READY', applied: false };
    if (pre[0].status === 'QC_FAILED') return { outcome: 'QC_FAILED', applied: false };
    if (pre[0].status !== 'QC_PENDING') return { outcome: 'NOT_VERIFIABLE', generationStatus: pre[0].status };

    const outcome = await this.verifier.verify({ generationId }); // heavy, OUTSIDE the transaction
    if (outcome.status === 'RETRYABLE') return { outcome: 'RETRYABLE', cause: outcome.cause };
    return this.commitVerdict(generationId, outcome);
  }

  /**
   * The constrained compute→commit seam. Accepts ONLY a verifier-produced VerificationOutcome; for a
   * terminal outcome it INDEPENDENTLY performs every guard (FOR UPDATE lock, QC_PENDING + sealed, and a
   * fresh-DB certified-fingerprint re-check) before writing. There is no caller-controlled bypass: the
   * committed state is proven identical to the state the verifier certified, or nothing is written.
   */
  async commitVerdict(generationId: string, outcome: VerificationOutcome): Promise<VerdictResult> {
    if (outcome.status === 'RETRYABLE') return { outcome: 'RETRYABLE', cause: outcome.cause }; // never mutates

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const rows = await tx.$queryRaw<DbSurfaceRow[]>`
        SELECT "labId", status, sealed, "slideId", "jobId", "tileSourceType"::text AS "tileSourceType",
               "derivativeManifestChecksum", "tiledWidth", "tiledHeight", "tileSize", "levelCount"
        FROM "DerivativeGeneration" WHERE id = ${generationId} FOR UPDATE
      `;
      const g = rows[0];
      if (!g) throw new Error(`generation ${generationId} not found`);

      // Idempotency: a concurrent verdict already made it terminal — return that, write nothing.
      if (g.status === 'READY') return { outcome: 'READY', applied: false } as VerdictResult;
      if (g.status === 'QC_FAILED') return { outcome: 'QC_FAILED', applied: false } as VerdictResult;
      if (g.status !== 'QC_PENDING') return { outcome: 'NOT_VERIFIABLE', generationStatus: g.status } as VerdictResult;
      if (!g.sealed || g.derivativeManifestChecksum == null) {
        throw new GenerationStateError(`generation ${generationId} is QC_PENDING but not sealed / has no manifest checksum`);
      }

      // Re-prove the certified state from FRESH DB rows (DB reads only — no object store under the lock).
      const fingerprint = await this.recomputeFingerprint(tx, generationId, g);
      if (fingerprint !== outcome.certifiedState.fingerprint || g.derivativeManifestChecksum !== outcome.certifiedState.manifestChecksum) {
        return { outcome: 'STALE' } as VerdictResult; // retry later; NEVER QC_FAILED
      }

      const isPass = outcome.status === 'READY';
      const reasons = isPass ? [] : outcome.reasons;
      const verificationId = randomUUID();
      await tx.$executeRaw`
        INSERT INTO "GenerationVerification" (id, "labId", "generationId", outcome, reasons, "manifestChecksum", "verifierVersion", "verifiedAt", "createdAt")
        VALUES (${verificationId}, ${g.labId}, ${generationId}, ${isPass ? 'PASSED' : 'FAILED'}::"VerificationOutcome",
                ${JSON.stringify(reasons)}::jsonb, ${outcome.certifiedState.manifestChecksum}, ${VERIFICATION_VERSION}, ${now}, ${now})
      `;
      const affected = await tx.$executeRaw`
        UPDATE "DerivativeGeneration"
        SET status = ${isPass ? 'READY' : 'QC_FAILED'}::"GenerationStatus", verified = ${isPass}, "verifiedAt" = ${now}, "updatedAt" = ${now}
        WHERE id = ${generationId} AND status = 'QC_PENDING'::"GenerationStatus"
      `;
      if (affected !== 1) throw new Error(`verdict transition affected ${affected} rows (expected 1)`); // unreachable under FOR UPDATE

      this.logger.log(`generation ${generationId} verdict: ${isPass ? 'READY' : 'QC_FAILED'} (verification ${verificationId})`);
      return { outcome: isPass ? 'READY' : 'QC_FAILED', applied: true, verificationId } as VerdictResult;
    });
  }

  /** Rebuild the certified surface from fresh DB state (inside the tx) and hash it via the shared ii-a helper. */
  private async recomputeFingerprint(tx: Prisma.TransactionClient, generationId: string, g: DbSurfaceRow): Promise<string> {
    const jobRows = await tx.$queryRaw<{ ingestionId: string }[]>`SELECT "ingestionId" FROM "SlideProcessingJob" WHERE id = ${g.jobId}`;
    const ingestionId = jobRows[0]?.ingestionId ?? '';
    const ingRows = await tx.$queryRaw<{ sourceObjectKey: string | null; sourceChecksum: string | null }[]>`
      SELECT "sourceObjectKey", "sourceChecksum" FROM "SlideIngestion" WHERE id = ${ingestionId}
    `;
    const assets = await tx.$queryRaw<{ role: string; storageKey: string; checksum: string | null; sizeBytes: number | null }[]>`
      SELECT role::text AS role, "storageKey", checksum, "sizeBytes" FROM "SlideAsset" WHERE "generationId" = ${generationId} ORDER BY role, "storageKey"
    `;
    const surface = buildCertifiedSurface(
      {
        generationId,
        slideId: g.slideId,
        jobId: g.jobId,
        ingestionId,
        sealed: g.sealed,
        tileSourceType: g.tileSourceType,
        derivativeManifestChecksum: g.derivativeManifestChecksum,
        tiledWidth: g.tiledWidth,
        tiledHeight: g.tiledHeight,
        tileSize: g.tileSize,
        levelCount: g.levelCount,
        sourceObjectKey: ingRows[0]?.sourceObjectKey ?? null,
        sourceChecksum: ingRows[0]?.sourceChecksum ?? null,
      },
      assets,
    );
    return fingerprintCertifiedSurface(surface);
  }
}
