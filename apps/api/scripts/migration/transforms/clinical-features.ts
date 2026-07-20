/**
 * The EAV pivot — the migration's trickiest transform.
 *
 * Legacy stores each case's clinical form as loose name/value rows
 * (`clinical_item`, ~360k rows). Osieri uses two typed 1:1 models
 * (GynClinicalFeatures / NonGynClinicalFeatures). This collapses a record's
 * clinical_item rows into the typed feature objects, discriminated by the
 * record's form type, coalescing name/spelling/datatype variants via the
 * canonical pivot lookup in mapping.ts.
 */
import { CLINICAL_ITEM_PIVOT, normalizeFieldName, PivotRule } from '../mapping';
import { parseBool, parseIntOrNull, parseDate, cleanString } from './coerce';

/** One legacy clinical_item row (only the fields the pivot needs). */
export interface LegacyClinicalItem {
  name: string | null;
  value: string | null;
  datatype?: string | null;
}

/** Osieri GynClinicalFeatures payload (sans id/labId/recordId/timestamps). */
export interface GynFeatures {
  routineCheck: boolean;
  previousCytology: boolean;
  nowPregnant: boolean;
  menopause: boolean;
  lmp: Date | null;
  dateOfMenopause: Date | null;
  pregnancies: number | null;
  leucorrhea: string | null;
  lengthOfCycle: string | null;
  pelvicAbnormalities: string | null;
  clinicalAppearanceOfCervix: string | null;
}

/** Osieri NonGynClinicalFeatures payload. */
export interface NonGynFeatures {
  sampleDescription: string | null;
  natureAndSource: string | null;
}

export interface PivotResult {
  formType: 'Gynecology' | 'NonGynecology';
  gyn?: GynFeatures;
  nonGyn?: NonGynFeatures;
  /** Overflow that belongs on the record/patient row, not the features model. */
  record: { clinicalDiagnosis?: string | null };
  patient: { registrationNo?: string | null };
  /** Legacy names we could not map — surfaced for the reconciliation report. */
  unmapped: string[];
}

function coerce(rule: PivotRule, value: string | null): unknown {
  switch (rule.kind) {
    case 'bool':
      return parseBool(value, false);
    case 'int':
      return parseIntOrNull(value);
    case 'date':
      return parseDate(value);
    case 'string':
    default:
      return cleanString(value);
  }
}

function emptyGyn(): GynFeatures {
  return {
    routineCheck: false,
    previousCytology: false,
    nowPregnant: false,
    menopause: false,
    lmp: null,
    dateOfMenopause: null,
    pregnancies: null,
    leucorrhea: null,
    lengthOfCycle: null,
    pelvicAbnormalities: null,
    clinicalAppearanceOfCervix: null,
  };
}

/**
 * Pivot a record's clinical_item rows into typed feature objects.
 *
 * @param items    all legacy clinical_item rows for one record
 * @param formType the record's legacy form type ('Gynecology' | 'NonGynecology')
 *
 * Coalescing rule: for a bool field, ANY truthy variant wins (OR). For a
 * scalar (string/int/date), the first non-null value wins — legacy duplicates
 * are usually blank echoes of the real one.
 */
export function pivotClinicalItems(
  items: LegacyClinicalItem[],
  formType: 'Gynecology' | 'NonGynecology',
): PivotResult {
  const isGyn = formType === 'Gynecology';
  const result: PivotResult = {
    formType,
    record: {},
    patient: {},
    unmapped: [],
  };
  const gyn = isGyn ? emptyGyn() : undefined;
  const nonGyn = !isGyn ? { sampleDescription: null, natureAndSource: null } : undefined;

  for (const item of items) {
    if (!item.name) continue;
    const key = normalizeFieldName(item.name);
    const rule = CLINICAL_ITEM_PIVOT[key];
    if (!rule) {
      if (!result.unmapped.includes(item.name)) result.unmapped.push(item.name);
      continue;
    }
    const coerced = coerce(rule, item.value ?? null);

    if (rule.target === 'record') {
      if (result.record[rule.field as 'clinicalDiagnosis'] == null && coerced != null) {
        result.record.clinicalDiagnosis = coerced as string;
      }
      continue;
    }
    if (rule.target === 'patient') {
      if (result.patient.registrationNo == null && coerced != null) {
        result.patient.registrationNo = coerced as string;
      }
      continue;
    }

    const bag: Record<string, unknown> | undefined =
      rule.target === 'gyn' ? (gyn as unknown as Record<string, unknown>) : (nonGyn as unknown as Record<string, unknown>);
    if (!bag) continue; // e.g. a gyn field on a non-gyn record — ignore

    if (rule.kind === 'bool') {
      bag[rule.field] = Boolean(bag[rule.field]) || (coerced as boolean); // OR-coalesce
    } else if (bag[rule.field] == null && coerced != null) {
      bag[rule.field] = coerced; // first-non-null wins
    }
  }

  if (gyn) result.gyn = gyn;
  if (nonGyn) result.nonGyn = nonGyn;
  return result;
}
