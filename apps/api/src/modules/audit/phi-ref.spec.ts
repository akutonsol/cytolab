import { derivePatientRef, InvalidPatientRefError } from './phi-ref';

const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

describe('derivePatientRef (P2-5B)', () => {
  it('accepts a valid UUID and returns it unchanged', () => {
    expect(derivePatientRef({ patientId: UUID })).toBe(UUID);
  });

  it('is deterministic', () => {
    expect(derivePatientRef({ patientId: UUID })).toBe(derivePatientRef({ patientId: UUID }));
  });

  it('rejects an empty value', () => {
    expect(() => derivePatientRef({ patientId: '' })).toThrow(InvalidPatientRefError);
    expect(() => derivePatientRef({ patientId: '   ' })).toThrow(InvalidPatientRefError);
  });

  it('rejects a malformed / non-UUID value', () => {
    expect(() => derivePatientRef({ patientId: 'not-a-uuid' })).toThrow(InvalidPatientRefError);
    expect(() => derivePatientRef({ patientId: '12345' })).toThrow(InvalidPatientRefError);
    // a registrationNo-shaped value (human MRN-equivalent) is NOT a UUID → rejected
    expect(() => derivePatientRef({ patientId: 'REG-000123' })).toThrow(InvalidPatientRefError);
  });

  it('rejects a non-string patientId', () => {
    expect(() => derivePatientRef({ patientId: undefined as any })).toThrow(InvalidPatientRefError);
    expect(() => derivePatientRef({ patientId: 123 as any })).toThrow(InvalidPatientRefError);
  });

  it('exposes no path to derive from registrationNo / name / DOB (only { patientId })', () => {
    // The function signature accepts ONLY { patientId }; any extra keys are ignored, never used.
    expect(derivePatientRef({ patientId: UUID, registrationNo: 'REG-1', name: 'Jane' } as any)).toBe(UUID);
  });
});
