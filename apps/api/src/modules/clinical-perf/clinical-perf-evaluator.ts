import { createHash } from 'node:crypto';
import { AiModelLifecycleState, ClinicalPerfCohort, ClinicalPerfCoverageStatus, ClinicalPerfEvidenceProvenance, ClinicalPerfMetricKind, HumanReviewDecisionType, InferenceOutcome } from '@prisma/client';
import { classifyCoverage } from './clinical-perf-metrics';

/**
 * Program 6 · Phase 6H — the clinical-performance EVALUATOR boundary. The engine materializes the member population +
 * snapshots and records MEASUREMENT evidence; it depends ONLY on this interface. The default evaluator is a
 * DETERMINISTIC, NON-CLINICAL stub. OBSERVED metrics are aggregations of REAL members (human-review decisions +
 * inference outcomes + the window's own duration); operational KPIs the stub cannot ground from the AI-evidence layers
 * (turnaround/review-duration — which would require reference-only Program-5 operational timing not read here) are
 * UNAVAILABLE; workload-reduction is a SYNTHETIC_STUB estimate. Agreement + concordance are CONSISTENCY measures, NEVER
 * correctness/validity/safety/effectiveness. Identical inputs → identical output + calculationId. NO recommendation.
 */
export interface CpMember {
  readonly source: 'INFERENCE_RECORD' | 'HUMAN_REVIEW_DECISION';
  readonly inferenceRecordId: string | null;
  readonly humanReviewDecisionId: string | null;
  readonly outcome: InferenceOutcome | null; // for inference members
  readonly reviewDecision: HumanReviewDecisionType | null; // for review members
  readonly subjectInferenceRecordId: string | null; // the inference a decision reviewed (grouping key)
}
export interface CpModelSnapshot {
  readonly modelVersionUuid: string;
  readonly modelUuid: string;
  readonly lifecycleState: AiModelLifecycleState;
}
export interface ClinicalPerfRunRequest {
  readonly model: CpModelSnapshot;
  readonly cohort: ClinicalPerfCohort;
  readonly members: CpMember[];
  readonly windowStart: string; // ISO
  readonly windowEnd: string; // ISO
  readonly timeBasis: string;
  readonly windowDefinitionVersion: string;
  readonly baselineCalculationId: string | null;
  readonly operationalDataUsed: boolean;
  readonly configDigest: string | null;
  readonly windowDurationHours: number;
}

export interface GeneratedCpMetric {
  metricKind: ClinicalPerfMetricKind;
  provenance: ClinicalPerfEvidenceProvenance;
  cohort: ClinicalPerfCohort;
  sourceSubsystem: string;
  binCode?: string | null;
  value?: number | null;
  numeratorSource?: string | null;
  denominatorSource?: string | null;
  unit?: string | null;
  sampleCount?: number | null;
  unavailableReason?: string | null;
  ordinal: number;
}
export interface GeneratedClinicalPerf {
  calculationId: string;
  coverageStatus: ClinicalPerfCoverageStatus;
  metrics: GeneratedCpMetric[];
}

export interface ClinicalPerfEvaluator {
  readonly evaluatorId: string;
  readonly evaluatorVersion: string;
  evaluate(req: ClinicalPerfRunRequest): Promise<GeneratedClinicalPerf>;
}

const sha = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const unit01 = (seed: string, salt: string): number => Number(((parseInt(sha({ seed, salt }).slice(0, 8), 16) % 1_000_000) / 1_000_000).toFixed(4));
const r4 = (n: number): number => Number(n.toFixed(4));

export class StubClinicalPerfEvaluator implements ClinicalPerfEvaluator {
  readonly evaluatorId = 'stub';
  readonly evaluatorVersion = '1.0.0';

  async evaluate(req: ClinicalPerfRunRequest): Promise<GeneratedClinicalPerf> {
    const c = req.cohort;
    const n = req.members.length;
    const coverageStatus = classifyCoverage(n);
    const calculationId = sha({
      evaluatorId: this.evaluatorId, evaluatorVersion: this.evaluatorVersion, model: req.model, cohort: c,
      members: req.members.map((m) => `${m.source}:${m.inferenceRecordId ?? m.humanReviewDecisionId}`).sort(),
      windowStart: req.windowStart, windowEnd: req.windowEnd, timeBasis: req.timeBasis, windowDefinitionVersion: req.windowDefinitionVersion,
      baselineCalculationId: req.baselineCalculationId, operationalDataUsed: req.operationalDataUsed, configDigest: req.configDigest,
    });

    const decisions = req.members.filter((m) => m.source === 'HUMAN_REVIEW_DECISION');
    const inferences = req.members.filter((m) => m.source === 'INFERENCE_RECORD');
    const metrics: GeneratedCpMetric[] = [];
    let ord = 0;
    const push = (m: Omit<GeneratedCpMetric, 'ordinal' | 'cohort'>) => { metrics.push({ ...m, cohort: c, ordinal: ord++ }); };
    const na = (metricKind: ClinicalPerfMetricKind, sourceSubsystem: string, reason: string, binCode?: string) => push({ metricKind, provenance: 'UNAVAILABLE', sourceSubsystem, value: null, binCode: binCode ?? null, unavailableReason: reason });

    // WORKLOAD_COUNT is always OBSERVED — even 0 is a real observation.
    push({ metricKind: 'WORKLOAD_COUNT', provenance: 'OBSERVED', sourceSubsystem: '6c+6e', value: n, unit: 'count', sampleCount: n, numeratorSource: 'window.members', denominatorSource: null });

    if (n === 0) {
      na('OPERATIONAL_THROUGHPUT', '6c+6e', 'no members in the window');
      na('READER_AGREEMENT', '6e', 'no human-review decisions in the window');
      na('CONCORDANCE', '6c+6e', 'no evidence to compare in the window');
      na('REVIEW_DURATION', '6e', 'review timing not read (AI-evidence layer only)');
      na('TURNAROUND_DURATION', 'program5-operational', 'operational timing not read (operationalDataUsed=false)');
      na('WORKLOAD_REDUCTION', 'synthetic', 'insufficient evidence');
      return { calculationId, coverageStatus, metrics };
    }

    // OPERATIONAL_THROUGHPUT = members / window-hours (OBSERVED — from the window definition + count).
    if (req.windowDurationHours > 0) push({ metricKind: 'OPERATIONAL_THROUGHPUT', provenance: 'OBSERVED', sourceSubsystem: '6c+6e', value: r4(n / req.windowDurationHours), unit: 'per-hour', numeratorSource: 'window.members', denominatorSource: 'window.durationHours', sampleCount: n });
    else na('OPERATIONAL_THROUGHPUT', '6c+6e', 'window duration is zero');

    // READER_AGREEMENT — consistency among human-review decisions (modal fraction). NOT correctness (Decision 5).
    if (decisions.length >= 1) {
      const byType = decisions.reduce((acc, d) => { const k = d.reviewDecision ?? 'UNKNOWN'; acc[k] = (acc[k] ?? 0) + 1; return acc; }, {} as Record<string, number>);
      const modal = Math.max(...Object.values(byType));
      push({ metricKind: 'READER_AGREEMENT', provenance: 'OBSERVED', sourceSubsystem: '6e', value: r4(modal / decisions.length), unit: 'fraction', numeratorSource: 'decisions.modal', denominatorSource: 'decisions.total', sampleCount: decisions.length });
      // CONCORDANCE — consistency of the human ACCEPT with the AI-produced output. NOT correctness (Decision 6).
      const accepts = decisions.filter((d) => d.reviewDecision === 'ACCEPT').length;
      push({ metricKind: 'CONCORDANCE', provenance: 'OBSERVED', sourceSubsystem: '6c+6e', value: r4(accepts / decisions.length), unit: 'fraction', numeratorSource: 'decisions.ACCEPT', denominatorSource: 'decisions.total', sampleCount: decisions.length });
    } else {
      na('READER_AGREEMENT', '6e', 'no human-review decisions in the window');
      na('CONCORDANCE', '6c+6e', 'no human-review decisions to compare');
    }

    // REVIEW_DURATION / TURNAROUND_DURATION require timing not in the AI-evidence member snapshot / require reference-
    // only Program-5 operational timing (not read here) → UNAVAILABLE (no invented values).
    na('REVIEW_DURATION', '6e', 'review start/end timing not in scope for the stub');
    if (req.operationalDataUsed) na('TURNAROUND_DURATION', 'program5-operational', 'operational timing read but not computed by the stub');
    else na('TURNAROUND_DURATION', 'program5-operational', 'operational timing not read (operationalDataUsed=false)');

    // WORKLOAD_REDUCTION is a SYNTHETIC_STUB estimate — never presented as observed.
    push({ metricKind: 'WORKLOAD_REDUCTION', provenance: 'SYNTHETIC_STUB', sourceSubsystem: 'synthetic', value: unit01(calculationId, 'reduction'), unit: 'fraction', numeratorSource: null, denominatorSource: null, sampleCount: inferences.length });

    return { calculationId, coverageStatus, metrics };
  }
}
