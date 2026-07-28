import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditRecorder } from '../../audit/audit-recorder.service';
import { IngestionSourceService } from '../auto-ingestion/ingestion-source.service';
import { IngestionDiscoveryService } from '../auto-ingestion/ingestion-discovery.service';
import { resolveConfinedPath } from '../auto-ingestion/reconciliation.service';
import { DicomIngestionService, type DicomIngestOutcome } from '../dicom/dicom-ingestion.service';
import { DicomWebImportService } from '../dicomweb/dicomweb-import.service';
import { ScannerAdapterRegistry } from './scanner-adapter-registry';
import { assertAdapterMatchesKind, ScannerAdapterError, type CanonicalScanDiscovery, type ResolvedScannerSource } from './scanner-adapter';

export type ScannerOutcome = DicomIngestOutcome | 'INCOMPLETE' | 'FAILED';
export interface ScannerItemResult {
  sourceRef: string;
  outcome: ScannerOutcome;
  slideId?: string | null;
  error?: { code: string; message: string };
}
export interface ScannerRunResult {
  adapterId: string;
  adapterType: string;
  results: ScannerItemResult[];
}

const TERMINAL_NON_FAILED = new Set(['INGESTED', 'DUPLICATE', 'RECONCILED']);

/**
 * Program 5C · C4 — the canonical SCANNER ROUTER. Resolves the configured adapter, obtains canonical completed-
 * scan discoveries, reuses IngestionDiscovery idempotency + completeness, and routes each object to the CORRECT
 * ACCEPTED intake — never a new pipeline/worker/slide/publication path:
 *   DICOM_FILE      → read the EXACT native bytes (root-confined) → DicomIngestionService.ingestDicomWsi (C2)
 *   DICOMWEB_SERIES → DicomWebImportService.importSeries (C3 owns everything)
 * FILESYSTEM_IMAGE is out of scope here — its accepted 5B watch-folder path is unchanged.
 */
@Injectable()
export class ScannerRouterService {
  private readonly logger = new Logger(ScannerRouterService.name);

  constructor(
    private readonly sources: IngestionSourceService,
    private readonly discovery: IngestionDiscoveryService,
    private readonly registry: ScannerAdapterRegistry,
    private readonly dicom: DicomIngestionService,
    private readonly imports: DicomWebImportService,
    private readonly audit: AuditRecorder,
  ) {}

  /** Run the configured scanner adapter for one source, ingesting each completed scan via the accepted intake. */
  async runSource(sourceId: string): Promise<ScannerRunResult> {
    const source = await this.sources.get(sourceId); // auto lab-scoped
    if (!source) throw new NotFoundException('source not found');
    if (!source.adapterType) throw new BadRequestException('source has no scanner adapterType configured');
    assertAdapterMatchesKind(source.adapterType, source.kind);
    if (!source.enabled) throw new BadRequestException('source is disabled');
    const adapter = this.registry.require(source.adapterType);
    const resolved: ResolvedScannerSource = { id: source.id, kind: source.kind, rootPath: source.rootPath, endpointBaseUrl: source.endpointBaseUrl, adapterType: source.adapterType };

    const discoveries = await adapter.discoverCompletedScans(resolved);
    const results: ScannerItemResult[] = [];
    for (const d of discoveries) {
      try {
        results.push(await this.handleOne(d, resolved, adapter.id));
      } catch (e) {
        if (e instanceof ScannerAdapterError) results.push({ sourceRef: d.sourceRef, outcome: 'FAILED', error: { code: e.code, message: e.message } });
        else throw e;
      }
    }
    await this.audit.recordEntityUpdated({ resource: { type: 'IngestionSource', id: sourceId }, changedFields: ['scannerRun'], producerModule: 'wsi-scanner' }).catch(() => undefined);
    return { adapterId: adapter.id, adapterType: source.adapterType, results };
  }

  private async handleOne(d: CanonicalScanDiscovery, source: ResolvedScannerSource, adapterId: string): Promise<ScannerItemResult> {
    // DICOMWEB — the accepted C3 service owns discovery/idempotency/native-byte/tenancy end to end.
    if (d.objectKind === 'DICOMWEB_SERIES' && d.locator.kind === 'DICOMWEB_SERIES') {
      const r = await this.imports.importSeries({ sourceId: source.id, studyInstanceUID: d.locator.studyInstanceUID, seriesInstanceUID: d.locator.seriesInstanceUID });
      return { sourceRef: d.sourceRef, outcome: r.outcome, slideId: r.slideId };
    }

    // FILESYSTEM — reuse IngestionDiscovery idempotency + adapter completeness, then route to C2 for DICOM files.
    const disc = await this.discovery.recordDiscovery({ sourceId: source.id, sourceRef: d.sourceRef, sizeBytes: d.sizeBytes ?? null });
    if (TERMINAL_NON_FAILED.has(disc.status)) {
      return { sourceRef: d.sourceRef, outcome: disc.status === 'INGESTED' ? 'INGESTED' : (disc.status as ScannerOutcome), slideId: disc.resultingSlideId };
    }
    const registry = this.registry.require(source.adapterType);
    const comp = await registry.validateCompleteness(d, source);
    if (!comp.complete) {
      await this.discovery.setStatus(disc.id, 'STABILIZING', { sizeBytes: d.sizeBytes ?? null }).catch(() => undefined);
      return { sourceRef: d.sourceRef, outcome: 'INCOMPLETE', error: { code: 'INCOMPLETE_SCAN', message: comp.reason ?? 'incomplete' } };
    }

    if (d.objectKind !== 'DICOM_FILE') {
      // Scanner image files are handled by the accepted 5B watch-folder path, not this router.
      await this.discovery.setStatus(disc.id, 'FAILED', { failureReason: 'SCANNER_IMAGE_NOT_HANDLED_BY_ROUTER' }).catch(() => undefined);
      return { sourceRef: d.sourceRef, outcome: 'UNSUPPORTED' };
    }

    // Root-confined read of the EXACT native bytes; the accepted C2 path owns checksum/conformance/profile/match.
    let bytes: Buffer;
    try {
      const abs = await resolveConfinedPath(source.rootPath!, d.sourceRef);
      bytes = await fs.readFile(abs);
    } catch (e) {
      await this.discovery.setStatus(disc.id, 'FAILED', { failureReason: `SCANNER_SOURCE_UNREADABLE: ${(e as Error)?.message ?? 'gone'}` }).catch(() => undefined);
      return { sourceRef: d.sourceRef, outcome: 'FAILED', error: { code: 'SOURCE_NOT_FOUND', message: 'source file unreadable / escapes root' } };
    }
    const res = await this.dicom.ingestDicomWsi(bytes, { filename: d.sourceRef.split('/').pop() ?? d.sourceRef });
    await this.applyOutcome(disc.id, res.outcome, res.slideId, res.ingestionId, createHash('sha256').update(bytes).digest('hex'));
    return { sourceRef: d.sourceRef, outcome: res.outcome, slideId: res.slideId };
  }

  private async applyOutcome(discId: string, outcome: DicomIngestOutcome, slideId: string | null, ingestionId: string | null, checksum: string): Promise<void> {
    const map: Record<DicomIngestOutcome, { status: string; patch?: Record<string, unknown> }> = {
      INGESTED: { status: 'INGESTED', patch: { resultingSlideId: slideId, resultingIngestionId: ingestionId, sourceChecksum: checksum } },
      DUPLICATE: { status: 'DUPLICATE', patch: { sourceChecksum: checksum } },
      UNMATCHED: { status: 'UNMATCHED', patch: { sourceChecksum: checksum } },
      AMBIGUOUS: { status: 'AMBIGUOUS', patch: { sourceChecksum: checksum } },
      UNSUPPORTED: { status: 'FAILED', patch: { failureReason: 'DICOM_UNSUPPORTED_PROFILE' } },
      NONCONFORMANT: { status: 'FAILED', patch: { failureReason: 'DICOM_NONCONFORMANT' } },
    };
    const m = map[outcome];
    await this.discovery.setStatus(discId, m.status as any, (m.patch ?? {}) as any).catch(() => undefined);
  }
}
