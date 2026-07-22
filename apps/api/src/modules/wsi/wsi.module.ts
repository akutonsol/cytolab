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
  ],
  exports: [WsiService, SlideIngestionService],
})
export class WsiModule {}
