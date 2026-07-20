/**
 * Enum transforms. Each looks the legacy value up in its map (mapping.ts) and
 * throws on an unmapped value so schema drift surfaces immediately instead of
 * silently corrupting a row. Null/absent input passes through as null for
 * nullable target columns.
 */
import {
  RECORD_STATUS_MAP,
  REQUISITION_STATUS_MAP,
  SPECIMEN_TYPE_MAP,
  FORM_TYPE_MAP,
  GENDER_MAP,
  CLIENT_TYPE_MAP,
  AUTHORIZER_MAP,
} from '../mapping';

function mapWith(
  map: Record<string, string>,
  value: unknown,
  label: string,
  { nullable = true }: { nullable?: boolean } = {},
): string | null {
  if (value === null || value === undefined || value === '') {
    if (nullable) return null;
    throw new Error(`${label}: missing value (non-nullable)`);
  }
  const key = String(value).trim();
  const mapped = map[key];
  if (mapped === undefined) {
    throw new Error(`${label}: unmapped legacy value ${JSON.stringify(key)} (add it to mapping.ts)`);
  }
  return mapped;
}

export const mapRecordStatus = (v: unknown) =>
  mapWith(RECORD_STATUS_MAP, v ?? 'Pending', 'RecordStatus', { nullable: false })!;
export const mapRequisitionStatus = (v: unknown) =>
  mapWith(REQUISITION_STATUS_MAP, v ?? 'Pending', 'RequisitionStatus', { nullable: false })!;
export const mapSpecimenType = (v: unknown) =>
  mapWith(SPECIMEN_TYPE_MAP, v ?? 'OTHER', 'SpecimenType', { nullable: false })!;
export const mapFormType = (v: unknown) => mapWith(FORM_TYPE_MAP, v, 'RequisitionFormType');
export const mapGender = (v: unknown) => mapWith(GENDER_MAP, v, 'Gender');
export const mapClientType = (v: unknown) => mapWith(CLIENT_TYPE_MAP, v, 'ClientTypeEnum');
export const mapAuthorizerDesignation = (v: unknown) => mapWith(AUTHORIZER_MAP, v, 'AuthorizerDesignation');
