import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { tenantCreate } from '../../../common/tenancy/tenancy.extension';
import { SlideIngestionService } from '../ingestion/slide-ingestion.service';
import { AccessionMatchResolver } from '../auto-ingestion/accession-match.resolver';
import { parseDicomWsiMetadata } from './dicom-wsi-parser';
import { assessDecodeProfile } from './dicom-wsi-decoder';
import { validateDicomWsiConformance, type ConformanceReason } from './dicom-conformance';

export type DicomIngestOutcome = 'INGESTED' | 'UNSUPPORTED' | 'NONCONFORMANT' | 'UNMATCHED' | 'AMBIGUOUS' | 'DUPLICATE';

export interface DicomIngestResult {
  outcome: DicomIngestOutcome;
  slideId: string | null;
  ingestionId: string | null;
  reasons?: ConformanceReason[] | { code: string; message: string }[];
  candidateRecordIds?: string[];
}

const CHUNK = 1 << 20; // 1 MiB

/**
 * Program 5C · C2 — the server-owned NATIVE DICOM WSI intake. Another intake method into the ONE accepted
 * Osieri pipeline — it never creates a second ingestion/processing/tiling path and never publishes. Order:
 * parse → C1 conformance → C2 decode-profile → duplicate-identity → exact accession match → accepted
 * SlideIngestionService (sourceKind=DICOM set SERVER-SIDE, native-bytes checksum) → persist SlideDicomMetadata
 * → existing processing queue (via complete()). A non-VALID / unsupported / unmatched / duplicate input
 * creates NO slide, NO ingestion, and NO processing job. Public upload DTOs are untouched (no browser can
 * declare DICOM provenance).
 */
@Injectable()
export class DicomIngestionService {
  private readonly logger = new Logger(DicomIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingestion: SlideIngestionService,
    private readonly resolver: AccessionMatchResolver,
  ) {}

  async ingestDicomWsi(bytes: Buffer, opts: { filename: string }): Promise<DicomIngestResult> {
    const parsed = parseDicomWsiMetadata(bytes);

    // 1. C1 conformance BEFORE any slide/ingestion.
    const conformance = validateDicomWsiConformance(parsed.metadata);
    if (conformance.status !== 'VALID') {
      return { outcome: conformance.status, slideId: null, ingestionId: null, reasons: conformance.reasons };
    }
    // 2. C2 decode profile (conformant but outside the uncompressed/RGB/TILED_FULL/single-optical-path profile).
    const profile = assessDecodeProfile(bytes);
    if (!profile.supported) {
      return { outcome: 'UNSUPPORTED', slideId: null, ingestionId: null, reasons: profile.reasons };
    }
    // 3. Duplicate series identity within the lab (auto lab-scoped) → no second DICOM slide identity.
    const dup = await this.prisma.slideDicomMetadata.findFirst({
      where: { studyInstanceUID: parsed.metadata.studyInstanceUID!, seriesInstanceUID: parsed.metadata.seriesInstanceUID! },
      select: { id: true },
    });
    if (dup) return { outcome: 'DUPLICATE', slideId: null, ingestionId: null };

    // 4. Exact accession matching (reuse the accepted 5B resolver — no fuzzy/PHI matching).
    const match = await this.resolver.resolve(parsed.accessionNumber ?? '');
    if (match.kind === 'none') return { outcome: 'UNMATCHED', slideId: null, ingestionId: null };
    if (match.kind === 'ambiguous') return { outcome: 'AMBIGUOUS', slideId: null, ingestionId: null, candidateRecordIds: match.candidateRecordIds };

    // 5. Server-owned handoff into the accepted pipeline (sourceKind=DICOM server-side; native-bytes checksum).
    const checksum = createHash('sha256').update(bytes).digest('hex');
    const { slideId, ingestionId } = await this.ingestion.initiate(
      match.recordId,
      { sourceKind: 'DICOM', filename: opts.filename, sizeBytes: bytes.length },
      null,
    );
    for (let offset = 0; offset < bytes.length; offset += CHUNK) {
      await this.ingestion.appendChunk(ingestionId, offset, bytes.subarray(offset, Math.min(offset + CHUNK, bytes.length)));
    }
    // complete() verifies the checksum and atomically transitions VERIFIED + enqueues the processing job.
    await this.ingestion.complete(ingestionId, { expectedChecksum: checksum });

    // 6. Persist the DICOM identity/conformance (allowlist only; labId auto-stamped; VALID).
    const m = parsed.metadata;
    await this.prisma.slideDicomMetadata.create({
      data: tenantCreate<Prisma.SlideDicomMetadataUncheckedCreateInput>({
        slideId,
        studyInstanceUID: m.studyInstanceUID!,
        seriesInstanceUID: m.seriesInstanceUID!,
        representativeSopInstanceUID: m.representativeSopInstanceUID ?? null,
        sopClassUID: m.sopClassUID!,
        transferSyntaxUID: m.transferSyntaxUID!,
        frameOfReferenceUID: m.frameOfReferenceUID ?? null,
        totalPixelMatrixColumns: m.totalPixelMatrixColumns ?? null,
        totalPixelMatrixRows: m.totalPixelMatrixRows ?? null,
        numberOfFrames: m.numberOfFrames ?? null,
        frameColumns: m.frameColumns ?? null,
        frameRows: m.frameRows ?? null,
        opticalPaths: (m.opticalPaths ?? undefined) as unknown as Prisma.InputJsonValue,
        containerIdentifier: m.containerIdentifier ?? null,
        conformanceStatus: 'VALID',
        conformanceReasons: [] as unknown as Prisma.InputJsonValue,
      }),
    });

    // 7. Map acquisition scale onto the EXISTING DigitalSlide fields (engine reconcile skips null incoming →
    //    these DICOM values are preserved; sourceWidth/Height are left for the engine to derive from the PNG).
    const acq: Prisma.DigitalSlideUpdateInput = {};
    if (parsed.acquisition.objectivePower != null) acq.objectivePower = parsed.acquisition.objectivePower;
    if (parsed.acquisition.mpp != null) acq.mpp = parsed.acquisition.mpp;
    if (Object.keys(acq).length) await this.prisma.digitalSlide.update({ where: { id: slideId }, data: acq });

    return { outcome: 'INGESTED', slideId, ingestionId };
  }
}
