import { Injectable } from '@nestjs/common';
import { Prisma, type IngestionDiscoveryStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { tenantCreate } from '../../../common/tenancy/tenancy.extension';

/**
 * Program 5B · B1 — pre-ingestion intake persistence. An `IngestionDiscovery` can exist WITHOUT a
 * DigitalSlide/record/specimen association (truthful DISCOVERED/UNMATCHED/AMBIGUOUS states) — discovery
 * never fabricates a slide or a clinical association. Idempotency is DB-enforced by the
 * `@@unique([labId, sourceId, sourceRef])` constraint; a re-scan/restart returns the existing intake row.
 */
@Injectable()
export class IngestionDiscoveryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotently record that a source object/path was observed. Repeated calls for the same
   * (lab, source, sourceRef) never create a second intake row: find-first (auto lab-scoped) short-circuits,
   * and a concurrent insert that loses the race is caught on the unique constraint and resolved to the
   * winning row. Starts in DISCOVERED with no association.
   */
  async recordDiscovery(input: { sourceId: string; sourceRef: string; sizeBytes?: number | null }) {
    const existing = await this.prisma.ingestionDiscovery.findFirst({
      where: { sourceId: input.sourceId, sourceRef: input.sourceRef },
    });
    if (existing) return existing;
    try {
      return await this.prisma.ingestionDiscovery.create({
        data: tenantCreate<Prisma.IngestionDiscoveryUncheckedCreateInput>({
          sourceId: input.sourceId,
          sourceRef: input.sourceRef,
          sizeBytes: input.sizeBytes ?? null,
          status: 'DISCOVERED',
        }),
      });
    } catch (e) {
      // Unique violation on a concurrent insert → the other writer won; return that row (idempotent).
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return this.prisma.ingestionDiscovery.findFirstOrThrow({
          where: { sourceId: input.sourceId, sourceRef: input.sourceRef },
        });
      }
      throw e;
    }
  }

  /** Transition an intake row's state (auto lab-scoped). B2–B4 drive the full state machine. */
  setStatus(id: string, status: IngestionDiscoveryStatus, patch: Prisma.IngestionDiscoveryUpdateInput = {}) {
    return this.prisma.ingestionDiscovery.update({ where: { id }, data: { status, ...patch } });
  }

  findByStatus(status: IngestionDiscoveryStatus) {
    return this.prisma.ingestionDiscovery.findMany({ where: { status }, orderBy: { discoveredAt: 'asc' } });
  }

  /**
   * Dedup CONTRACT (B3 enforces the skip): duplicate identity is the SHA-256 of the source bytes within a
   * lab — NEVER filename/accession/patient/specimen/size. Returns true if these exact bytes are already
   * known in the caller's lab, whether via a verified 5A ingestion or a prior handed-off discovery.
   */
  async isDuplicateBytes(sourceChecksum: string): Promise<boolean> {
    if (!sourceChecksum) return false;
    const [priorIngestion, priorDiscovery] = await Promise.all([
      this.prisma.slideIngestion.findFirst({ where: { sourceChecksum, status: 'VERIFIED' }, select: { id: true } }),
      this.prisma.ingestionDiscovery.findFirst({ where: { sourceChecksum, status: 'INGESTED' }, select: { id: true } }),
    ]);
    return !!priorIngestion || !!priorDiscovery;
  }
}
