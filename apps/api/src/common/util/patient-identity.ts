import { createHmac } from 'node:crypto';
import { Gender } from '@prisma/client';
import { getEncryptionKey } from '../crypto/phi-crypto';

/**
 * Patient de-duplication: one patient, many records.
 *
 * A patient's identity is condensed to a single deterministic fingerprint
 * (`identityKey`) so that creating the same real-world person twice reuses the
 * existing row instead of minting a duplicate. The key is index-safe and keeps
 * PHI out of the index: it is an HMAC (keyed with the app's encryption key), not
 * the raw identifiers, so it is deterministic (unlike the random-IV field
 * encryption) yet not reversible to a name+DOB by anyone reading the column.
 *
 * MATCH RULE (decided with the product owner):
 *  1. National ID (`identityToken`) when present — the strongest signal.
 *  2. Otherwise normalized `lastName | firstName | dateOfBirth | gender`.
 *     Gender participates so that same-name, same-DOB people of different
 *     recorded genders stay distinct. A missing gender normalizes to a fixed
 *     token, so repeat visits through the SAME channel still match.
 *
 * Returns `null` when there is not enough identity to match on (e.g. no national
 * ID and no date of birth) — the caller then creates a fresh, un-deduplicated
 * row (many null keys coexist because Postgres treats NULLs as distinct).
 *
 * NOTE: the portal intake path does not capture gender or national ID, so a
 * returning portal patient keys on `last|first|dob|∅` — which correctly matches
 * their prior portal visits. Cross-channel matching (portal ↔ manual, where one
 * side has gender/ID and the other does not) is intentionally out of scope here;
 * capture gender on the portal form to close that gap.
 */

const HMAC_DOMAIN = 'patient-identity:v1';

export interface PatientIdentityInput {
  firstName?: string | null;
  lastName?: string | null;
  dateOfBirth?: Date | string | null;
  gender?: Gender | null;
  /** National ID / passport number (plaintext, before field encryption). */
  identityToken?: string | null;
}

/**
 * Lowercase, strip diacritics, and remove every non-alphanumeric character
 * (spaces, apostrophes, hyphens) so that "O'Brien", "O Brien" and "OBrien"
 * \u2014 or "Mar\u00eda" and "Maria" \u2014 collapse to the same token.
 */
function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/** Canonical YYYY-MM-DD (UTC) for a date value, or null if unparseable. */
function normalizeDob(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  const t = d.getTime();
  if (Number.isNaN(t)) return null;
  return d.toISOString().slice(0, 10);
}

function hmac(payload: string): string {
  return createHmac('sha256', getEncryptionKey())
    .update(`${HMAC_DOMAIN}:${payload}`)
    .digest('hex');
}

/**
 * Deterministic identity fingerprint for a patient, or `null` when there is not
 * enough information to safely match. Callers store this in `Patient.identityKey`
 * and look patients up by it before creating.
 */
export function computeIdentityKey(input: PatientIdentityInput): string | null {
  const id = input.identityToken ? normalizeText(input.identityToken) : '';
  if (id) return hmac(`id|${id}`);

  const last = input.lastName ? normalizeText(input.lastName) : '';
  const first = input.firstName ? normalizeText(input.firstName) : '';
  const dob = normalizeDob(input.dateOfBirth);
  // Without a date of birth, name alone is too weak to auto-merge distinct people.
  if (!last || !first || !dob) return null;

  const gender = input.gender ?? '∅';
  return hmac(`nd|${last}|${first}|${dob}|${gender}`);
}
