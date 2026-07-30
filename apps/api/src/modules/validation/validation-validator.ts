import { createHash } from 'node:crypto';
import { AiModelLifecycleState, ValidationMetricKind } from '@prisma/client';

/**
 * Program 6 · Phase 6F — the VALIDATOR boundary. The engine binds a frozen dataset to a model version and records
 * evidence; it depends ONLY on this interface. The default validator is a DETERMINISTIC, NON-CLINICAL stub — it does
 * NOT compute real model performance and makes NO clinical/regulatory/accuracy claim. It derives synthetic-but-
 * self-consistent confusion counts from the (PHI-free) snapshot digests, then computes ratio metrics FROM those counts
 * so every metric has a real numerator/denominator provenance (Guardrail 3). Identical (model snapshot, dataset
 * snapshot, config digest) → identical output + calculationId (Guardrail 4). Concrete real validators are out of scope.
 */
export interface ValidationModelSnapshot {
  readonly modelVersionUuid: string;
  readonly modelUuid: string;
  readonly artifactDigest: string | null;
  readonly lifecycleState: AiModelLifecycleState;
}
export interface ValidationDatasetSnapshot {
  readonly datasetVersionId: string;
  readonly manifestDigest: string | null;
  readonly groundTruthDigest: string;
}
export interface ValidationRunRequest {
  readonly model: ValidationModelSnapshot;
  readonly dataset: ValidationDatasetSnapshot;
  readonly configDigest: string | null;
}

export interface GeneratedMetric {
  metricKind: ValidationMetricKind;
  labelClassCode?: string | null;
  value?: number | null;
  numeratorSource?: string | null;
  denominatorSource?: string | null;
  ordinal: number;
}
export interface GeneratedConfusionCell {
  trueClassCode: string;
  predClassCode: string;
  count: number;
}
export interface GeneratedCurvePoint {
  curveKind: ValidationMetricKind;
  x: number;
  y: number;
  threshold?: number | null;
  ordinal: number;
}
export interface GeneratedValidation {
  calculationId: string;
  metrics: GeneratedMetric[];
  confusionCells: GeneratedConfusionCell[];
  curvePoints: GeneratedCurvePoint[];
}

export interface ValidationValidator {
  readonly validatorId: string;
  readonly validatorVersion: string;
  validate(req: ValidationRunRequest): Promise<GeneratedValidation>;
}

const sha = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const unit = (seed: string, salt: string): number => (parseInt(sha({ seed, salt }).slice(0, 8), 16) % 1_000_000) / 1_000_000;
const r4 = (n: number): number => Number(n.toFixed(4));

export class StubValidationValidator implements ValidationValidator {
  readonly validatorId = 'stub';
  readonly validatorVersion = '1.0.0';

  async validate(req: ValidationRunRequest): Promise<GeneratedValidation> {
    const seed = sha({ validatorId: this.validatorId, validatorVersion: this.validatorVersion, model: req.model, dataset: req.dataset, configDigest: req.configDigest });
    const calculationId = seed;
    const A = 'class-a';
    const B = 'class-b';

    // Deterministic, self-consistent confusion counts (synthetic; NOT real predictions).
    const tp = 20 + Math.floor(unit(seed, 'tp') * 40); // [20,60)
    const fn = 1 + Math.floor(unit(seed, 'fn') * 15);
    const fp = 1 + Math.floor(unit(seed, 'fp') * 15);
    const tn = 20 + Math.floor(unit(seed, 'tn') * 40);
    const confusionCells: GeneratedConfusionCell[] = [
      { trueClassCode: A, predClassCode: A, count: tp },
      { trueClassCode: A, predClassCode: B, count: fn },
      { trueClassCode: B, predClassCode: A, count: fp },
      { trueClassCode: B, predClassCode: B, count: tn },
    ];

    // Metrics computed FROM the counts — real numerator/denominator provenance (Guardrail 3).
    const sensitivity = tp / (tp + fn);
    const specificity = tn / (tn + fp);
    const precision = tp / (tp + fp);
    const recall = sensitivity;
    const fScore = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    const threshold = r4(unit(seed, 'threshold'));
    const metrics: GeneratedMetric[] = [
      { metricKind: 'SENSITIVITY', labelClassCode: A, value: r4(sensitivity), numeratorSource: `confusion[true=${A},pred=${A}]`, denominatorSource: `confusion[true=${A}]`, ordinal: 0 },
      { metricKind: 'SPECIFICITY', labelClassCode: A, value: r4(specificity), numeratorSource: `confusion[true=${B},pred=${B}]`, denominatorSource: `confusion[true=${B}]`, ordinal: 1 },
      { metricKind: 'PRECISION', labelClassCode: A, value: r4(precision), numeratorSource: `confusion[true=${A},pred=${A}]`, denominatorSource: `confusion[pred=${A}]`, ordinal: 2 },
      { metricKind: 'RECALL', labelClassCode: A, value: r4(recall), numeratorSource: `confusion[true=${A},pred=${A}]`, denominatorSource: `confusion[true=${A}]`, ordinal: 3 },
      { metricKind: 'F_SCORE', labelClassCode: A, value: r4(fScore), numeratorSource: '2*precision*recall', denominatorSource: 'precision+recall', ordinal: 4 },
      { metricKind: 'OPERATING_THRESHOLD', labelClassCode: null, value: threshold, numeratorSource: 'config', denominatorSource: null, ordinal: 5 },
    ];

    // Monotone ROC + calibration coordinates in [0,1] (deterministic).
    const mid = (salt: string) => r4(0.3 + unit(seed, salt) * 0.4); // interior point in (0.3,0.7)
    const curvePoints: GeneratedCurvePoint[] = [
      { curveKind: 'ROC_POINT', x: 0, y: 0, threshold: 1, ordinal: 0 },
      { curveKind: 'ROC_POINT', x: r4(1 - specificity), y: r4(sensitivity), threshold, ordinal: 1 },
      { curveKind: 'ROC_POINT', x: 1, y: 1, threshold: 0, ordinal: 2 },
      { curveKind: 'CALIBRATION_POINT', x: 0.25, y: mid('cal0'), ordinal: 0 },
      { curveKind: 'CALIBRATION_POINT', x: 0.5, y: mid('cal1'), ordinal: 1 },
      { curveKind: 'CALIBRATION_POINT', x: 0.75, y: mid('cal2'), ordinal: 2 },
    ];

    return { calculationId, metrics, confusionCells, curvePoints };
  }
}
