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
  controllers: [ReconciliationController, IngestionMonitoringController],
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
  ],
  exports: [IngestionSourceService, IngestionDiscoveryService, AccessionMatchResolver, AutomatedIngestionComposer, WatchFolderProcessor, ReconciliationService, IngestionMonitoringService],
})
export class AutoIngestionModule {}
