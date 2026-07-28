import { Injectable } from '@nestjs/common';
import { DicomWebImportService } from '../../dicomweb/dicomweb-import.service';
import type { CanonicalScanDiscovery, CompletenessResult, ResolvedScannerSource, ScannerAdapter } from '../scanner-adapter';

const ADAPTER_ID = 'dicomweb';

/**
 * Program 5C · C4 — reference DICOMWEB adapter. A THIN wrapper proving the framework spans the accepted DICOMWEB
 * transport: discovery delegates to the C3 `DicomWebImportService.discoverSeries` (QIDO), emitting one
 * DICOMWEB_SERIES discovery per series; the router routes it back to C3 `importSeries` (which owns QIDO/WADO,
 * SSRF, auth, native-byte checksum, single-instance profile, idempotency, PHI/tenancy). It duplicates NONE of
 * that. A DICOMweb series is retrieved on demand, so completeness is always true here (C3 owns retrieval truth).
 */
@Injectable()
export class DicomWebAdapter implements ScannerAdapter {
  readonly id = ADAPTER_ID;
  readonly adapterType = 'DICOMWEB' as const;

  constructor(private readonly imports: DicomWebImportService) {}

  async discoverCompletedScans(source: ResolvedScannerSource): Promise<CanonicalScanDiscovery[]> {
    const { series } = await this.imports.discoverSeries({ sourceId: source.id });
    return series.map((s) => ({
      sourceRef: `${s.studyInstanceUID}/${s.seriesInstanceUID}`, // same identity C3 uses
      objectKind: 'DICOMWEB_SERIES' as const,
      locator: { kind: 'DICOMWEB_SERIES' as const, studyInstanceUID: s.studyInstanceUID, seriesInstanceUID: s.seriesInstanceUID },
      scannerMetadata: { adapterId: this.id },
    }));
  }

  async validateCompleteness(): Promise<CompletenessResult> {
    return { complete: true }; // retrieval completeness is enforced inside the accepted C3 importSeries flow
  }
}
