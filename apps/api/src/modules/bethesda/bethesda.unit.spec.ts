/**
 * Program 3 · C7 — Bethesda pure-unit suite (no DB).
 *
 * Deterministic unit tests for the exported pure functions `deriveShortCode` and `generateNarrative`,
 * per the frozen C7 design (docs/PROGRAM_3_C7_BETHESDA_TEST_DESIGN.md, commit 490c862). Assertions match
 * the IMPLEMENTATION TRUTH only — no invented clinical rules, no invented short-code mappings, no
 * additional narrative validation. Where the implementation yields null/partial output (SD-3/SD-4), that
 * is asserted as the actual output, not as a desired clinical contract.
 */
import { deriveShortCode, generateNarrative, type BethesdaSelections } from './bethesda.service';

const sel = (o: Partial<BethesdaSelections>): BethesdaSelections => ({ specimenAdequacy: 'Satisfactory', ...o });

describe('deriveShortCode (C7 unit)', () => {
  it('Unsatisfactory → UNSAT', () => {
    expect(deriveShortCode(sel({ specimenAdequacy: 'Unsatisfactory' }))).toBe('UNSAT');
  });
  it('NILM → NILM', () => {
    expect(deriveShortCode(sel({ generalCategory: 'NILM' }))).toBe('NILM');
  });
  it('ASC + ASCUS → ASCUS; ASC + ASCH → ASC-H', () => {
    expect(deriveShortCode(sel({ squamousCategory: 'ASC', ascSubtype: 'ASCUS' }))).toBe('ASCUS');
    expect(deriveShortCode(sel({ squamousCategory: 'ASC', ascSubtype: 'ASCH' }))).toBe('ASC-H');
  });
  it('LSIL / HSIL / SCC map to their own code', () => {
    expect(deriveShortCode(sel({ squamousCategory: 'LSIL' }))).toBe('LSIL');
    expect(deriveShortCode(sel({ squamousCategory: 'HSIL' }))).toBe('HSIL');
    expect(deriveShortCode(sel({ squamousCategory: 'SCC' }))).toBe('SCC');
  });
  it('a glandular category → AGUS', () => {
    expect(deriveShortCode(sel({ glandularCategory: 'AGC' }))).toBe('AGUS');
  });
  it('OtherMalignancy (no squamous) → MALIG', () => {
    expect(deriveShortCode(sel({ generalCategory: 'OtherMalignancy' }))).toBe('MALIG');
  });
  it('EpithelialAbnormality with no squamous/glandular → null (actual output, SD-3)', () => {
    expect(deriveShortCode(sel({ generalCategory: 'EpithelialAbnormality' }))).toBeNull();
  });
  it('an unmatched satisfactory selection → null', () => {
    expect(deriveShortCode(sel({}))).toBeNull();
  });
});

describe('generateNarrative (C7 unit)', () => {
  it('Unsatisfactory short-circuits to adequacy + recommendation (with default RepeatSpecimen)', () => {
    const out = generateNarrative(sel({ specimenAdequacy: 'Unsatisfactory', unsatisfactoryReason: 'obscuring blood' }));
    expect(out).toContain('SPECIMEN ADEQUACY: Unsatisfactory for evaluation — obscuring blood');
    expect(out).toContain('RECOMMENDATION: Repeat specimen collection recommended.');
    // Unsatisfactory short-circuits before general categorization.
    expect(out).not.toContain('GENERAL CATEGORIZATION');
  });

  it('Satisfactory NILM composes adequacy + general categorization + interpretation + organisms', () => {
    const out = generateNarrative(sel({ generalCategory: 'NILM', organisms: ['Candida', 'BV'] }));
    expect(out).toContain('SPECIMEN ADEQUACY: Satisfactory for evaluation');
    expect(out).toContain('GENERAL CATEGORIZATION: Negative for Intraepithelial Lesion or Malignancy');
    expect(out).toContain('Negative for intraepithelial lesion or malignancy.');
    expect(out).toContain('Organisms identified: Candida, BV.');
  });

  it('Satisfactory epithelial abnormality renders the squamous interpretation text', () => {
    const out = generateNarrative(sel({ generalCategory: 'EpithelialAbnormality', squamousCategory: 'LSIL' }));
    expect(out).toContain('Low-grade squamous intraepithelial lesion (LSIL).');
  });

  it('renders the HPV and recommendation blocks when present', () => {
    const out = generateNarrative(sel({ generalCategory: 'NILM', hpvResult: 'Positive', recommendation: 'Colposcopy' }));
    expect(out).toContain('HPV TESTING: Positive');
    expect(out).toContain('RECOMMENDATION: Colposcopy recommended. Clinical correlation advised.');
  });
});
