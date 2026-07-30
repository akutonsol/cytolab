import { Module } from '@nestjs/common';
import { ClinicalPerfService } from './clinical-perf.service';
import { ClinicalPerfController } from './clinical-perf.controller';
import { CLINICAL_PERF_EVALUATOR } from './clinical-perf-tokens';
import { StubClinicalPerfEvaluator } from './clinical-perf-evaluator';

/**
 * Program 6 · Phase 6H — clinical performance measurement evidence (the FINAL phase). Parallel to 6A–6G (all
 * untouched) and SEPARATE from the clinical path (reference-only). PrismaService + AuditRecorder come from their
 * @Global modules. The evaluator is a pluggable provider; only the deterministic non-clinical stub ships in 6H.
 * MANUAL runs only — no worker/scheduler. No support diagnostic authority; no lifecycle/clinical mutation; no PHI;
 * no recommendation. Completing 6H does NOT declare Program 6 complete (a separate governance activity).
 */
@Module({
  controllers: [ClinicalPerfController],
  providers: [
    ClinicalPerfService,
    { provide: CLINICAL_PERF_EVALUATOR, useClass: StubClinicalPerfEvaluator },
  ],
  exports: [ClinicalPerfService],
})
export class ClinicalPerfModule {}
