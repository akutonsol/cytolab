import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

/**
 * Program 5A · P5-4b — the publication applier.
 *
 * Promotes ONE verified (READY) generation to the authoritative/live generation for its slide, atomically
 * superseding whatever was published before and repointing the slide, and appends append-only publication
 * provenance (a PUBLISHED row, plus a SUPERSEDED row when a prior generation is replaced) sharing one
 * publicationEventId. Per-slide serialization is the DigitalSlide row lock. Demote-before-promote ordering
 * respects the (slideId) WHERE status='PUBLISHED' partial-unique index (not deferred). Publication mutates
 * NO sealing/verification state and performs NO delivery/scheduling/notification.
 */

export type PublicationResult =
  | { outcome: 'PUBLISHED'; applied: true; publicationEventId: string; supersededGenerationId: string | null }
  | { outcome: 'ALREADY_PUBLISHED'; applied: false }
  | { outcome: 'NOT_PUBLISHABLE'; generationStatus: string };

/** The persisted publication state is internally inconsistent (slide pointer / availability / generation status disagree). */
export class PublicationStateError extends Error {
  constructor(detail: string) {
    super(`publication-state divergence: ${detail}`);
    this.name = 'PublicationStateError';
  }
}

/** A READY generation violates its own invariant (not sealed / not verified) — illegal, not merely un-publishable. */
export class IllegalPublicationTargetError extends Error {
  constructor(detail: string) {
    super(`illegal publication target: ${detail}`);
    this.name = 'IllegalPublicationTargetError';
  }
}

@Injectable()
export class SlidePublicationService {
  private readonly logger = new Logger(SlidePublicationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async publish(generationId: string, actorUserId: string | null): Promise<PublicationResult> {
    return this.prisma.$transaction(async (tx) => {
      // slideId is immutable for a generation — read it unlocked to establish a stable slide→generation lock order.
      const slideIdRows = await tx.$queryRaw<{ slideId: string }[]>`SELECT "slideId" FROM "DerivativeGeneration" WHERE id = ${generationId}`;
      if (!slideIdRows[0]) throw new Error(`generation ${generationId} not found`);
      const slideId = slideIdRows[0].slideId;

      // Lock the SLIDE first (the per-slide publication-exclusivity primitive), then the target generation.
      const slideRows = await tx.$queryRaw<{ publishedGenerationId: string | null; availabilityStatus: string | null }[]>`
        SELECT "publishedGenerationId", "availabilityStatus"::text AS "availabilityStatus" FROM "DigitalSlide" WHERE id = ${slideId} FOR UPDATE
      `;
      if (!slideRows[0]) throw new Error(`slide ${slideId} not found`);
      const slide = slideRows[0];

      const genRows = await tx.$queryRaw<{ labId: string; status: string; sealed: boolean; verified: boolean }[]>`
        SELECT "labId", status, sealed, verified FROM "DerivativeGeneration" WHERE id = ${generationId} FOR UPDATE
      `;
      const g = genRows[0]!;
      const now = new Date();
      const pointsToTarget = slide.publishedGenerationId === generationId;

      // Divergence-aware idempotency + integrity.
      if (g.status === 'PUBLISHED') {
        if (pointsToTarget && slide.availabilityStatus === 'PUBLISHED') return { outcome: 'ALREADY_PUBLISHED', applied: false };
        throw new PublicationStateError(
          `generation ${generationId} is PUBLISHED but slide ${slideId} diverges (pointer=${slide.publishedGenerationId}, availability=${slide.availabilityStatus})`,
        );
      }
      if (pointsToTarget) {
        throw new PublicationStateError(`slide ${slideId} points to generation ${generationId} but its status is ${g.status}, not PUBLISHED`);
      }
      if (g.status !== 'READY') return { outcome: 'NOT_PUBLISHABLE', generationStatus: g.status };
      if (!g.sealed || !g.verified) {
        throw new IllegalPublicationTargetError(`generation ${generationId} is READY but sealed=${g.sealed} verified=${g.verified}`);
      }

      // 1) Demote the current published generation, if any (RETURNING its id for provenance). At most one
      //    exists (partial-unique index); this MUST run before the promote so the index is never violated.
      const demoted = await tx.$queryRaw<{ id: string }[]>`
        UPDATE "DerivativeGeneration" SET status = 'SUPERSEDED'::"GenerationStatus", "supersededAt" = ${now}, "updatedAt" = ${now}
        WHERE "slideId" = ${slideId} AND status = 'PUBLISHED'::"GenerationStatus" RETURNING id
      `;
      const supersededGenerationId = demoted[0]?.id ?? null;

      // 2) Promote the target (guarded).
      const promoted = await tx.$executeRaw`
        UPDATE "DerivativeGeneration" SET status = 'PUBLISHED'::"GenerationStatus", "publishedAt" = ${now}, "updatedAt" = ${now}
        WHERE id = ${generationId} AND status = 'READY'::"GenerationStatus"
      `;
      if (promoted !== 1) throw new Error(`promotion affected ${promoted} rows (expected 1)`);

      // 3) Repoint the slide.
      await tx.$executeRaw`
        UPDATE "DigitalSlide"
        SET "publishedGenerationId" = ${generationId}, "availabilityStatus" = 'PUBLISHED'::"SlideAvailabilityStatus",
            "publishedAt" = ${now}, "publishedById" = ${actorUserId}, "updatedAt" = ${now}
        WHERE id = ${slideId}
      `;

      // 4) Append provenance — every row of THIS publication shares one publicationEventId + timestamp.
      const publicationEventId = randomUUID();
      if (supersededGenerationId) {
        await tx.$executeRaw`
          INSERT INTO "GenerationPublication" (id, "publicationEventId", "labId", "slideId", "generationId", action, "actorUserId", at, "createdAt")
          VALUES (${randomUUID()}, ${publicationEventId}, ${g.labId}, ${slideId}, ${supersededGenerationId}, 'SUPERSEDED'::"PublicationAction", ${actorUserId}, ${now}, ${now})
        `;
      }
      await tx.$executeRaw`
        INSERT INTO "GenerationPublication" (id, "publicationEventId", "labId", "slideId", "generationId", action, "actorUserId", at, "createdAt")
        VALUES (${randomUUID()}, ${publicationEventId}, ${g.labId}, ${slideId}, ${generationId}, 'PUBLISHED'::"PublicationAction", ${actorUserId}, ${now}, ${now})
      `;

      this.logger.log(`published generation ${generationId} for slide ${slideId}${supersededGenerationId ? ` (superseded ${supersededGenerationId})` : ''}`);
      return { outcome: 'PUBLISHED', applied: true, publicationEventId, supersededGenerationId };
    });
  }
}
