import { Buffer } from 'node:buffer';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { AuditRecorder } from '../../audit/audit-recorder.service';
import {
  GENERATION_LIST_CAP,
  GenerationEvidence,
  GenerationReviewRow,
  GenerationVerificationSummary,
  PUBLICATION_PAGE_DEFAULT,
  PUBLICATION_PAGE_MAX,
  PublicationHistoryQueryDto,
  PublicationIntegrity,
  SlidePublicationHistory,
  SlideReviewSummary,
  VERIFICATION_HISTORY_CAP,
  VerificationReason,
} from './dto/slide-review.dto';

/**
 * Program 5B · P5-6.1 — the read-only Clinical Review projection.
 *
 * READS ONLY. Three methods project the FROZEN slide/generation/verification/publication model for a
 * reviewer: (1) a per-slide generation summary, (2) full QC/verification evidence for one generation,
 * (3) keyset-paginated publication history. It never writes, never opens a transaction, never issues a
 * delivery capability, and never returns a `storageKey` (no unpublished-pixel path). Cross-entity
 * divergence is REPORTED as data (`publicationIntegrity`), never converted into a 500 — the frozen
 * delivery resolver keeps its stricter throw-on-divergence behavior untouched (D-D).
 *
 * Tenancy: every query is filtered by the authenticated principal's `labId` (passed by the controller from
 * the JWT, never the body), so cross-lab rows are invisible and collapse to a deterministic 404.
 *
 * Audit (D-C): each route is a single-subject, case-specific PHI read → one best-effort `recordPhiRead`
 * with an internally-derived patientRef. `accessSurface` is the frozen-enum value `'slide'` (per-route
 * distinction is carried by `resource.type`/`id`); an unknown surface would be rejected by the frozen
 * Program 2 audit contract, so it is NOT invented here.
 */
@Injectable()
export class SlideReviewService {
  private readonly logger = new Logger(SlideReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditRecorder,
  ) {}

  /** R1 — per-slide review summary: every generation + its latest verdict + the live pointer/integrity. */
  async getReviewSummary(labId: string, slideId: string): Promise<SlideReviewSummary> {
    const slide = await this.prisma.digitalSlide.findFirst({
      where: { id: slideId, labId },
      select: {
        id: true,
        availabilityStatus: true,
        publishedGenerationId: true,
        publishedAt: true,
        record: { select: { patient: { select: { id: true } } } },
      },
    });
    if (!slide) throw new NotFoundException('slide not found');

    const rows = await this.prisma.derivativeGeneration.findMany({
      where: { slideId, labId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: GENERATION_LIST_CAP + 1, // +1 sentinel → detect truncation without a second count
      select: {
        id: true, status: true, sealed: true, verified: true, sealedAt: true, verifiedAt: true,
        publishedAt: true, supersededAt: true, createdAt: true, tileSourceType: true,
        tiledWidth: true, tiledHeight: true, levelCount: true,
      },
    });
    const generationsTruncated = rows.length > GENERATION_LIST_CAP;
    const gens = rows.slice(0, GENERATION_LIST_CAP);

    // Latest verification per generation in ONE query, reduced newest-first in memory.
    const genIds = gens.map((g) => g.id);
    const verifs = genIds.length
      ? await this.prisma.generationVerification.findMany({
          where: { generationId: { in: genIds }, labId },
          orderBy: [{ verifiedAt: 'desc' }, { id: 'desc' }],
          select: { generationId: true, outcome: true, verifiedAt: true, reasons: true },
        })
      : [];
    const latestByGen = new Map<string, (typeof verifs)[number]>();
    for (const v of verifs) if (!latestByGen.has(v.generationId)) latestByGen.set(v.generationId, v);

    const publicationIntegrity = await this.computeIntegrity(labId, slideId, slide.publishedGenerationId);

    await this.auditRead(slide.record?.patient?.id, 'DigitalSlide', slideId, labId);

    const generations: GenerationReviewRow[] = gens.map((g) => {
      const v = latestByGen.get(g.id);
      const latestVerification: GenerationVerificationSummary | null = v
        ? { outcome: v.outcome, verifiedAt: v.verifiedAt.toISOString(), reasonCount: countReasons(v.reasons) }
        : null;
      return {
        generationId: g.id,
        status: g.status,
        sealed: g.sealed,
        verified: g.verified,
        sealedAt: iso(g.sealedAt),
        verifiedAt: iso(g.verifiedAt),
        publishedAt: iso(g.publishedAt),
        supersededAt: iso(g.supersededAt),
        createdAt: g.createdAt.toISOString(),
        tileSourceType: g.tileSourceType,
        tiledWidth: g.tiledWidth,
        tiledHeight: g.tiledHeight,
        levelCount: g.levelCount,
        isCurrentPublished: g.id === slide.publishedGenerationId,
        latestVerification,
      };
    });

    return {
      slideId: slide.id,
      availabilityStatus: slide.availabilityStatus,
      currentPublishedGenerationId: slide.publishedGenerationId,
      publishedAt: iso(slide.publishedAt),
      publicationIntegrity,
      generations,
      generationsTruncated,
    };
  }

  /** R2 — full QC/verification evidence for ONE generation of a slide. */
  async getGenerationEvidence(labId: string, slideId: string, generationId: string): Promise<GenerationEvidence> {
    const slide = await this.prisma.digitalSlide.findFirst({
      where: { id: slideId, labId },
      select: { id: true, record: { select: { patient: { select: { id: true } } } } },
    });
    if (!slide) throw new NotFoundException('slide not found');

    // Bound the generation to THIS slide + lab — a cross-slide/cross-lab generation is a 404, not a leak.
    const g = await this.prisma.derivativeGeneration.findFirst({
      where: { id: generationId, slideId, labId },
      select: {
        id: true, slideId: true, status: true, sealed: true, verified: true, sealedAt: true, verifiedAt: true,
        publishedAt: true, supersededAt: true, createdAt: true, tileSourceType: true, tiledWidth: true,
        tiledHeight: true, tileSize: true, levelCount: true, derivativeManifestChecksum: true,
      },
    });
    if (!g) throw new NotFoundException('generation not found');

    // Asset METADATA only — storageKey is deliberately never selected (delivery-internal; D-F).
    const assets = await this.prisma.slideAsset.findMany({
      where: { generationId, labId },
      orderBy: [{ role: 'asc' }, { id: 'asc' }],
      select: { role: true, checksum: true, sizeBytes: true, purgedAt: true },
    });

    const verifRows = await this.prisma.generationVerification.findMany({
      where: { generationId, labId },
      orderBy: [{ verifiedAt: 'desc' }, { id: 'desc' }],
      take: VERIFICATION_HISTORY_CAP + 1,
      select: { id: true, outcome: true, reasons: true, manifestChecksum: true, verifierVersion: true, verifiedAt: true },
    });
    const verificationsTruncated = verifRows.length > VERIFICATION_HISTORY_CAP;
    const verifs = verifRows.slice(0, VERIFICATION_HISTORY_CAP);
    if (verificationsTruncated) {
      this.logger.warn(`generation ${generationId}: verification history exceeds ${VERIFICATION_HISTORY_CAP}; response truncated`);
    }

    const pubs = await this.prisma.generationPublication.findMany({
      where: { generationId, labId },
      orderBy: [{ at: 'desc' }, { id: 'desc' }],
      select: { publicationEventId: true, action: true, actorUserId: true, at: true },
    });

    await this.auditRead(slide.record?.patient?.id, 'DerivativeGeneration', generationId, labId);

    return {
      generationId: g.id,
      slideId: g.slideId,
      status: g.status,
      sealed: g.sealed,
      verified: g.verified,
      sealedAt: iso(g.sealedAt),
      verifiedAt: iso(g.verifiedAt),
      publishedAt: iso(g.publishedAt),
      supersededAt: iso(g.supersededAt),
      createdAt: g.createdAt.toISOString(),
      tileSourceType: g.tileSourceType,
      tiledWidth: g.tiledWidth,
      tiledHeight: g.tiledHeight,
      tileSize: g.tileSize,
      levelCount: g.levelCount,
      derivativeManifestChecksum: g.derivativeManifestChecksum,
      assets: assets.map((a) => ({ role: a.role, checksum: a.checksum, sizeBytes: a.sizeBytes, purgedAt: iso(a.purgedAt) })),
      verifications: verifs.map((v) => ({
        verificationId: v.id,
        outcome: v.outcome,
        reasons: coerceReasons(v.reasons),
        manifestChecksum: v.manifestChecksum,
        verifierVersion: v.verifierVersion,
        verifiedAt: v.verifiedAt.toISOString(),
      })),
      verificationsTruncated,
      publicationEvents: pubs.map((p) => ({
        publicationEventId: p.publicationEventId,
        action: p.action,
        actorUserId: p.actorUserId,
        at: p.at.toISOString(),
      })),
    };
  }

  /** R3 — keyset-paginated publication history for a slide (newest-first), events grouped by publicationEventId. */
  async getPublicationHistory(labId: string, slideId: string, query: PublicationHistoryQueryDto): Promise<SlidePublicationHistory> {
    const slide = await this.prisma.digitalSlide.findFirst({
      where: { id: slideId, labId },
      select: { id: true, publishedGenerationId: true, record: { select: { patient: { select: { id: true } } } } },
    });
    if (!slide) throw new NotFoundException('slide not found');

    const limit = clamp(query.limit ?? PUBLICATION_PAGE_DEFAULT, 1, PUBLICATION_PAGE_MAX);
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;

    // Every publication event has exactly ONE PUBLISHED row (a SUPERSEDED row, if any, shares its
    // publicationEventId) — so the PUBLISHED rows are the stable per-event anchors for keyset paging.
    const anchors = await this.prisma.generationPublication.findMany({
      where: {
        slideId,
        labId,
        action: 'PUBLISHED',
        ...(cursor ? { OR: [{ at: { lt: cursor.at } }, { at: cursor.at, id: { lt: cursor.id } }] } : {}),
      },
      orderBy: [{ at: 'desc' }, { id: 'desc' }],
      take: limit + 1, // +1 sentinel → hasMore
      select: { id: true, publicationEventId: true, at: true, generationId: true, actorUserId: true },
    });
    const hasMore = anchors.length > limit;
    const page = anchors.slice(0, limit);

    const eventIds = page.map((a) => a.publicationEventId);
    const supersededRows = eventIds.length
      ? await this.prisma.generationPublication.findMany({
          where: { publicationEventId: { in: eventIds }, labId, action: 'SUPERSEDED' },
          select: { publicationEventId: true, generationId: true },
        })
      : [];
    const supByEvent = new Map(supersededRows.map((s) => [s.publicationEventId, s.generationId]));

    await this.auditRead(slide.record?.patient?.id, 'DigitalSlide', slideId, labId);

    const last = page[page.length - 1];
    return {
      slideId: slide.id,
      currentPublishedGenerationId: slide.publishedGenerationId,
      events: page.map((a) => ({
        publicationEventId: a.publicationEventId,
        at: a.at.toISOString(),
        publishedGenerationId: a.generationId,
        supersededGenerationId: supByEvent.get(a.publicationEventId) ?? null,
        actorUserId: a.actorUserId,
      })),
      nextCursor: hasMore && last ? encodeCursor({ at: last.at, id: last.id }) : null,
    };
  }

  /**
   * Observed integrity of the slide→published-generation pointer. Reported as data, NEVER thrown: the
   * review surface is exactly where a human should SEE a divergence. (The delivery resolver keeps its
   * stricter throw-on-divergence behavior; this does not relax it.)
   */
  private async computeIntegrity(labId: string, slideId: string, publishedGenerationId: string | null): Promise<PublicationIntegrity> {
    if (!publishedGenerationId) return 'OK';
    const g = await this.prisma.derivativeGeneration.findFirst({
      where: { id: publishedGenerationId, labId },
      select: { slideId: true, status: true },
    });
    if (!g || g.slideId !== slideId || g.status !== 'PUBLISHED') return 'DIVERGENT';
    return 'OK';
  }

  /** Single-subject PHI read audit (best-effort; the recorder never throws). No-op without a patientId. */
  private async auditRead(patientId: string | undefined, resourceType: string, resourceId: string, labId: string): Promise<void> {
    if (!patientId) return;
    await this.audit.recordPhiRead({
      patientId,
      accessSurface: 'slide',
      accessMode: 'view',
      producerModule: 'wsi',
      resource: { type: resourceType, id: resourceId, labId },
    });
  }
}

// ── pure helpers ─────────────────────────────────────────────────────────────
function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}
function countReasons(reasons: Prisma.JsonValue): number {
  return Array.isArray(reasons) ? reasons.length : 0;
}
function coerceReasons(reasons: Prisma.JsonValue): VerificationReason[] {
  if (!Array.isArray(reasons)) return [];
  return reasons.map((r) => {
    const o = (r ?? {}) as Record<string, unknown>;
    return { code: String(o.code ?? ''), detail: String(o.detail ?? '') };
  });
}
function encodeCursor(c: { at: Date; id: string }): string {
  return Buffer.from(JSON.stringify({ at: c.at.toISOString(), id: c.id }), 'utf8').toString('base64url');
}
function decodeCursor(raw: string): { at: Date; id: string } {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as { at?: unknown; id?: unknown };
    const at = new Date(String(parsed.at));
    if (Number.isNaN(at.getTime()) || typeof parsed.id !== 'string' || !parsed.id) throw new Error('malformed');
    return { at, id: parsed.id };
  } catch {
    throw new BadRequestException('invalid cursor');
  }
}
