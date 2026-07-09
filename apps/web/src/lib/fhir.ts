// Shared types + display metadata for HL7/FHIR integration. Zero orange —
// Sandbox/Retrying use the safe amber token var(--color-warning) = #A16207.

export type EMRSystem = 'Epic' | 'Cerner' | 'Meditech' | 'Allscripts' | 'Generic';
export type FHIRAuthType = 'Bearer' | 'OAuth2' | 'APIKey' | 'None';
export type TransmissionStatus = 'Pending' | 'Sending' | 'Success' | 'Failed' | 'Retrying';

export interface FhirEndpoint {
  id: string;
  name: string;
  baseUrl: string;
  system: EMRSystem;
  authType: FHIRAuthType;
  isActive: boolean;
  isSandbox: boolean;
  clientId: string | null;
  lastTestedAt: string | null;
  lastTestStatus: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { transmissions: number };
}

export interface FhirTransmission {
  id: string;
  status: TransmissionStatus;
  fhirResourceId: string | null;
  responseCode: number | null;
  responseBody: string | null;
  errorMessage: string | null;
  retryCount: number;
  transmittedAt: string | null;
  createdAt: string;
  endpointId: string;
  recordId: string;
  endpoint: { name: string; system: EMRSystem; isSandbox: boolean };
  record: { labNumber: string | null; identifier: string; patient: { firstName: string; lastName: string } | null };
}

export interface FhirStats {
  activeEndpoints: number;
  totalTransmissions: number;
  successful: number;
  failed: number;
  pending: number;
  successRate: number;
  todayCount: number;
  byEndpoint: { name: string; count: number; successRate: number }[];
}

export interface FhirPreview {
  patient: Record<string, unknown> | null;
  diagnosticReport: Record<string, unknown>;
  bundle: Record<string, unknown>;
}

export const EMR_META: Record<EMRSystem, { label: string; bg: string; fg: string }> = {
  Epic: { label: 'Epic', bg: '#E0E7FF', fg: '#4338CA' }, // indigo
  Cerner: { label: 'Cerner', bg: '#DBEAFE', fg: '#1D4ED8' }, // blue
  Meditech: { label: 'Meditech', bg: '#EDE9FE', fg: '#6D28D9' }, // violet
  Allscripts: { label: 'Allscripts', bg: '#CCFBF1', fg: '#0F766E' }, // teal
  Generic: { label: 'Generic', bg: '#F1F5F9', fg: '#475569' }, // slate
};

export const STATUS_META: Record<TransmissionStatus, { label: string; bg: string; fg: string; spin?: boolean }> = {
  Success: { label: 'Success', bg: '#DCFCE7', fg: '#16A34A' },
  Failed: { label: 'Failed', bg: '#FEE2E2', fg: '#B91C1C' },
  Pending: { label: 'Pending', bg: '#F1F5F9', fg: '#475569', spin: true },
  Sending: { label: 'Sending', bg: '#EEF2FF', fg: '#4F46E5', spin: true },
  Retrying: { label: 'Retrying', bg: '#FFFBEB', fg: 'var(--color-warning)', spin: true }, // var(--color-warning); safe at every alpha
};

export const EMR_SYSTEMS: EMRSystem[] = ['Epic', 'Cerner', 'Meditech', 'Allscripts', 'Generic'];
export const AUTH_TYPES: FHIRAuthType[] = ['Bearer', 'OAuth2', 'APIKey', 'None'];

export const dateTime = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
