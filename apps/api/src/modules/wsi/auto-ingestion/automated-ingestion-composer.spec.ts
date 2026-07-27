import { AutomatedIngestionComposer } from './automated-ingestion-composer';

// The composer reuses the ACCEPTED 5A seams (injected) and must never fabricate an association.
const ingestion = {} as any; // SlideIngestionService (byte flow is B2)
const queue = {} as any; // SlideProcessingQueueService.enqueueForIngestion (B2)

describe('P5B-B1 AutomatedIngestionComposer — truthful handoff precondition', () => {
  const composer = new AutomatedIngestionComposer(ingestion, queue);

  it('allows handoff only for a uniquely MATCHED discovery with a record', () => {
    expect(composer.assertHandoffReady({ id: 'd1', status: 'MATCHED', matchedRecordId: 'rec-1' })).toEqual({ recordId: 'rec-1', specimenId: null });
  });

  it('carries an explicitly matched specimen when present (else record-level/null)', () => {
    expect(composer.assertHandoffReady({ id: 'd2', status: 'MATCHED', matchedRecordId: 'rec-1', matchedSpecimenId: 'spec-9' })).toEqual({ recordId: 'rec-1', specimenId: 'spec-9' });
  });

  it.each(['UNMATCHED', 'AMBIGUOUS', 'STABILIZING', 'DUPLICATE', 'FAILED', 'DISCOVERED'])(
    'refuses handoff for non-unique status %s (no fabricated association)',
    (status) => {
      expect(() => composer.assertHandoffReady({ id: 'd', status, matchedRecordId: null })).toThrow();
    },
  );

  it('refuses handoff when status is MATCHED but no record id is present', () => {
    expect(() => composer.assertHandoffReady({ id: 'd', status: 'MATCHED', matchedRecordId: null })).toThrow();
  });

  it('injects the accepted 5A ingestion + queue seams (no second processing path)', () => {
    expect((composer as any).ingestion).toBe(ingestion);
    expect((composer as any).queue).toBe(queue);
  });
});
