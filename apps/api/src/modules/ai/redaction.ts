import { createHash } from 'crypto';

/**
 * Redaction assembler for F4 AI-assisted reporting — the safety-critical core.
 *
 * SAFETY BY CONSTRUCTION: the payload sent to the Anthropic API is built
 * field-by-field from an EXPLICIT ALLOWLIST below. Raw patient / record objects
 * are NEVER spread into the output, so a direct identifier cannot leak by
 * accident — only the named clinical fields here are ever emitted. Direct
 * identifiers (name, registrationNo, email, phone, DOB, address, mother's maiden
 * name, the labNumber/case number, and all absolute dates) are never in the
 * allowlist and are additionally scrubbed out of free-text clinical fields.
 */

export type RedactionPolicy = 'Strict' | 'Standard';

// ---------- Input (what the caller fetches and hands in) ----------
export interface RedactionPatient {
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  registrationNo?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  motherMaidenName?: string | null;
  dateOfBirth?: Date | string | null;
  gender?: string | null;
}
export interface RedactionGynFeatures {
  routineCheck?: boolean;
  previousCytology?: boolean;
  nowPregnant?: boolean;
  menopause?: boolean;
  pregnancies?: number | null;
  lengthOfCycle?: string | null;
  clinicalAppearanceOfCervix?: string | null;
  leucorrhea?: string | null;
  pelvicAbnormalities?: string | null;
  lmp?: Date | string | null;
}
export interface RedactionNonGynFeatures {
  sampleDescription?: string | null;
  natureAndSource?: string | null;
}
export interface RedactionResultLine {
  abbreviation?: string | null;
  result?: string | null;
  findings?: string | null;
  abnormalFinding?: boolean;
}
export interface RedactionResultEntry {
  specimenType?: string | null;
  resultLines: RedactionResultLine[];
}
export interface RedactionInput {
  policy: RedactionPolicy;
  /** Opaque per-request token (e.g. "CASE-1"). NEVER the labNumber. */
  caseRef: string;
  formType?: 'Gynecology' | 'NonGynecology' | null;
  specimenTypes?: string[];
  patient?: RedactionPatient | null;
  gynFeatures?: RedactionGynFeatures | null;
  nonGynFeatures?: RedactionNonGynFeatures | null;
  resultEntries?: RedactionResultEntry[];
  /** abbreviation -> catalog description (CodeSheet/CodeFinding reference data). */
  codeDescriptions?: Record<string, string>;
  labCodes?: { code: string; region?: string | null }[];
  /** Human narrative — only supplied for ConsistencyCheck; scrubbed defensively. */
  narrative?: string | null;
  /** "Now" for age-band / interval derivation. Defaults to current time. */
  referenceDate?: Date;
}

// ---------- Output (redacted payload actually sent) ----------
export interface RedactedPayload {
  caseRef: string;
  formType: string | null;
  specimens: string[];
  demographics?: { sex?: 'M' | 'F'; ageBand?: string };
  clinicalFeatures?: Record<string, unknown>;
  codedResults: Array<{
    specimen: string | null;
    codes: Array<{ abbreviation: string | null; description?: string; abnormal: boolean; note?: string }>;
  }>;
  labCodes: Array<{ code: string; region?: string }>;
  narrative?: string;
}

const DAY_MS = 86_400_000;

/** Identifier tokens we hold server-side, used to scrub free text. */
function identifierTokens(p?: RedactionPatient | null): string[] {
  if (!p) return [];
  const raw: (string | null | undefined)[] = [
    p.firstName, p.lastName, p.middleName, p.registrationNo, p.motherMaidenName, p.phoneNumber,
  ];
  if (p.email) {
    raw.push(p.email, p.email.split('@')[0]);
  }
  // Split multi-word fields into tokens; keep tokens length >= 2 to avoid over-scrubbing.
  const tokens = new Set<string>();
  for (const v of raw) {
    if (!v) continue;
    for (const tok of String(v).split(/[\s@._-]+/)) {
      const t = tok.trim().toLowerCase();
      if (t.length >= 2) tokens.add(t);
    }
    const whole = String(v).trim().toLowerCase();
    if (whole.length >= 2) tokens.add(whole);
  }
  return [...tokens];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Remove exact-match occurrences of the patient's own identifiers from free text. */
function scrub(text: string | null | undefined, tokens: string[]): string | undefined {
  if (text == null) return undefined;
  let out = String(text);
  for (const tok of tokens) {
    out = out.replace(new RegExp(`\\b${escapeRe(tok)}\\b`, 'gi'), '[redacted]');
  }
  return out;
}

function ageBand(dob: Date | string | null | undefined, ref: Date): string | undefined {
  if (!dob) return undefined;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return undefined;
  let age = ref.getFullYear() - d.getFullYear();
  const m = ref.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < d.getDate())) age--;
  if (age < 0 || age > 130) return undefined;
  if (age >= 80) return '80+';
  const lo = Math.floor(age / 10) * 10;
  return `${lo}-${lo + 9}`;
}

function sexCode(gender: string | null | undefined): 'M' | 'F' | undefined {
  const g = gender?.toLowerCase();
  if (g === 'male' || g === 'm') return 'M';
  if (g === 'female' || g === 'f') return 'F';
  return undefined;
}

function intervalDays(from: Date | string | null | undefined, ref: Date): number | null {
  if (!from) return null;
  const d = new Date(from);
  if (isNaN(d.getTime())) return null;
  return Math.max(0, Math.round((ref.getTime() - d.getTime()) / DAY_MS));
}

/** Drop undefined keys so the emitted JSON only carries present values. */
function compact<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

/**
 * Build the redacted payload strictly from the allowlist. This is the ONLY thing
 * ever sent to the model. Adding a field here is the only way to send more data.
 */
export function assembleRedactedPayload(input: RedactionInput): RedactedPayload {
  const ref = input.referenceDate ?? new Date();
  const tokens = identifierTokens(input.patient);
  const s = (t: string | null | undefined) => scrub(t, tokens);
  const codeDesc = input.codeDescriptions ?? {};

  const payload: RedactedPayload = {
    caseRef: input.caseRef, // opaque token, NOT the labNumber
    formType: input.formType ?? null,
    specimens: input.specimenTypes ?? [],
    codedResults: (input.resultEntries ?? []).map((e) => ({
      specimen: e.specimenType ?? null,
      codes: (e.resultLines ?? []).map((l) =>
        compact({
          abbreviation: l.abbreviation ?? null,
          description: l.abbreviation ? codeDesc[l.abbreviation] : undefined,
          abnormal: !!l.abnormalFinding,
          note: s(l.findings ?? l.result),
        }),
      ) as RedactedPayload['codedResults'][number]['codes'],
    })),
    labCodes: (input.labCodes ?? []).map((lc) =>
      input.policy === 'Standard' ? compact({ code: lc.code, region: lc.region ?? undefined }) : { code: lc.code },
    ),
  };

  // Demographics: ONLY under Standard, and only de-identified sex + age band.
  if (input.policy === 'Standard' && input.patient) {
    const demo = compact({ sex: sexCode(input.patient.gender), ageBand: ageBand(input.patient.dateOfBirth, ref) });
    if (Object.keys(demo).length) payload.demographics = demo;
  }

  // Clinical features — de-identified; dates become intervals/booleans, never dates.
  if (input.formType === 'NonGynecology' || (input.nonGynFeatures && input.formType !== 'Gynecology')) {
    const nf = input.nonGynFeatures ?? {};
    const block = compact({ sampleDescription: s(nf.sampleDescription), natureAndSource: s(nf.natureAndSource) });
    if (Object.keys(block).length) payload.clinicalFeatures = block;
  } else if (input.gynFeatures) {
    const g = input.gynFeatures;
    payload.clinicalFeatures = compact({
      routineCheck: !!g.routineCheck,
      previousCytology: !!g.previousCytology,
      pregnant: !!g.nowPregnant,
      menopause: !!g.menopause,
      pregnancies: g.pregnancies ?? undefined,
      cycleLength: g.lengthOfCycle ?? undefined,
      cervixAppearance: s(g.clinicalAppearanceOfCervix),
      leucorrhea: s(g.leucorrhea),
      pelvicAbnormalities: s(g.pelvicAbnormalities),
      lmpIntervalDays: intervalDays(g.lmp, ref), // relative interval, never a date
    });
  }

  if (input.narrative != null) payload.narrative = s(input.narrative);

  return payload;
}

/** sha256 of the exact redacted payload — provenance without persisting PHI. */
export function digestPayload(payload: RedactedPayload): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/** Recursively collect every string value in the payload (used by the safety test). */
export function collectStringValues(value: unknown, acc: string[] = []): string[] {
  if (typeof value === 'string') acc.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStringValues(v, acc));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectStringValues(v, acc));
  return acc;
}
