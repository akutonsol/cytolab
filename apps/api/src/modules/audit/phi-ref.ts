/**
 * Program 2 · P2-5B — trusted patientRef derivation (inert foundation; no owner wiring).
 *
 * Governance decision (frozen): patientRef is the owner-derived internal `Patient.id` UUID —
 * never registrationNo, name, DOB, MRN, or any raw PHI, and never producer-supplied. This is a
 * PURE function: no database call, no hashing, no HMAC, no secrets, no logging. Cryptographic
 * pseudonymization (a salted token) is a deferred future hardening, out of scope here.
 */

/** Opaque branded type so a patientRef can't be confused with any other string at call sites. */
export type PatientRef = string & { readonly __brand: 'PatientRef' };

export class InvalidPatientRefError extends Error {
  constructor(message: string) {
    super(`Invalid patientRef derivation: ${message}`);
    this.name = 'InvalidPatientRefError';
  }
}

// Patient.id is a UUID (schema `@default(uuid())`). Accept canonical UUID form only.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Derive the audit patientRef from the internal patient id. Accepts ONLY a `{ patientId }` shape
 * (never a patient object, never registrationNo, never arbitrary metadata), validates the UUID,
 * and returns the id unchanged and untransformed. Deterministic.
 */
export function derivePatientRef(input: { patientId: string }): PatientRef {
  const patientId = input?.patientId;
  if (typeof patientId !== 'string' || patientId.trim() === '') {
    throw new InvalidPatientRefError('patientId must be a non-empty string');
  }
  if (!UUID_RE.test(patientId)) {
    throw new InvalidPatientRefError('patientId is not a UUID-shaped internal id');
  }
  return patientId as PatientRef;
}
