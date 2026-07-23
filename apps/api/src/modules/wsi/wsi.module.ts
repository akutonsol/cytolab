import { Module } from '@nestjs/common';
import * as os from 'node:os';
import * as path from 'node:path';
import { PrismaModule } from '../../database/prisma.module';
import { WsiController } from './wsi.controller';
import { WsiService } from './wsi.service';
import { SlideIngestionController } from './ingestion/slide-ingestion.controller';
import { SlideIngestionService } from './ingestion/slide-ingestion.service';
import { SOURCE_OBJECT_STORE } from './storage/source-object-store';
import { LocalSourceObjectStore } from './storage/local-source-object-store';
import { DERIVATIVE_OBJECT_STORE } from './storage/derivative-object-store';
import { LocalDerivativeObjectStore } from './storage/local-derivative-object-store';
import { SOURCE_MATERIALIZER } from './processing/source-materializer';
import { LocalSourceMaterializer } from './processing/local-source-materializer';
import { SourceObjectStore } from './storage/source-object-store';
import { PROCESSING_CONFIG } from './processing/processing-tokens';
import { loadProcessingConfig } from './processing/processing-config';
import { JobLeaseService } from './processing/job-lease.service';
import { SlideProcessingQueueService } from './processing/slide-processing-queue.service';
import { SlideProcessingScheduler } from './processing/slide-processing.scheduler';

@Module({
  imports: [PrismaModule],
  controllers: [WsiController, SlideIngestionController],
  providers: [
    WsiService,
    SlideIngestionService,
    {
      // P5-3A: local-filesystem private source store (dev/test). The GCS implementation of the same
      // interface is provisioned in Program 9 — this binding is the only place that changes.
      provide: SOURCE_OBJECT_STORE,
      useFactory: () =>
        new LocalSourceObjectStore(
          process.env.WSI_SOURCE_STORE_DIR ?? path.join(os.tmpdir(), 'osieri-wsi-source-store'),
        ),
    },
    {
      // P5-3B.1B: local write-once derivative store (dev/test). GCS impl of the same interface = Program 9.
      provide: DERIVATIVE_OBJECT_STORE,
      useFactory: () =>
        new LocalDerivativeObjectStore(
          process.env.WSI_DERIVATIVE_STORE_DIR ?? path.join(os.tmpdir(), 'osieri-wsi-derivative-store'),
        ),
    },
    {
      // P5-3B.1B: materialize a verified source into a private read-only working file for the engine.
      provide: SOURCE_MATERIALIZER,
      useFactory: (store: SourceObjectStore) =>
        new LocalSourceMaterializer(
          store,
          process.env.WSI_MATERIALIZATION_DIR ?? path.join(os.tmpdir(), 'osieri-wsi-materialization'),
        ),
      inject: [SOURCE_OBJECT_STORE],
    },
    // P5-3B.1A — processing orchestration + lease runtime (no engine/generation/sealing yet).
    { provide: PROCESSING_CONFIG, useFactory: () => loadProcessingConfig() },
    SlideProcessingQueueService,
    JobLeaseService,
    SlideProcessingScheduler,
  ],
  exports: [WsiService, SlideIngestionService, SlideProcessingQueueService, JobLeaseService],
})
export class WsiModule {}
