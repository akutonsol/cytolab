import { LabContext } from '../../common/tenancy/lab-context';
import { ExecutionContextService } from '../../common/execution-context/execution-context.service';
import {
  PhiAccessDedup,
  aggregateDedupeKey,
  checkAndMark,
  singleSubjectDedupeKey,
} from './phi-access-dedup';

// ---------------------------------------------------------------------------
// Pure layer (explicit Set = one execution). A different Set models a different execution.
// ---------------------------------------------------------------------------
describe('phi-access dedupe — pure keys + checkAndMark', () => {
  it('single-subject key is deterministic and surface/patient-scoped', () => {
    expect(singleSubjectDedupeKey('p1', 'record_detail')).toBe(singleSubjectDedupeKey('p1', 'record_detail'));
    expect(singleSubjectDedupeKey('p1', 'record_detail')).not.toBe(singleSubjectDedupeKey('p2', 'record_detail'));
    expect(singleSubjectDedupeKey('p1', 'record_detail')).not.toBe(singleSubjectDedupeKey('p1', 'report_pdf'));
  });

  it('single/aggregate namespaces do not collide', () => {
    expect(aggregateDedupeKey('PATIENT_LIST_QUERIED', 'list')).not.toBe(
      singleSubjectDedupeKey('PATIENT_LIST_QUERIED', 'list' as any),
    );
  });

  it('first mark emits, duplicate skips', () => {
    const seen = new Set<string>();
    const k = singleSubjectDedupeKey('p1', 'record_detail');
    expect(checkAndMark(seen, k)).toBe(true);
    expect(checkAndMark(seen, k)).toBe(false);
  });

  it('a different Set (execution) emits again', () => {
    const k = singleSubjectDedupeKey('p1', 'record_detail');
    expect(checkAndMark(new Set(), k)).toBe(true);
    expect(checkAndMark(new Set(), k)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Provider layer (real ExecutionContext) — proves request-local scoping, no global leakage.
// ---------------------------------------------------------------------------
function setup() {
  const labContext = new LabContext();
  const execCtx = new ExecutionContextService(labContext);
  const dedup = new PhiAccessDedup(execCtx);
  return { labContext, dedup };
}

describe('PhiAccessDedup — request-scoped via ExecutionContext', () => {
  it('single-subject: first emits, exact repeat skips, different patient/surface emit', async () => {
    const { labContext, dedup } = setup();
    await labContext.runScoped({}, async () => {
      expect(dedup.shouldEmitSingleSubject({ patientRef: 'p1', accessSurface: 'record_detail' })).toBe(true);
      expect(dedup.shouldEmitSingleSubject({ patientRef: 'p1', accessSurface: 'record_detail' })).toBe(false);
      expect(dedup.shouldEmitSingleSubject({ patientRef: 'p2', accessSurface: 'record_detail' })).toBe(true);
      expect(dedup.shouldEmitSingleSubject({ patientRef: 'p1', accessSurface: 'report_pdf' })).toBe(true);
    });
  });

  it('aggregate: duplicate in one execution skips; list and search stay distinct', async () => {
    const { labContext, dedup } = setup();
    await labContext.runScoped({}, async () => {
      expect(dedup.shouldEmitAggregate({ actionCode: 'PATIENT_LIST_QUERIED', accessSurface: 'list' })).toBe(true);
      expect(dedup.shouldEmitAggregate({ actionCode: 'PATIENT_LIST_QUERIED', accessSurface: 'list' })).toBe(false);
      expect(dedup.shouldEmitAggregate({ actionCode: 'PATIENT_LIST_QUERIED', accessSurface: 'search' })).toBe(true);
    });
  });

  it('nested owner calls share the same execution seen-set', async () => {
    const { labContext, dedup } = setup();
    await labContext.runScoped({}, async () => {
      expect(dedup.shouldEmitSingleSubject({ patientRef: 'p1', accessSurface: 'record_detail' })).toBe(true);
      // a nested helper call in the SAME store must see the mark
      await (async () => {
        expect(dedup.shouldEmitSingleSubject({ patientRef: 'p1', accessSurface: 'record_detail' })).toBe(false);
      })();
    });
  });

  it('a different execution (new store) re-emits — no global leakage', async () => {
    const { labContext, dedup } = setup();
    await labContext.runScoped({}, async () => {
      expect(dedup.shouldEmitSingleSubject({ patientRef: 'p1', accessSurface: 'record_detail' })).toBe(true);
    });
    await labContext.runScoped({}, async () => {
      expect(dedup.shouldEmitSingleSubject({ patientRef: 'p1', accessSurface: 'record_detail' })).toBe(true);
    });
  });

  it('outside any execution store, it emits (safe default, no crash)', () => {
    const { dedup } = setup();
    expect(dedup.shouldEmitSingleSubject({ patientRef: 'p1', accessSurface: 'record_detail' })).toBe(true);
  });
});
