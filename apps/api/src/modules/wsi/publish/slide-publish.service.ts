import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuditRecorder } from '../../audit/audit-recorder.service';
import { PublicationResult, SlidePublicationService } from '../processing/slide-publication.service';

/**
 * Program 5B · P5-6.3 — the HTTP-facing publication ENVELOPE around the FROZEN SlidePublicationService.
 *
 * Owns exactly three things and NO publication semantics:
 *   1. a fail-closed tenant/path ownership gate (the generation must belong to the caller's lab AND the
 *      path slide) — required because SlidePublicationService.publish() is tenancy-trusting (it derives the
 *      slide from the generation and never checks labId), and it is now reachable from an HTTP principal;
 *   2. delegation to the frozen publication service (which alone owns locking, supersession, provenance,
 *      idempotency, and every state transition);
 *   3. a best-effort cross-cutting security/activity audit on a NEWLY-APPLIED publication only.
 *
 * The gate runs BEFORE delegation, so a cross-lab / wrong-slide / unknown generation never reaches the
 * frozen transaction. The authoritative publication record remains the append-only GenerationPublication
 * rows written transactionally inside publish(); this audit event is the supplementary security record.
 */
@Injectable()
export class SlidePublishService {
  private readonly logger = new Logger(SlidePublishService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly publication: SlidePublicationService,
    private readonly audit: AuditRecorder,
  ) {}

  async publish(labId: string, slideId: string, generationId: string, actorUserId: string): Promise<PublicationResult> {
    // 1. Fail-closed ownership gate — proves generation.id = generationId ∧ generation.slideId = slideId ∧
    //    generation.labId = labId before the frozen service is ever called. Any miss → 404 (no leak).
    const owned = await this.prisma.derivativeGeneration.findFirst({
      where: { id: generationId, slideId, labId },
      select: { id: true },
    });
    if (!owned) throw new NotFoundException('generation not found');

    // 2. Delegate to the frozen publication service — the sole owner of publication semantics.
    const result = await this.publication.publish(generationId, actorUserId);

    // 3. Cross-cutting security/activity audit — ONLY on a real, newly-applied transition (SUCCESS-only,
    //    D-C63). Best-effort: recordEntityUpdated never throws, so audit can't break the publication.
    //    Field-NAMES only (no publication/superseded ids or values) — the domain provenance holds the detail.
    if (result.outcome === 'PUBLISHED' && result.applied) {
      await this.audit.recordEntityUpdated({
        resource: { type: 'DerivativeGeneration', id: generationId, labId },
        changedFields: ['status'],
        producerModule: 'wsi',
      });
    }

    return result;
  }
}
