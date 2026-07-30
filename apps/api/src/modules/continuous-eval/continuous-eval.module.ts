import { Module } from '@nestjs/common';
import { ContinuousEvalService } from './continuous-eval.service';
import { ContinuousEvalController } from './continuous-eval.controller';
import { CONTINUOUS_EVALUATOR } from './continuous-eval-tokens';
import { StubContinuousEvaluator } from './continuous-evaluator';

/**
 * Program 6 · Phase 6G — continuous evaluation evidence. Parallel to 6A–6F (all untouched) and SEPARATE from model
 * lifecycle + the clinical path. PrismaService + AuditRecorder come from their @Global modules. The evaluator is a
 * pluggable provider; only the deterministic non-clinical stub ships in 6G. MANUAL runs only — NO worker, NO
 * scheduler, NO automation. No support lifecycle mutation; no automatic retirement; no support inference/clinical.
 */
@Module({
  controllers: [ContinuousEvalController],
  providers: [
    ContinuousEvalService,
    { provide: CONTINUOUS_EVALUATOR, useClass: StubContinuousEvaluator },
  ],
  exports: [ContinuousEvalService],
})
export class ContinuousEvalModule {}
