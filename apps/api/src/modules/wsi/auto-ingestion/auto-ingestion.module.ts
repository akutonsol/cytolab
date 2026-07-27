import { Module } from '@nestjs/common';
import { WsiModule } from '../wsi.module';
import { IngestionSourceService } from './ingestion-source.service';
import { IngestionDiscoveryService } from './ingestion-discovery.service';
import { AccessionMatchResolver } from './accession-match.resolver';
import { AutomatedIngestionComposer } from './automated-ingestion-composer';
import { WatchFolderScanner } from './watch-folder-scanner';
import { WatchFolderProcessor } from './watch-folder-processor';
import { WatchFolderScheduler } from './watch-folder.scheduler';
import { WATCH_FOLDER_CONFIG, loadWatchFolderConfig } from './watch-folder-config';

/**
 * Program 5B — Automated Ingestion.
 *
 * B1: persistence & contracts (source/discovery/resolver/dedup/composer seam).
 * B2: server-owned watch-folder discovery + stable-file hand-off into the ACCEPTED 5A pipeline
 *     (via WsiModule's SlideIngestionService). The poller is DISABLED by default and under test.
 *
 * PrismaService, LabContext and ExecutionContextService are globally provided; only WsiModule is imported
 * (to reuse the ingestion/queue seams). No source-management controller (authz decision deferred to B5).
 */
@Module({
  imports: [WsiModule],
  providers: [
    { provide: WATCH_FOLDER_CONFIG, useFactory: () => loadWatchFolderConfig() },
    IngestionSourceService,
    IngestionDiscoveryService,
    AccessionMatchResolver,
    AutomatedIngestionComposer,
    WatchFolderScanner,
    WatchFolderProcessor,
    WatchFolderScheduler,
  ],
  exports: [IngestionSourceService, IngestionDiscoveryService, AccessionMatchResolver, AutomatedIngestionComposer, WatchFolderProcessor],
})
export class AutoIngestionModule {}
