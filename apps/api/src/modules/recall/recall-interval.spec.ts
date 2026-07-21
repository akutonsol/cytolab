/**
 * Program 3 · C4 — recallIntervalFor pure-unit suite.
 *
 * Deterministic unit tests for the exported clinical interval derivation (no DB), per the frozen C4
 * design (docs/PROGRAM_3_C4_RECALL_TEST_DESIGN.md, commit 82bffb4): every Bethesda branch + precedence.
 * Intervals are month-based only. SD-2 (addMonths end-of-month overflow) is a service-layer date
 * concern and is not exercised here.
 */
import { recallIntervalFor } from './recall-interval';

describe('recallIntervalFor (C4 unit)', () => {
  it('returns null for null/undefined input', () => {
    expect(recallIntervalFor(null)).toBeNull();
    expect(recallIntervalFor(undefined)).toBeNull();
  });

  it('Unsatisfactory → repeat in 3 months', () => {
    expect(recallIntervalFor({ specimenAdequacy: 'Unsatisfactory' })).toEqual({ months: 3, diagnosis: 'UNSAT' });
  });

  it('Unsatisfactory takes precedence over any category', () => {
    // Even alongside a high-grade squamous category, Unsatisfactory is evaluated first.
    expect(recallIntervalFor({ specimenAdequacy: 'Unsatisfactory', squamousCategory: 'HSIL' })).toEqual({
      months: 3,
      diagnosis: 'UNSAT',
    });
  });

  it('high-grade / malignant squamous results → null (escalation, not recall)', () => {
    expect(recallIntervalFor({ squamousCategory: 'HSIL' })).toBeNull();
    expect(recallIntervalFor({ squamousCategory: 'SCC' })).toBeNull();
    expect(recallIntervalFor({ squamousCategory: 'ASC', ascSubtype: 'ASCH' })).toBeNull();
  });

  it('high-grade / malignant glandular + other-malignancy results → null', () => {
    expect(recallIntervalFor({ glandularCategory: 'AIS' })).toBeNull();
    expect(recallIntervalFor({ glandularCategory: 'Adenocarcinoma' })).toBeNull();
    expect(recallIntervalFor({ glandularCategory: 'AGC_FavorNeoplastic' })).toBeNull();
    expect(recallIntervalFor({ generalCategory: 'OtherMalignancy' })).toBeNull();
  });

  it('low-grade / atypical results → 12-month repeat', () => {
    expect(recallIntervalFor({ squamousCategory: 'ASC', ascSubtype: 'ASCUS' })).toEqual({ months: 12, diagnosis: 'ASC-US' });
    expect(recallIntervalFor({ squamousCategory: 'LSIL' })).toEqual({ months: 12, diagnosis: 'LSIL' });
    expect(recallIntervalFor({ glandularCategory: 'AGC' })).toEqual({ months: 12, diagnosis: 'AGC' });
  });

  it('NILM (normal) → 3-year routine recall', () => {
    expect(recallIntervalFor({ generalCategory: 'NILM' })).toEqual({ months: 36, diagnosis: 'NILM' });
  });

  it('a high-grade squamous result overrides an otherwise-normal general category (precedence)', () => {
    expect(recallIntervalFor({ generalCategory: 'NILM', squamousCategory: 'HSIL' })).toBeNull();
  });

  it('an unmatched classification → null', () => {
    expect(recallIntervalFor({})).toBeNull();
    expect(recallIntervalFor({ generalCategory: 'SomethingUnmapped' })).toBeNull();
  });
});
