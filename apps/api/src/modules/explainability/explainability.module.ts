import { Module } from '@nestjs/common';
import { ExplainabilityService } from './explainability.service';
import { ExplainabilityController } from './explainability.controller';
import { EXPLAINABILITY_GENERATOR } from './explainability-tokens';
import { StubExplainabilityGenerator } from './explainability-generator';

/**
 * Program 6 · Phase 6D — explainability. Parallel to the 6A registry / 6B datasets / 6C inference engine (all
 * untouched). PrismaService + AuditRecorder come from their @Global modules. The generator is a pluggable provider
 * (Decision 13); only the deterministic, non-clinical stub ships in 6D. Manual generation only — no worker, no
 * scheduler, no automatic/dataset trigger. No diagnostic logic, no validation metrics, no support inference.
 */
@Module({
  controllers: [ExplainabilityController],
  providers: [
    ExplainabilityService,
    { provide: EXPLAINABILITY_GENERATOR, useClass: StubExplainabilityGenerator },
  ],
  exports: [ExplainabilityService],
})
export class ExplainabilityModule {}
