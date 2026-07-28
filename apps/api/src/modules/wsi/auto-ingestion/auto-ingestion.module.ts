import { Module } from '@nestjs/common';
import { WsiModule } from '../wsi.module';
import { AuditModule } from '../../audit/audit.module';
import { IngestionSourceService } from './ingestion-source.service';
import { IngestionDiscoveryService } from './ingestion-discovery.service';
import { AccessionMatchResolver } from './accession-match.resolver';
import { AutomatedIngestionComposer } from './automated-ingestion-composer';
import { WatchFolderScanner } from './watch-folder-scanner';
import { WatchFolderProcessor } from './watch-folder-processor';
import { WatchFolderScheduler } from './watch-folder.scheduler';
import { ReconciliationService } from './reconciliation.service';
import { ReconciliationController } from './reconciliation.controller';
import { IngestionMonitoringService } from './ingestion-monitoring.service';
import { IngestionMonitoringController } from './ingestion-monitoring.controller';
import { DicomIngestionService } from '../dicom/dicom-ingestion.service';
import { EncryptionService } from '../../../common/encryption.service';
import { DicomWebClient } from '../dicomweb/dicomweb-client';
import { DicomWebSourceService } from '../dicomweb/dicomweb-source.service';
import { DicomWebImportService } from '../dicomweb/dicomweb-import.service';
import { DicomWebController } from '../dicomweb/dicomweb.controller';
import { SCANNER_ADAPTERS } from '../scanner/scanner-adapter';
import { ScannerAdapterRegistry } from '../scanner/scanner-adapter-registry';
import { ScannerRouterService } from '../scanner/scanner-router.service';
import { FilesystemDicomAdapter } from '../scanner/adapters/filesystem-dicom.adapter';
import { DicomWebAdapter } from '../scanner/adapters/dicomweb.adapter';
import { ScannerController } from '../scanner/scanner.controller';
import { WATCH_FOLDER_CONFIG, loadWatchFolderConfig } from './watch-folder-config';

/**
 * Program 5B — Automated Ingestion.
 *
 * B1: persistence & contracts (source/discovery/resolver/dedup/composer seam).
 * B2: server-owned watch-folder discovery + stable-file hand-off into the ACCEPTED 5A pipeline
 *     (via WsiModule's SlideIngestionService). The poller is DISABLED by default and under test.
 *
 * B4: human exception & reconciliation workflows over the classified exceptions (ReconciliationController,
 *     gated by wsi:reconcile) — reusing the same accepted pipeline via the composer; no second intake path.
 * B5-a: read-only operational monitoring over persisted truth (IngestionMonitoringController, gated by
 *     wsi:reconcile) — no mutation, no source configuration (source administration remains deferred to B5-b).
 *
 * PrismaService, LabContext and ExecutionContextService are globally provided; WsiModule is imported (to reuse
 * the ingestion/queue seams) and AuditModule (for the best-effort reconciliation audit trail). No
 * source-management controller (source administration + system:ingestion deferred to B5-b, not authorized).
 */
@Module({
  imports: [WsiModule, AuditModule],
  controllers: [ReconciliationController, IngestionMonitoringController, DicomWebController, ScannerController],
  providers: [
    { provide: WATCH_FOLDER_CONFIG, useFactory: () => loadWatchFolderConfig() },
    IngestionSourceService,
    IngestionDiscoveryService,
    AccessionMatchResolver,
    AutomatedIngestionComposer,
    WatchFolderScanner,
    WatchFolderProcessor,
    WatchFolderScheduler,
    ReconciliationService,
    IngestionMonitoringService,
    DicomIngestionService, // P5C-C2 — server-owned native DICOM WSI intake into the accepted pipeline
    // P5C-C3 — DICOMweb import (QIDO/WADO → native bytes → the C2 service). EncryptionService encrypts endpoint
    // credentials at rest (provided directly, mirroring SecurityModule).
    EncryptionService,
    DicomWebClient,
    DicomWebSourceService,
    DicomWebImportService,
    // P5C-C4 — scanner-adapter framework: statically-registered reference adapters + registry + router. The
    // router reuses the accepted intake (ingestDicomWsi / importSeries); no new pipeline/worker/slide path.
    FilesystemDicomAdapter,
    DicomWebAdapter,
    { provide: SCANNER_ADAPTERS, useFactory: (fsd: FilesystemDicomAdapter, dw: DicomWebAdapter) => [fsd, dw], inject: [FilesystemDicomAdapter, DicomWebAdapter] },
    ScannerAdapterRegistry,
    ScannerRouterService,
  ],
  exports: [IngestionSourceService, IngestionDiscoveryService, AccessionMatchResolver, AutomatedIngestionComposer, WatchFolderProcessor, ReconciliationService, IngestionMonitoringService, DicomIngestionService, DicomWebImportService, DicomWebSourceService, ScannerRouterService, ScannerAdapterRegistry],
})
export class AutoIngestionModule {}
