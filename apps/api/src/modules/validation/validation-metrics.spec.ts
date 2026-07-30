import { isValidatableLifecycle, validateScalarMetric, validateConfusionCell, validateCurvePoint, RATIO_METRIC_KINDS } from './validation-metrics';

/** Program 6 · Phase 6F — pure metric-bounding + eligibility rules. */
describe('P6-6F validation metrics', () => {
  it('permits only VALIDATION/APPROVED model lifecycle states', () => {
    expect(isValidatableLifecycle('VALIDATION')).toBe(true);
    expect(isValidatableLifecycle('APPROVED')).toBe(true);
    for (const s of ['DRAFT', 'DEPRECATED', 'RETIRED'] as const) expect(isValidatableLifecycle(s)).toBe(false);
  });

  it('bounds ratio metrics to [0,1]', () => {
    expect(RATIO_METRIC_KINDS).toContain('SENSITIVITY');
    expect(validateScalarMetric({ metricKind: 'SENSITIVITY', value: 0.9 })).toBeNull();
    expect(validateScalarMetric({ metricKind: 'PRECISION', value: 1.5 })).toMatch(/\[0,1\]/);
    expect(validateScalarMetric({ metricKind: 'RECALL', value: -0.1 })).toMatch(/\[0,1\]/);
    expect(validateScalarMetric({ metricKind: 'F_SCORE', value: NaN })).toMatch(/\[0,1\]/);
    // structural kinds carry no scalar value
    expect(validateScalarMetric({ metricKind: 'CONFUSION_MATRIX' })).toBeNull();
    expect(validateScalarMetric({ metricKind: 'ROC_POINT' })).toBeNull();
  });

  it('requires non-negative integer confusion counts + coded classes', () => {
    expect(validateConfusionCell({ trueClassCode: 'a', predClassCode: 'b', count: 3 })).toBeNull();
    expect(validateConfusionCell({ trueClassCode: 'a', predClassCode: 'b', count: -1 })).toMatch(/non-negative/);
    expect(validateConfusionCell({ trueClassCode: 'a', predClassCode: 'b', count: 1.5 })).toMatch(/integer/);
    expect(validateConfusionCell({ trueClassCode: '', predClassCode: 'b', count: 1 })).toMatch(/coded/);
  });

  it('bounds curve-point coordinates + threshold to [0,1]', () => {
    expect(validateCurvePoint({ curveKind: 'ROC_POINT', x: 0.2, y: 0.8, threshold: 0.5 })).toBeNull();
    expect(validateCurvePoint({ curveKind: 'CALIBRATION_POINT', x: 1.2, y: 0.5 })).toMatch(/\[0,1\]/);
    expect(validateCurvePoint({ curveKind: 'ROC_POINT', x: 0.5, y: 0.5, threshold: 9 })).toMatch(/threshold/);
    expect(validateCurvePoint({ curveKind: 'SENSITIVITY' as any, x: 0.5, y: 0.5 })).toMatch(/ROC_POINT or CALIBRATION_POINT/);
  });
});
