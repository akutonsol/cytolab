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
import { DicomAwareSourceMaterializer } from './dicom/dicom-source-materializer';
import { SourceObjectStore } from './storage/source-object-store';
import { TILING_ENGINE } from './processing/tiling-engine';
import { FakeTilingEngine } from './processing/fake-tiling-engine';
import { LibvipsTilingEngine } from './processing/libvips-tiling-engine';
import { SlideProcessingProcessor } from './processing/slide-processing.processor';
import { GenerationSealer } from './processing/generation-sealer';
import { GenerationVerifier } from './processing/generation-verifier';
import { GenerationVerdictService } from './processing/generation-verdict.service';
import { SlidePublicationService } from './processing/slide-publication.service';
import { PublishedGenerationResolver } from './delivery/published-generation.resolver';
import { DeliverySessionService, loadDeliverySessionConfig } from './delivery/delivery-session.service';
import { DELIVERY_SESSION_CONFIG } from './delivery/delivery.constants';
import { DeliveryTokenGuard } from './delivery/delivery-token.guard';
import { ArtifactDeliveryService } from './delivery/artifact-delivery.service';
import { SlideDeliverySessionController } from './delivery/slide-delivery-session.controller';
import { ArtifactDeliveryController } from './delivery/artifact-delivery.controller';
import { PROCESSING_CONFIG } from './processing/processing-tokens';
import { loadProcessingConfig } from './processing/processing-config';
import { JobLeaseService } from './processing/job-lease.service';
import { SlideProcessingQueueService } from './processing/slide-processing-queue.service';
import { SlideProcessingScheduler } from './processing/slide-processing.scheduler';
import { SlideReviewController } from './review/slide-review.controller';
import { SlideReviewService } from './review/slide-review.service';
import { SlidePublishController } from './publish/slide-publish.controller';
import { SlidePublishService } from './publish/slide-publish.service';

@Module({
  imports: [PrismaModule],
  controllers: [WsiController, SlideIngestionController, SlideDeliverySessionController, ArtifactDeliveryController, SlideReviewController, SlidePublishController],
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
      // P5C-C2: wrapped in the DICOM-aware decorator — non-DICOM sources are byte-identical to 5A; a DICOM
      // source additionally decodes the native object into a transient working image (no second pipeline).
      provide: SOURCE_MATERIALIZER,
      useFactory: (store: SourceObjectStore) =>
        new DicomAwareSourceMaterializer(
          new LocalSourceMaterializer(
            store,
            process.env.WSI_MATERIALIZATION_DIR ?? path.join(os.tmpdir(), 'osieri-wsi-materialization'),
          ),
        ),
      inject: [SOURCE_OBJECT_STORE],
    },
    {
      // P5-3B.1C — the tiling engine. Fake by default (CI, no native deps); libvips when explicitly
      // configured (Program 9 image). Not production-ready until a real WSI fixture passes end-to-end.
      provide: TILING_ENGINE,
      useFactory: () => {
        const sel = process.env.WSI_TILING_ENGINE ?? 'fake';
        if (sel === 'libvips') return new LibvipsTilingEngine();
        if (sel === 'fake') return new FakeTilingEngine();
        throw new Error(`unsupported WSI_TILING_ENGINE="${sel}" (expected "fake" or "libvips")`); // fail fast, no silent fallback
      },
    },
    // P5-3B.1A — processing orchestration + lease runtime (no engine/generation/sealing yet).
    { provide: PROCESSING_CONFIG, useFactory: () => loadProcessingConfig() },
    // P5-3B.1C-ii — the job processor (produce → PROCESSING generation). Worker loop stays disabled.
    SlideProcessingProcessor,
    // P5-3B.2B — seal a PROCESSING generation → QC_PENDING (unverified) + complete the job.
    GenerationSealer,
    // P5-3B.3A — read-only independent verifier (compute an outcome; no state transition, no scheduling).
    GenerationVerifier,
    // P5-3B.3B-ii-b — apply a terminal verdict (QC_PENDING → READY|QC_FAILED) + append provenance. No scheduling.
    GenerationVerdictService,
    // P5-4b — publish a READY generation (→ PUBLISHED) + supersede prior + repoint slide. Service-only (no controller).
    SlidePublicationService,
    // P5-5A-ii — delivery-session runtime (issue/redeem/revoke) + published resolver. Service-only (no HTTP/delivery).
    { provide: DELIVERY_SESSION_CONFIG, useFactory: () => loadDeliverySessionConfig() },
    PublishedGenerationResolver,
    DeliverySessionService,
    // P5-5B-i — the delivery-capability credential boundary for artifact routes.
    DeliveryTokenGuard,
    // P5-5B-ii — resolve + stream permitted immutable derivative artifacts (descriptor/tile/manifest/associated).
    ArtifactDeliveryService,
    SlideProcessingQueueService,
    JobLeaseService,
    SlideProcessingScheduler,
    // P5-6.1 — read-only clinical review projection (no mutation / delivery / publication).
    SlideReviewService,
    // P5-6.3 — HTTP publication envelope (tenancy gate + audit) over the frozen SlidePublicationService.
    SlidePublishService,
  ],
  exports: [WsiService, SlideIngestionService, SlideProcessingQueueService, JobLeaseService],
})
export class WsiModule {}
