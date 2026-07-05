// Shared types + display metadata for Cyto-Histo Correlation Tracking.

export type CorrelationResult = 'Concordant' | 'MinorDiscordant' | 'MajorDiscordant' | 'Unresolved';
export type HistologySource = 'Internal' | 'External' | 'Unknown';

export interface CorrelationCase {
  id: string;
  patientId: string;
  cytologyRecordId: string;
  cytologyDate: string;
  cytologyDiagnosis: string;
  cytologyBethesdaId: string | null;
  histologyRecordId: string | null;
  histologyDate: string | null;
  histologyDiagnosis: string | null;
  histologySource: HistologySource;
  externalLabName: string | null;
  correlationResult: CorrelationResult | null;
  discordanceReason: string | null;
  reviewRequired: boolean;
  reviewedAt: string | null;
  reviewNotes: string | null;
  clinicalOutcome: string | null;
  followUpRequired: boolean;
  createdAt: string;
  updatedAt: string;
  patient: { firstName: string; lastName: string; registrationNo: string | null } | null;
  cytologyRecord: { labNumber: string | null; identifier: string; formType: string | null } | null;
  reviewedBy: { firstName: string; lastName: string } | null;
  createdBy: { firstName: string; lastName: string } | null;
}

export interface CorrelationAnalytics {
  total: number;
  concordantCount: number;
  minorDiscordantCount: number;
  majorDiscordantCount: number;
  unresolvedCount: number;
  concordanceRate: number;
  majorDiscordanceRate: number;
  pendingReview: number;
  byMonth: { month: string; concordant: number; minorDiscordant: number; majorDiscordant: number }[];
}

// Result palette. Detector-safe: MinorDiscordant uses dark yellow #A16207 (not
// orange). MajorDiscordant reds; Concordant green; Unresolved slate. Zero orange.
export const RESULT_META: Record<CorrelationResult, { label: string; bg: string; fg: string; rowBg?: string }> = {
  Concordant: { label: 'Concordant', bg: '#DCFCE7', fg: '#15803D' },
  MinorDiscordant: { label: 'Minor Discordant', bg: '#FEFCE8', fg: '#A16207' },
  MajorDiscordant: { label: 'Major Discordant', bg: '#FEE2E2', fg: '#B91C1C', rowBg: '#FEF2F2' },
  Unresolved: { label: 'Unresolved', bg: '#F1F5F9', fg: '#475569' },
};

export const CORRELATION_RESULTS: CorrelationResult[] = ['Concordant', 'MinorDiscordant', 'MajorDiscordant', 'Unresolved'];
export const HISTOLOGY_SOURCES: HistologySource[] = ['Internal', 'External', 'Unknown'];

// Donut colors (Concordant green, Minor yellow, Major red, Unresolved slate).
export const DONUT_COLOR: Record<CorrelationResult, string> = {
  Concordant: '#22C55E',
  MinorDiscordant: '#FACC15',
  MajorDiscordant: '#EF4444',
  Unresolved: '#475569',
};

export const shortDate = (iso: string | null): string => (iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
export const patientName = (c: CorrelationCase): string => (c.patient ? `${c.patient.firstName} ${c.patient.lastName}`.trim() : '—');
