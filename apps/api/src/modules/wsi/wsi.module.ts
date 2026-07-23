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
    // P5-3B.1A — processing orchestration + lease runtime (no engine/generation/sealing yet).
    { provide: PROCESSING_CONFIG, useFactory: () => loadProcessingConfig() },
    SlideProcessingQueueService,
    JobLeaseService,
    SlideProcessingScheduler,
  ],
  exports: [WsiService, SlideIngestionService, SlideProcessingQueueService, JobLeaseService],
})
export class WsiModule {}
