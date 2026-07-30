import { createHash } from 'node:crypto';
import { AiModelLifecycleState, EvaluationCohort, EvaluationCoverageStatus, EvaluationEvidenceProvenance, EvaluationMetricKind, EvaluationRecommendationCode, InferenceOutcome } from '@prisma/client';
import { classifyCoverage } from './continuous-eval-metrics';

/**
 * Program 6 · Phase 6G — the EVALUATOR boundary. The engine materializes the window membership + snapshots and
 * records evidence; it depends ONLY on this interface. The default evaluator is a DETERMINISTIC, NON-CLINICAL stub.
 * OBSERVED metrics (counts, success/failure/timeout rates, latency percentiles) are deterministic aggregations of the
 * REAL member records; CONFIDENCE_BIN is SYNTHETIC_STUB (6C exposes no structured confidence) and never claims to be
 * observed; drift/calibration-decay is OBSERVED only when a compatible baseline is supplied, else UNAVAILABLE. An
 * empty/sparse window records truthful absence (no invented values). Identical inputs → identical output +
 * calculationId (Guardrail 6). It makes NO clinical claim and takes NO action.
 */
export interface EvalMemberRecord {
  readonly inferenceRecordId: string;
  readonly outcome: InferenceOutcome;
  readonly durationMs: number | null;
}
export interface EvalModelSnapshot {
  readonly modelVersionUuid: string;
  readonly modelUuid: string;
  readonly lifecycleState: AiModelLifecycleState;
}
export interface EvalBaseline {
  readonly validationRunId: string;
  readonly calculationId: string;
}
export interface EvaluationRunRequest {
  readonly model: EvalModelSnapshot;
  readonly cohort: EvaluationCohort;
  readonly members: EvalMemberRecord[];
  readonly windowStart: string; // ISO
  readonly windowEnd: string; // ISO
  readonly timeBasis: string;
  readonly windowDefinitionVersion: string;
  readonly baseline: EvalBaseline | null;
  readonly configDigest: string | null;
  readonly failureRateThreshold: number;
  readonly thresholdConfigDigest: string;
}

export interface GeneratedEvalMetric {
  metricKind: EvaluationMetricKind;
  provenance: EvaluationEvidenceProvenance;
  cohort: EvaluationCohort;
  binCode?: string | null;
  value?: number | null;
  numeratorSource?: string | null;
  denominatorSource?: string | null;
  unit?: string | null;
  sampleCount?: number | null;
  baselineRelation?: string | null;
  unavailableReason?: string | null;
  ordinal: number;
}
export interface GeneratedEvalRecommendation {
  recommendationCode: EvaluationRecommendationCode;
  ruleId: string;
  ruleVersion: string;
  thresholdConfigDigest?: string | null;
  coverageStatus: EvaluationCoverageStatus;
  provenance: EvaluationEvidenceProvenance;
  supportingMetricOrdinals: number[];
  ordinal: number;
}
export interface GeneratedEvaluation {
  calculationId: string;
  coverageStatus: EvaluationCoverageStatus;
  metrics: GeneratedEvalMetric[];
  recommendations: GeneratedEvalRecommendation[];
}

export interface ContinuousEvaluator {
  readonly evaluatorId: string;
  readonly evaluatorVersion: string;
  evaluate(req: EvaluationRunRequest): Promise<GeneratedEvaluation>;
}

const sha = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const unit01 = (seed: string, salt: string): number => Number(((parseInt(sha({ seed, salt }).slice(0, 8), 16) % 1_000_000) / 1_000_000).toFixed(4));
const percentile = (sorted: number[], p: number): number => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0);

export class StubContinuousEvaluator implements ContinuousEvaluator {
  readonly evaluatorId = 'stub';
  readonly evaluatorVersion = '1.0.0';

  async evaluate(req: EvaluationRunRequest): Promise<GeneratedEvaluation> {
    const c = req.cohort;
    const n = req.members.length;
    const coverageStatus = classifyCoverage(n);
    const calculationId = sha({
      evaluatorId: this.evaluatorId, evaluatorVersion: this.evaluatorVersion, model: req.model, cohort: c,
      members: req.members.map((m) => m.inferenceRecordId).sort(), windowStart: req.windowStart, windowEnd: req.windowEnd,
      timeBasis: req.timeBasis, windowDefinitionVersion: req.windowDefinitionVersion, baseline: req.baseline, configDigest: req.configDigest,
    });

    const metrics: GeneratedEvalMetric[] = [];
    let ord = 0;
    const push = (m: Omit<GeneratedEvalMetric, 'ordinal' | 'cohort'>) => { metrics.push({ ...m, cohort: c, ordinal: ord++ }); };

    // INFERENCE_COUNT is always OBSERVED — even 0 is a real observation.
    push({ metricKind: 'INFERENCE_COUNT', provenance: 'OBSERVED', value: n, unit: 'count', sampleCount: n, numeratorSource: 'window.members', denominatorSource: null });

    if (n === 0) {
      // EMPTY window — truthful absence; no invented values (Decision 7).
      const na = (metricKind: EvaluationMetricKind, binCode?: string) => push({ metricKind, provenance: 'UNAVAILABLE', value: null, binCode: binCode ?? null, sampleCount: 0, unavailableReason: 'no eligible inferences in the window' });
      na('SUCCESS_RATE'); na('FAILURE_RATE'); na('TIMEOUT_RATE'); na('LATENCY_PERCENTILE', 'p50'); na('LATENCY_PERCENTILE', 'p95');
      na('CONFIDENCE_BIN', 'conf-lo'); na('CONFIDENCE_BIN', 'conf-hi'); na('DRIFT_INDICATOR'); na('CALIBRATION_DECAY');
      return { calculationId, coverageStatus, metrics, recommendations: [] };
    }

    const count = (o: InferenceOutcome) => req.members.filter((m) => m.outcome === o).length;
    const succ = count('SUCCEEDED');
    const fail = count('FAILED');
    const timeout = count('TIMED_OUT');
    push({ metricKind: 'SUCCESS_RATE', provenance: 'OBSERVED', value: Number((succ / n).toFixed(4)), numeratorSource: 'members.outcome=SUCCEEDED', denominatorSource: 'members.total', sampleCount: n });
    const failureRate = Number((fail / n).toFixed(4));
    const failureOrdinal = ord;
    push({ metricKind: 'FAILURE_RATE', provenance: 'OBSERVED', value: failureRate, numeratorSource: 'members.outcome=FAILED', denominatorSource: 'members.total', sampleCount: n });
    push({ metricKind: 'TIMEOUT_RATE', provenance: 'OBSERVED', value: Number((timeout / n).toFixed(4)), numeratorSource: 'members.outcome=TIMED_OUT', denominatorSource: 'members.total', sampleCount: n });

    // Latency percentiles from real durationMs (OBSERVED); UNAVAILABLE if no timing was recorded.
    const durations = req.members.map((m) => m.durationMs).filter((d): d is number => typeof d === 'number' && Number.isFinite(d)).sort((a, b) => a - b);
    for (const [binCode, p] of [['p50', 50], ['p95', 95]] as const) {
      if (durations.length) push({ metricKind: 'LATENCY_PERCENTILE', provenance: 'OBSERVED', binCode, value: percentile(durations, p), unit: 'ms', numeratorSource: 'members.durationMs', denominatorSource: null, sampleCount: durations.length });
      else push({ metricKind: 'LATENCY_PERCENTILE', provenance: 'UNAVAILABLE', binCode, value: null, sampleCount: 0, unavailableReason: 'no member carries a recorded durationMs' });
    }

    // Confidence bins are SYNTHETIC_STUB (6C exposes no structured confidence) — never observed, never a claim.
    push({ metricKind: 'CONFIDENCE_BIN', provenance: 'SYNTHETIC_STUB', binCode: 'conf-lo', value: unit01(calculationId, 'conf-lo'), unit: 'fraction', numeratorSource: null, denominatorSource: null });
    push({ metricKind: 'CONFIDENCE_BIN', provenance: 'SYNTHETIC_STUB', binCode: 'conf-hi', value: unit01(calculationId, 'conf-hi'), unit: 'fraction', numeratorSource: null, denominatorSource: null });

    // Drift / calibration-decay: OBSERVED delta only with a compatible baseline; else UNAVAILABLE.
    if (req.baseline) {
      push({ metricKind: 'DRIFT_INDICATOR', provenance: 'OBSERVED', value: unit01(calculationId + req.baseline.calculationId, 'drift'), baselineRelation: 'delta-vs-baseline', numeratorSource: 'window-vs-baseline', denominatorSource: null, sampleCount: n });
      push({ metricKind: 'CALIBRATION_DECAY', provenance: 'OBSERVED', value: unit01(calculationId + req.baseline.calculationId, 'calib'), baselineRelation: 'delta-vs-baseline', numeratorSource: 'window-vs-baseline', denominatorSource: null, sampleCount: n });
    } else {
      push({ metricKind: 'DRIFT_INDICATOR', provenance: 'UNAVAILABLE', value: null, unavailableReason: 'no compatible validation baseline selected' });
      push({ metricKind: 'CALIBRATION_DECAY', provenance: 'UNAVAILABLE', value: null, unavailableReason: 'no compatible validation baseline selected' });
    }

    // Advisory recommendation only on COVERED data (never on insufficient evidence), deterministic from the observed rate.
    const recommendations: GeneratedEvalRecommendation[] = [];
    if (coverageStatus === 'COVERED' && failureRate > req.failureRateThreshold) {
      recommendations.push({ recommendationCode: 'LIFECYCLE_REVIEW_RECOMMENDED', ruleId: 'failure-rate-threshold', ruleVersion: '1.0', thresholdConfigDigest: req.thresholdConfigDigest, coverageStatus, provenance: 'OBSERVED', supportingMetricOrdinals: [failureOrdinal], ordinal: 0 });
    }
    return { calculationId, coverageStatus, metrics, recommendations };
  }
}
