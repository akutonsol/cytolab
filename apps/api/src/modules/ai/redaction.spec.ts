import {
  assembleRedactedPayload,
  collectStringValues,
  digestPayload,
  RedactionInput,
} from './redaction';

/**
 * SAFETY TEST (the highest-value test in F4): whatever we send to the Anthropic
 * API must NEVER contain a patient identifier. We plant identifiers everywhere —
 * demographics AND inside free-text clinical fields — and assert none survive,
 * across both Gyn and NonGyn result sheets. Pure unit test: no DB, no network.
 */
describe('AI redaction assembler (allowlist)', () => {
  const REF = new Date('2026-07-01T00:00:00Z');

  // Identifiers that must NEVER appear anywhere in the payload.
  const GYN_IDENTIFIERS = [
    'Maria', 'Sanchez', 'Lucia', 'REG-55501', '55501',
    'maria.sanchez@mail.com', '8765550000', 'Delgado',
    '1979-03-10', '2026-06-01', // DOB and LMP absolute dates
  ];

  const gynInput = (policy: 'Strict' | 'Standard'): RedactionInput => ({
    policy,
    caseRef: 'CASE-1',
    formType: 'Gynecology',
    specimenTypes: ['CERV_SCRAP', 'ENDOCERV_ASP'],
    referenceDate: REF,
    patient: {
      firstName: 'Maria', lastName: 'Sanchez', middleName: 'Lucia', registrationNo: 'REG-55501',
      email: 'maria.sanchez@mail.com', phoneNumber: '8765550000', motherMaidenName: 'Delgado',
      dateOfBirth: '1979-03-10', gender: 'Female',
    },
    gynFeatures: {
      routineCheck: true, previousCytology: false, nowPregnant: false, menopause: true, pregnancies: 3,
      lengthOfCycle: '28',
      clinicalAppearanceOfCervix: 'Sanchez cervix appears healthy', // planted last name
      leucorrhea: null,
      pelvicAbnormalities: 'none noted by Maria', // planted first name
      lmp: '2026-06-01', // planted absolute date
    },
    resultEntries: [
      {
        specimenType: 'CERV_SCRAP',
        resultLines: [{ abbreviation: 'NC SS', findings: 'scant cellularity; patient ref REG-55501', abnormalFinding: false }],
      },
    ],
    codeDescriptions: { 'NC SS': 'NO CELLS SEEN ON SLIDE' },
    labCodes: [{ code: 'CBL', region: 'Kingston' }],
  });

  const NONGYN_IDENTIFIERS = ['Kwame', 'Osei', 'REG-88802', '88802', 'kwame.osei@mail.com', '8765559999'];

  const nonGynInput: RedactionInput = {
    policy: 'Strict',
    caseRef: 'CASE-2',
    formType: 'NonGynecology',
    specimenTypes: ['BREAST_ASP'],
    referenceDate: REF,
    patient: {
      firstName: 'Kwame', lastName: 'Osei', registrationNo: 'REG-88802',
      email: 'kwame.osei@mail.com', phoneNumber: '8765559999', dateOfBirth: '1990-01-01', gender: 'Male',
    },
    nonGynFeatures: {
      sampleDescription: 'Aspirate from Kwame Osei, left breast', // planted name
      natureAndSource: 'FNA submitted for Osei', // planted name
    },
    resultEntries: [
      { specimenType: 'BREAST_ASP', resultLines: [{ abbreviation: 'BENIGN', findings: 'benign; chart REG-88802', abnormalFinding: false }] },
    ],
    codeDescriptions: { BENIGN: 'BENIGN EPITHELIAL CELLS' },
    labCodes: [{ code: 'MCL', region: 'St. Andrew' }],
  };

  const ALLOWED_TOP_KEYS = ['caseRef', 'formType', 'specimens', 'demographics', 'clinicalFeatures', 'codedResults', 'labCodes', 'narrative'];

  const assertNoIdentifiers = (payload: unknown, identifiers: string[]) => {
    const haystack = collectStringValues(payload).join('  ').toLowerCase();
    for (const id of identifiers) {
      expect(haystack).not.toContain(id.toLowerCase());
    }
  };

  it('Gyn (Strict): emits only allowlisted keys and no identifier survives', () => {
    const p = assembleRedactedPayload(gynInput('Strict'));

    // Only allowlisted top-level keys.
    expect(Object.keys(p).every((k) => ALLOWED_TOP_KEYS.includes(k))).toBe(true);
    // No identifier anywhere — including the ones planted in free text.
    assertNoIdentifiers(p, GYN_IDENTIFIERS);
    // Free-text was scrubbed, not dropped, so the clinician's note is preserved sans name.
    expect(p.clinicalFeatures?.cervixAppearance).toContain('[redacted]');
    expect(p.clinicalFeatures?.pelvicAbnormalities).toContain('[redacted]');
    // LMP became a relative interval, never a date.
    expect(typeof p.clinicalFeatures?.lmpIntervalDays).toBe('number');
    expect(Object.keys(p.clinicalFeatures ?? {})).not.toContain('lmp');
    // Strict => no demographics; region omitted from lab codes.
    expect(p.demographics).toBeUndefined();
    expect(p.labCodes[0]).toEqual({ code: 'CBL' });
    // caseRef is the opaque token.
    expect(p.caseRef).toBe('CASE-1');
    // The coded result kept its clinical content + catalog description.
    expect(p.codedResults[0].codes[0].description).toBe('NO CELLS SEEN ON SLIDE');
  });

  it('Gyn (Standard): adds ONLY de-identified sex + age band, still no identifiers', () => {
    const p = assembleRedactedPayload(gynInput('Standard'));
    expect(p.demographics).toEqual({ sex: 'F', ageBand: '40-49' });
    // Age band, never the exact age or DOB.
    assertNoIdentifiers(p, [...GYN_IDENTIFIERS, '47', '1979']);
    // Region is a lab tag, not a patient identifier — allowed under Standard.
    expect(p.labCodes[0]).toEqual({ code: 'CBL', region: 'Kingston' });
  });

  it('NonGyn (Strict): scrubs identifiers from sampleDescription / natureAndSource', () => {
    const p = assembleRedactedPayload(nonGynInput);
    expect(Object.keys(p).every((k) => ALLOWED_TOP_KEYS.includes(k))).toBe(true);
    assertNoIdentifiers(p, NONGYN_IDENTIFIERS);
    expect(p.clinicalFeatures?.sampleDescription).toContain('[redacted]');
    expect(p.clinicalFeatures?.natureAndSource).toContain('[redacted]');
    expect(p.demographics).toBeUndefined();
  });

  it('digest is stable and content-addressed', () => {
    const a = digestPayload(assembleRedactedPayload(gynInput('Strict')));
    const b = digestPayload(assembleRedactedPayload(gynInput('Strict')));
    expect(a).toBe(b);
    expect(a).toHaveLength(64); // sha256 hex
    expect(a).not.toBe(digestPayload(assembleRedactedPayload(gynInput('Standard'))));
  });
});
