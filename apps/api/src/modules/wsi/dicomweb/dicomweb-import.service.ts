import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EncryptionService } from '../../../common/encryption.service';
import { AuditRecorder } from '../../audit/audit-recorder.service';
import { IngestionSourceService } from '../auto-ingestion/ingestion-source.service';
import { IngestionDiscoveryService } from '../auto-ingestion/ingestion-discovery.service';
import { DicomIngestionService, type DicomIngestOutcome } from '../dicom/dicom-ingestion.service';
import { VL_WHOLE_SLIDE_MICROSCOPY_SOP_CLASS_UID } from '../dicom/dicom-conformance';
import { DicomWebClient, type ResolvedDicomWebEndpoint } from './dicomweb-client';
import { DicomWebError } from './dicomweb-errors';

export type DicomWebImportOutcome = DicomIngestOutcome | 'FAILED';

export interface DicomWebImportResult {
  outcome: DicomWebImportOutcome;
  studyInstanceUID: string;
  seriesInstanceUID: string;
  slideId: string | null;
  ingestionId: string | null;
  error?: { code: string; message: string };
}

// Import is idempotent: a discovery already in a terminal non-FAILED state means the series was imported.
const TERMINAL_NON_FAILED = new Set(['INGESTED', 'DUPLICATE', 'RECONCILED']);

/**
 * Program 5C · C3 — server-owned DICOMweb IMPORT. Discovers a series, selects the SINGLE ingestable WSI SOP
 * instance, WADO-retrieves its EXACT native bytes, and hands them to the accepted C2 `ingestDicomWsi` — the
 * authoritative parse / C1 conformance / C2 profile / exact accession match / native-checksum / dedup. There
 * is NO second ingestion or processing path. A multi-instance WSI series is truthfully UNSUPPORTED (C2's
 * single-object contract is never widened). Reuses IngestionDiscovery for import idempotency + monitoring +
 * B4 reconciliation visibility. Credentials are decrypted in-process only; nothing secret is returned.
 */
@Injectable()
export class DicomWebImportService {
  private readonly logger = new Logger(DicomWebImportService.name);

  constructor(
    private readonly sources: IngestionSourceService,
    private readonly discovery: IngestionDiscoveryService,
    private readonly dicom: DicomIngestionService,
    private readonly client: DicomWebClient,
    private readonly encryption: EncryptionService,
    private readonly audit: AuditRecorder,
  ) {}

  /** QIDO discovery of series at a configured endpoint (structured summaries only; credential used server-side). */
  async discoverSeries(input: { sourceId: string; studyInstanceUID?: string; seriesInstanceUID?: string }) {
    const source = await this.sources.get(input.sourceId);
    if (!source || source.kind !== 'DICOMWEB' || !source.endpointBaseUrl) throw new NotFoundException('DICOMweb source not found');
    const ep = this.resolveEndpoint(source);
    const series = await this.client.qidoSeries(ep, { studyInstanceUID: input.studyInstanceUID, seriesInstanceUID: input.seriesInstanceUID });
    return { series };
  }

  async importSeries(input: { sourceId: string; studyInstanceUID: string; seriesInstanceUID: string }): Promise<DicomWebImportResult> {
    const { studyInstanceUID, seriesInstanceUID } = input;
    const base = { studyInstanceUID, seriesInstanceUID, slideId: null, ingestionId: null };

    const source = await this.sources.get(input.sourceId); // auto lab-scoped
    if (!source || source.kind !== 'DICOMWEB' || !source.endpointBaseUrl) throw new NotFoundException('DICOMweb source not found');
    if (!source.enabled) throw new BadRequestException('DICOMweb source is disabled');

    const ep = this.resolveEndpoint(source);
    const sourceRef = `${studyInstanceUID}/${seriesInstanceUID}`;

    // Import idempotency: a prior successful import of this series short-circuits (no re-retrieval).
    const disc = await this.discovery.recordDiscovery({ sourceId: source.id, sourceRef });
    if (TERMINAL_NON_FAILED.has(disc.status)) {
      return { ...base, outcome: disc.status === 'INGESTED' ? 'INGESTED' : 'DUPLICATE', slideId: disc.resultingSlideId ?? null, ingestionId: disc.resultingIngestionId ?? null };
    }

    // Select the single ingestable WSI SOP instance (multi-instance pyramid → truthful UNSUPPORTED).
    let sopInstanceUID: string;
    try {
      const instances = await this.client.qidoInstances(ep, studyInstanceUID, seriesInstanceUID);
      const wsi = instances.filter((i) => i.sopClassUID === VL_WHOLE_SLIDE_MICROSCOPY_SOP_CLASS_UID);
      if (wsi.length === 0) return this.finish(disc.id, base, 'UNSUPPORTED', 'no VL Whole Slide Microscopy Image instance in the series');
      if (wsi.length > 1) return this.finish(disc.id, base, 'UNSUPPORTED', 'multi-instance WSI series is not supported (single-object profile only)');
      sopInstanceUID = wsi[0].sopInstanceUID;
    } catch (e) {
      return this.transportFailure(disc.id, base, e);
    }

    // WADO-retrieve the EXACT native DICOM bytes.
    let bytes: Buffer;
    try {
      bytes = await this.client.wadoRetrieveInstance(ep, studyInstanceUID, seriesInstanceUID, sopInstanceUID);
    } catch (e) {
      return this.transportFailure(disc.id, base, e);
    }

    // Hand the native bytes to the accepted C2 pipeline (parse/conformance/profile/match/checksum/dedup).
    const res = await this.dicom.ingestDicomWsi(bytes, { filename: `${seriesInstanceUID}.dcm` });
    return this.finishFromC2(disc.id, base, res.outcome, res.slideId, res.ingestionId);
  }

  private resolveEndpoint(source: { endpointBaseUrl: string | null; authType: string | null; credentialCipher: string | null }): ResolvedDicomWebEndpoint {
    const baseUrl = source.endpointBaseUrl!;
    const host = new URL(baseUrl).hostname;
    let authHeader: string | undefined;
    if (source.authType && source.credentialCipher) {
      const cred = this.encryption.decrypt(source.credentialCipher); // in-process only; never logged/returned
      authHeader = source.authType === 'BEARER' ? `Bearer ${cred}` : `Basic ${Buffer.from(cred, 'utf8').toString('base64')}`;
    }
    return { baseUrl, allowedHosts: [host], authHeader };
  }

  private async transportFailure(discId: string, base: Omit<DicomWebImportResult, 'outcome' | 'error'>, e: unknown): Promise<DicomWebImportResult> {
    if (e instanceof DicomWebError) {
      await this.setDiscovery(discId, 'FAILED', { failureReason: `DICOMWEB_${e.code}` });
      return { ...base, outcome: 'FAILED', error: { code: e.code, message: e.message } };
    }
    throw e;
  }

  private async finish(discId: string, base: Omit<DicomWebImportResult, 'outcome' | 'error'>, outcome: DicomWebImportOutcome, reason: string): Promise<DicomWebImportResult> {
    await this.setDiscovery(discId, 'FAILED', { failureReason: reason });
    return { ...base, outcome, error: { code: outcome, message: reason } };
  }

  private async finishFromC2(discId: string, base: Omit<DicomWebImportResult, 'outcome' | 'error'>, outcome: DicomIngestOutcome, slideId: string | null, ingestionId: string | null): Promise<DicomWebImportResult> {
    const map: Record<DicomIngestOutcome, { status: string; patch?: Record<string, unknown> }> = {
      INGESTED: { status: 'INGESTED', patch: { resultingSlideId: slideId, resultingIngestionId: ingestionId } },
      DUPLICATE: { status: 'DUPLICATE' },
      UNMATCHED: { status: 'UNMATCHED' },
      AMBIGUOUS: { status: 'AMBIGUOUS' },
      UNSUPPORTED: { status: 'FAILED', patch: { failureReason: 'DICOM_UNSUPPORTED_PROFILE' } },
      NONCONFORMANT: { status: 'FAILED', patch: { failureReason: 'DICOM_NONCONFORMANT' } },
    };
    const m = map[outcome];
    await this.setDiscovery(discId, m.status, m.patch);
    return { ...base, outcome, slideId, ingestionId };
  }

  private async setDiscovery(id: string, status: string, patch?: Record<string, unknown>): Promise<void> {
    await this.discovery.setStatus(id, status as any, (patch ?? {}) as any).catch(() => undefined);
    await this.audit
      .recordEntityUpdated({ resource: { type: 'IngestionDiscovery', id }, changedFields: ['status'], producerModule: 'wsi-dicomweb' })
      .catch(() => undefined);
  }
}
