import { Module } from '@nestjs/common';
import { InferenceEngineService } from './inference-engine.service';
import { InferenceEngineController } from './inference-engine.controller';
import { InferenceLeaseService } from './inference-lease.service';
import { InferenceWorkerRuntime } from './inference-worker-runtime';
import { INFERENCE_ADAPTER, INFERENCE_CONFIG } from './inference-tokens';
import { loadInferenceConfig } from './inference-config';
import { StubInferenceAdapter } from './inference-adapter';

/**
 * Program 6 · Phase 6C — inference execution engine. Parallel to the 6A registry + 6B datasets (both untouched).
 * PrismaService + AuditRecorder come from their @Global modules. The adapter is a pluggable provider (Decision 9);
 * only the deterministic, non-clinical stub ships in 6C. The background worker is DISABLED by default and never
 * runs under test (Decision 6); manual dispatch + the permissioned drain are always available. No dataset-driven
 * orchestration, no diagnostic logic, no validation metrics.
 */
@Module({
  controllers: [InferenceEngineController],
  providers: [
    InferenceEngineService,
    InferenceLeaseService,
    InferenceWorkerRuntime,
    { provide: INFERENCE_CONFIG, useFactory: () => loadInferenceConfig() },
    { provide: INFERENCE_ADAPTER, useClass: StubInferenceAdapter },
  ],
  exports: [InferenceEngineService],
})
export class InferenceEngineModule {}
