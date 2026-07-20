/**
 * Legacy CYTOLAB -> Osieri ETL — static mapping configuration.
 *
 * Single source of truth for the enum maps, the EAV clinical-form pivot lookup,
 * and the money fields. Mirrors docs/migration/LEGACY_TO_OSIERI_MAPPING.md — keep
 * the two in sync. Pure data + pure lookups only (no DB, no side effects), so it
 * is unit-testable without a database.
 */

// ---------------------------------------------------------------------------
// Enum maps. Osieri deliberately preserved the legacy enum member names, so most
// of these are identity maps — but we validate explicitly so any future legacy
// value we have not seen throws loudly instead of silently dropping a row.
// ---------------------------------------------------------------------------

/** Legacy `status_enum` (on record.status) -> Osieri RecordStatus. */
export const RECORD_STATUS_MAP: Record<string, string> = {
  Pending: 'Pending',
  Submitted: 'Submitted',
  Processing: 'Processing',
  Partial: 'Partial',
  Completed: 'Completed',
  Resulted: 'Resulted',
  Approved: 'Approved',
  Billed: 'Billed',
  Paid: 'Paid',
  OnHold: 'OnHold',
  Disabled: 'Disabled',
  Failed: 'Failed',
  Viewed: 'Viewed',
  // Legacy also emits these on other columns; tolerate them on records too.
  Active: 'Processing',
  Success: 'Completed',
  Confirmed: 'Approved',
};

/** Legacy `status_enum` (on requsition.status) -> Osieri RequisitionStatus. */
export const REQUISITION_STATUS_MAP: Record<string, string> = {
  Pending: 'Pending',
  Active: 'Active',
  Partial: 'Partial',
  Completed: 'Completed',
  Disabled: 'Disabled',
  // Observed only Partial/Completed/Pending in prod, but be defensive.
  Processing: 'Active',
  Success: 'Completed',
};

/** Legacy `specimen_enum` -> Osieri SpecimenType (identity; all legacy values exist). */
export const SPECIMEN_TYPE_MAP: Record<string, string> = {
  CERV_SCRAP: 'CERV_SCRAP',
  ENDOCERV_ASP: 'ENDOCERV_ASP',
  VAG_POOL: 'VAG_POOL',
  URINE: 'URINE',
  CSF: 'CSF',
  PLEURAL_FLD: 'PLEURAL_FLD',
  BREAST_ASP: 'BREAST_ASP',
  JOINT_ASP: 'JOINT_ASP',
  SYNOVIAL_FLD: 'SYNOVIAL_FLD',
  OTHER: 'OTHER',
};

/** Legacy `form_type_enum` -> Osieri RequisitionFormType. */
export const FORM_TYPE_MAP: Record<string, string> = {
  Gynecology: 'Gynecology',
  NonGynecology: 'NonGynecology',
};

/** Legacy `gender_enum` -> Osieri Gender. */
export const GENDER_MAP: Record<string, string> = { Male: 'Male', Female: 'Female' };

/** Legacy `client_enum` (client_type.type) -> Osieri ClientTypeEnum. */
export const CLIENT_TYPE_MAP: Record<string, string> = {
  Doctor: 'Doctor',
  Laboratory: 'Laboratory',
};

/** Legacy `authorizer_enum` -> Osieri AuthorizerDesignation. */
export const AUTHORIZER_MAP: Record<string, string> = {
  Pathologist: 'Pathologist',
  Cytologist: 'Cytologist',
};

// ---------------------------------------------------------------------------
// EAV clinical-form pivot. Legacy stores each case's clinical form as loose
// name/value rows (clinical_item). Osieri uses typed 1:1 models. Only ~18
// distinct field names exist across 360k rows. This lookup is the pivot.
//
// `target` is 'gyn' | 'nongyn' | 'record' | 'patient' (the last two are already
// first-class columns and are reconciled, not pivoted into a features model).
// `field` is the destination property. `kind` drives coercion.
// ---------------------------------------------------------------------------

export type PivotTarget = 'gyn' | 'nongyn' | 'record' | 'patient';
export type PivotKind = 'bool' | 'int' | 'date' | 'string';

export interface PivotRule {
  target: PivotTarget;
  field: string;
  kind: PivotKind;
}

/**
 * Keyed by the canonical (normalized) legacy field name — see normalizeFieldName.
 * Name variants ("No. of Pregnancy" vs "No. of Pregnancies", the text/bool
 * duplicates of "Previous Cytology"/"Routine Check") collapse to one key.
 */
export const CLINICAL_ITEM_PIVOT: Record<string, PivotRule> = {
  lmp: { target: 'gyn', field: 'lmp', kind: 'date' },
  nowpregnant: { target: 'gyn', field: 'nowPregnant', kind: 'bool' },
  noofpregnancy: { target: 'gyn', field: 'pregnancies', kind: 'int' },
  noofpregnancies: { target: 'gyn', field: 'pregnancies', kind: 'int' },
  routinecheck: { target: 'gyn', field: 'routineCheck', kind: 'bool' },
  previouscytology: { target: 'gyn', field: 'previousCytology', kind: 'bool' },
  menopause: { target: 'gyn', field: 'menopause', kind: 'bool' },
  dateofmenopause: { target: 'gyn', field: 'dateOfMenopause', kind: 'date' },
  lengthofcycle: { target: 'gyn', field: 'lengthOfCycle', kind: 'string' },
  leucorrhea: { target: 'gyn', field: 'leucorrhea', kind: 'string' },
  pelvicabnormalities: { target: 'gyn', field: 'pelvicAbnormalities', kind: 'string' },
  clinicalappearanceofcervix: { target: 'gyn', field: 'clinicalAppearanceOfCervix', kind: 'string' },
  // Legacy label is "Nature & Source of Specimen" — the '&' normalizes away (not
  // read as "and"), so the canonical key drops it. Keep the "and" variant too.
  naturesourceofspecimen: { target: 'nongyn', field: 'natureAndSource', kind: 'string' },
  natureandsourceofspecimen: { target: 'nongyn', field: 'natureAndSource', kind: 'string' },
  sampledescription: { target: 'nongyn', field: 'sampleDescription', kind: 'string' },
  clinicaldiagnosis: { target: 'record', field: 'clinicalDiagnosis', kind: 'string' },
  registrationno: { target: 'patient', field: 'registrationNo', kind: 'string' },
};

/**
 * Canonicalize a legacy clinical_item.name so spelling/spacing/punctuation
 * variants collapse to one key: lowercase, strip everything but a-z0-9.
 * "No. of Pregnancies" -> "noofpregnancies", "Clinical Appearance of Cervix" ->
 * "clinicalappearanceofcervix".
 */
export function normalizeFieldName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ---------------------------------------------------------------------------
// Money fields: legacy double precision (dollars) -> Osieri Int minor units
// (cents). Listed here so the money transform is applied consistently.
// ---------------------------------------------------------------------------

export const MONEY_FIELDS = {
  requisition: ['amount'],
  requisitionLine: ['amount'],
  service: ['cost'],
} as const;

// ---------------------------------------------------------------------------
// Load order — FK dependency order. The orchestrator walks this top-to-bottom
// for a full load; the reverse is never needed (upserts are idempotent).
// ---------------------------------------------------------------------------

export const LOAD_ORDER = [
  'lab', // seed CytoLabs Lab + Account + default Workspace + roles/permissions
  'labCode',
  'clientType',
  'client', // legacy workspace(Client) + client -> Osieri Client (+ PortalUser)
  'codeSheet',
  'codeFinding',
  'patient',
  'requisition',
  'record',
  'requisitionLine',
  'recordStatusEvent',
  'clinicalFeatures', // EAV pivot -> Gyn/NonGyn features
  'specimen',
  'therapy',
  'resultSheet',
  'resultEntry',
  'resultLine',
  'report',
  'cabinet',
  'user', // + authorizer designation & signature
  // NOTE: legacy `notification` (workspace-scoped free text) is intentionally
  // NOT migrated — it does not fit Osieri's per-user typed Notification model.
  // Notifications re-derive from live activity post-cutover.
] as const;

export type LoadStage = (typeof LOAD_ORDER)[number];
