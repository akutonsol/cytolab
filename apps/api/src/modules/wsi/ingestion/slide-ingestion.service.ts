import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { tenantCreate } from '../../../common/tenancy/tenancy.extension';
import { AuditRecorder } from '../../audit/audit-recorder.service';
import { SOURCE_OBJECT_STORE, SourceObjectStore } from '../storage/source-object-store';
import { SlideProcessingQueueService } from '../processing/slide-processing-queue.service';
import { CompleteSlideUploadDto, InitiateSlideUploadDto } from './dto/slide-ingestion.dto';

/**
 * Program 5A · P5-3A — Upload orchestration + SlideIngestion lifecycle.
 *
 * Takes a slide from nothing to a VERIFIED, privately-stored source object, and STOPS there. It never
 * tiles, generates, seals, publishes, or serves — the slide remains DRAFT (not viewable). The intake
 * state machine follows the IngestionStatus enum exactly: UPLOADING → UPLOADED → VERIFIED (or FAILED).
 *
 * Invariants enforced here (P5-3A):
 *  • Checksum verification COMPLETES before the transition to VERIFIED (never a transient VERIFIED). [R3]
 *  • Once VERIFIED, sourceObjectKey + sourceChecksum are immutable — they forever describe the same
 *    uploaded bytes; a replacement is a NEW ingestion, never an overwrite. [R2 + additional invariant]
 *  • Duplicate detection is advisory and runs AFTER VERIFIED — it never blocks a valid upload. [R5]
 *  • completeUpload is idempotent — a re-complete of a VERIFIED ingestion is a no-op read. [R3]
 */
@Injectable()
export class SlideIngestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditRecorder,
    @Inject(SOURCE_OBJECT_STORE) private readonly store: SourceObjectStore,
    private readonly queue: SlideProcessingQueueService,
  ) {}

  /** Begin an upload: create a DRAFT slide + an UPLOADING ingestion, and open a resumable session. */
  async initiate(recordId: string, dto: InitiateSlideUploadDto, userId: string | null) {
    const record = await this.prisma.record.findFirst({ where: { id: recordId }, select: { id: true } });
    if (!record) throw new NotFoundException('Record not found');

    // If a specimen is supplied it must belong to the SAME record (tenancy is enforced by the extension).
    if (dto.specimenId) {
      const specimen = await this.prisma.specimen.findFirst({
        where: { id: dto.specimenId, recordId },
        select: { id: true },
      });
      if (!specimen) throw new BadRequestException('specimen does not belong to this record');
    }

    const sourceKind = dto.sourceKind ?? 'UPLOAD';
    // The slide is the long-lived clinical identity; it is created DRAFT (not viewable). `slideUrl` is a
    // required legacy column that does not apply to an upload-sourced slide → empty until deprecated.
    const slide = await this.prisma.digitalSlide.create({
      data: tenantCreate<Prisma.DigitalSlideUncheckedCreateInput>({
        recordId,
        specimenId: dto.specimenId ?? null,
        slideUrl: '',
        format: '',
        sourceKind,
        availabilityStatus: 'DRAFT',
        uploadedById: userId,
      }),
      select: { id: true, labId: true },
    });

    const ingestion = await this.prisma.slideIngestion.create({
      data: tenantCreate<Prisma.SlideIngestionUncheckedCreateInput>({
        slideId: slide.id,
        sourceKind,
        status: 'UPLOADING',
        originalFilename: dto.filename ?? null,
        sizeBytes: dto.sizeBytes ?? null,
        createdById: userId,
      }),
      select: { id: true },
    });

    const objectKey = `slides/${slide.labId}/${slide.id}/source/${ingestion.id}/${safeSegment(dto.filename)}`;
    const session = await this.store.createUploadSession(objectKey);
    await this.prisma.slideIngestion.update({ where: { id: ingestion.id }, data: { sourceObjectKey: objectKey } });

    // Generic lifecycle audit bridge (no registry expansion in P5-3A).
    await this.audit.recordEntityCreated({
      resource: { type: 'SlideIngestion', id: ingestion.id, labId: slide.labId },
      producerModule: 'wsi-ingestion',
    });

    return { slideId: slide.id, ingestionId: ingestion.id, objectKey, session };
  }

  /** Append a chunk to an in-progress upload (resumable; only while UPLOADING). */
  async appendChunk(ingestionId: string, offset: number, chunk: Buffer) {
    const ingestion = await this.loadIngestion(ingestionId);
    if (ingestion.status !== 'UPLOADING') {
      throw new ConflictException(`ingestion is ${ingestion.status}; not accepting chunks`);
    }
    if (!ingestion.sourceObjectKey) throw new ConflictException('ingestion has no upload session');
    const { nextOffset } = await this.store.writeChunk(ingestion.sourceObjectKey, offset, chunk);
    return { ingestionId, nextOffset };
  }

  /** Finalize + verify: assemble bytes, verify checksum, then (and only then) transition to VERIFIED. */
  async complete(ingestionId: string, dto: CompleteSlideUploadDto) {
    const ingestion = await this.loadIngestion(ingestionId);

    // Idempotent: a VERIFIED ingestion is never re-finalized or overwritten.
    if (ingestion.status === 'VERIFIED') {
      return { ingestion, duplicate: await this.duplicateAdvisory(ingestion) };
    }
    if (ingestion.status === 'FAILED') {
      throw new ConflictException('ingestion FAILED; start a new upload');
    }
    if (!ingestion.sourceObjectKey) throw new ConflictException('ingestion has no upload session');

    const completed = await this.store.completeUpload(ingestion.sourceObjectKey);

    // UPLOADED first — bytes are assembled but not yet integrity-confirmed (R3).
    await this.prisma.slideIngestion.update({
      where: { id: ingestion.id },
      data: { status: 'UPLOADED', sizeBytes: completed.sizeBytes },
    });

    // Checksum verification COMPLETES before VERIFIED. A declared-mismatch fails the ingestion.
    if (dto.expectedChecksum && dto.expectedChecksum !== completed.checksum) {
      await this.prisma.slideIngestion.update({ where: { id: ingestion.id }, data: { status: 'FAILED' } });
      throw new BadRequestException('source checksum mismatch — ingestion failed');
    }

    // VERIFIED — sourceChecksum + sourceObjectKey are now immutable; publish the slide's storageKey.
    // P5-3B.1A: the VERIFIED transition and the initial QUEUED processing job commit ATOMICALLY, so a
    // verified ingestion always leaves a job to process (enqueue is idempotent vs the active-job partial
    // unique index; the reconciler repairs any miss). No generation/engine/seal here — that is B.1C/B.2.
    const verified = await this.prisma.$transaction(async (tx) => {
      const v = await tx.slideIngestion.update({
        where: { id: ingestion.id },
        data: { status: 'VERIFIED', sourceChecksum: completed.checksum, sourceObjectKey: completed.objectKey },
      });
      await tx.digitalSlide.update({
        where: { id: ingestion.slideId },
        data: { storageKey: completed.objectKey },
      });
      await this.queue.enqueueForIngestion(tx, ingestion.id);
      return v;
    });

    // Advisory duplicate detection AFTER VERIFIED — never blocks a valid upload (R5).
    const duplicate = await this.duplicateAdvisory(verified);
    return { ingestion: verified, duplicate };
  }

  async get(ingestionId: string) {
    return this.loadIngestion(ingestionId);
  }

  private async loadIngestion(ingestionId: string) {
    const ingestion = await this.prisma.slideIngestion.findFirst({
      where: { id: ingestionId },
      select: {
        id: true, slideId: true, status: true, sourceObjectKey: true, sourceChecksum: true,
        sizeBytes: true, sourceKind: true, originalFilename: true, createdAt: true, updatedAt: true,
      },
    });
    if (!ingestion) throw new NotFoundException('Ingestion not found');
    return ingestion;
  }

  /**
   * Advisory only: other VERIFIED ingestions with the same source checksum under the same record.
   * Matching bytes ≠ matching clinical identity — the caller may still create a distinct slide. [R5/R6]
   */
  private async duplicateAdvisory(ingestion: { id: string; slideId: string; sourceChecksum: string | null }) {
    if (!ingestion.sourceChecksum) return { isPossibleDuplicate: false, matchingIngestionIds: [] as string[] };
    const slide = await this.prisma.digitalSlide.findFirst({
      where: { id: ingestion.slideId },
      select: { recordId: true },
    });
    if (!slide) return { isPossibleDuplicate: false, matchingIngestionIds: [] as string[] };
    const matches = await this.prisma.slideIngestion.findMany({
      where: {
        sourceChecksum: ingestion.sourceChecksum,
        status: 'VERIFIED',
        id: { not: ingestion.id },
        slide: { recordId: slide.recordId },
      },
      select: { id: true },
    });
    return { isPossibleDuplicate: matches.length > 0, matchingIngestionIds: matches.map((m) => m.id) };
  }
}

/** Keep a filename to a single safe path segment (no separators / traversal). */
function safeSegment(filename?: string): string {
  const base = (filename ?? 'source').replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '');
  return base.length ? base.slice(0, 200) : 'source';
}
