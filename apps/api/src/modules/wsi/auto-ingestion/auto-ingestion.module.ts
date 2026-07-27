import { Module } from '@nestjs/common';
import { WsiModule } from '../wsi.module';
import { IngestionSourceService } from './ingestion-source.service';
import { IngestionDiscoveryService } from './ingestion-discovery.service';
import { AccessionMatchResolver } from './accession-match.resolver';
import { AutomatedIngestionComposer } from './automated-ingestion-composer';

/**
 * Program 5B · B1 — Automated Ingestion (persistence & contracts only).
 *
 * Imports WsiModule to REUSE the accepted 5A ingestion/queue seams (SlideIngestionService,
 * SlideProcessingQueueService) — one pipeline, multiple intake methods. B1 adds NO controllers (source-
 * management authorization is a B2/B5 decision) and NO poller (B2). Not yet registered in AppModule; it is
 * wired in at B2 when the discovery worker + reconciliation surfaces land.
 */
@Module({
  imports: [WsiModule],
  providers: [IngestionSourceService, IngestionDiscoveryService, AccessionMatchResolver, AutomatedIngestionComposer],
  exports: [IngestionSourceService, IngestionDiscoveryService, AccessionMatchResolver, AutomatedIngestionComposer],
})
export class AutoIngestionModule {}
