// Shared types + display metadata for LOINC/SNOMED coding. Zero orange —
// Partial status uses detector-safe amber (#B45309).

export type CodeSystem = 'LOINC' | 'SNOMED_CT' | 'ICD10' | 'CPT';
export type CodingType = 'Procedure' | 'Diagnosis' | 'Specimen' | 'Finding';
export type CodingStatus = 'Coded' | 'Partial' | 'Uncoded';

export interface MedicalCode {
  id: string;
  system: CodeSystem;
  code: string;
  display: string;
  category: string | null;
  isActive: boolean;
  usageCount: number;
  createdAt: string;
}

export interface CodeRef { id: string; system: CodeSystem; code: string; display: string; category: string | null }

export interface RecordCoding {
  id: string;
  codeType: CodingType;
  notes: string | null;
  assignedAt: string;
  code: CodeRef;
  assignedBy: { firstName: string; lastName: string } | null;
}

export interface Suggestion {
  code: CodeRef;
  codeType: CodingType;
  confidence: number;
  reason: string;
  alreadyAssigned: boolean;
}

export interface CodingRecordRow {
  recordId: string;
  labNo: string;
  patientInitials: string;
  specimenType: string;
  bethesda: string | null;
  codesAssigned: number;
  status: CodingStatus;
}

export interface CodingStats {
  totalCoded: number;
  uncoded: number;
  dictionarySize: number;
  bySystem: Record<CodeSystem, number>;
  mostUsedCodes: { system: CodeSystem; code: string; display: string; usageCount: number }[];
}

export interface ExportData {
  generatedAt: string;
  period: { from: string; to: string };
  count: number;
  records: { labNo: string; patientInitials: string; specimenType: string; date: string; codes: { system: CodeSystem; code: string; display: string; codeType: CodingType }[] }[];
}

export const SYSTEM_META: Record<CodeSystem, { label: string; bg: string; fg: string }> = {
  LOINC: { label: 'LOINC', bg: '#E0E7FF', fg: '#4338CA' }, // indigo
  SNOMED_CT: { label: 'SNOMED', bg: '#DBEAFE', fg: '#1D4ED8' }, // blue
  ICD10: { label: 'ICD-10', bg: '#EDE9FE', fg: '#6D28D9' }, // violet
  CPT: { label: 'CPT', bg: '#F1F5F9', fg: '#475569' }, // slate
};

export const STATUS_META: Record<CodingStatus, { label: string; bg: string; fg: string; outline?: boolean }> = {
  Coded: { label: 'Coded', bg: '#DCFCE7', fg: '#16A34A' },
  Partial: { label: 'Partial', bg: '#FFFBEB', fg: '#B45309' }, // amber, not orange
  Uncoded: { label: 'Uncoded', bg: '#FFFFFF', fg: '#B91C1C', outline: true },
};

export const CODING_TYPES: CodingType[] = ['Procedure', 'Diagnosis', 'Specimen', 'Finding'];

export const shortDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
