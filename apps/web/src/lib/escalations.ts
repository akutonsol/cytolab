// Shared types + display metadata for the Abnormal Result Escalation feature.

export type EscalationSeverity = 'Abnormal' | 'HighGrade' | 'Malignant';
export type EscalationStatus = 'Pending' | 'Acknowledged' | 'UnderReview' | 'Resolved' | 'Dismissed';
export type EscalationTrigger = 'BethesdaClassification' | 'NarrativeKeyword' | 'ManualFlag';

export interface EscalationRow {
  id: string;
  severity: EscalationSeverity;
  trigger: EscalationTrigger;
  status: EscalationStatus;
  createdAt: string;
  updatedAt: string;
  physicianNotifiedAt: string | null;
  physicianNotifiedVia: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  resolvedAt: string | null;
  resolvedReason: string | null;
  assignedTo: { id: string; firstName: string; lastName: string } | null;
  reviewedBy: { id: string; firstName: string; lastName: string } | null;
  reviewTimeframe?: string;
  record: {
    id: string;
    labNumber: string | null;
    identifier: string;
    formType: string | null;
    status: string;
    patient: { firstName: string; lastName: string; registrationNo?: string | null } | null;
    bethesdaResult: {
      squamousCategory: string | null;
      ascSubtype: string | null;
      glandularCategory: string | null;
      generalCategory: string | null;
      otherMalignancy: string | null;
      generatedNarrative: string | null;
    } | null;
  };
}

export interface EscalationSummary {
  pending: number;
  acknowledged: number;
  underReview: number;
  malignantCount: number;
  highGradeCount: number;
  resolvedToday: number;
  avgResolutionHours: number | null;
}

// Severity palette. Detector-safe: "Abnormal" uses a dark yellow (#A16207,
// yellow-700) not orange; malignant/high-grade use reds. Zero orange.
export const SEVERITY_META: Record<EscalationSeverity, { label: string; bg: string; fg: string; border: string; rowBg: string; timeframe: string }> = {
  Malignant: { label: 'Malignant', bg: '#FEE2E2', fg: '#B91C1C', border: '#FECACA', rowBg: '#FEF2F2', timeframe: 'immediate' },
  HighGrade: { label: 'High Grade', bg: '#FEF2F2', fg: '#EF4444', border: '#FECACA', rowBg: '#FFFBFB', timeframe: 'urgent (within 24 hours)' },
  Abnormal: { label: 'Abnormal', bg: '#FEFCE8', fg: '#A16207', border: '#FEF08A', rowBg: '#FFFFFF', timeframe: 'routine (within 5 days)' },
};

export const STATUS_META: Record<EscalationStatus, { label: string; bg: string; fg: string }> = {
  Pending: { label: 'Pending', bg: '#F1F5F9', fg: '#475569' },
  Acknowledged: { label: 'Acknowledged', bg: '#DBEAFE', fg: '#1D4ED8' },
  UnderReview: { label: 'Under Review', bg: '#EEF2FF', fg: '#4F46E5' },
  Resolved: { label: 'Resolved', bg: '#DCFCE7', fg: '#16A34A' },
  Dismissed: { label: 'Dismissed', bg: '#F1F5F9', fg: '#94A3B8' },
};

export const OPEN_STATUSES: EscalationStatus[] = ['Pending', 'Acknowledged', 'UnderReview'];

/** Short Bethesda/finding label for a row. */
export function findingLabel(row: EscalationRow): string {
  const b = row.record.bethesdaResult;
  if (b) {
    if (b.squamousCategory === 'ASC' && b.ascSubtype) return b.ascSubtype === 'ASCH' ? 'ASC-H' : 'ASC-US';
    if (b.squamousCategory) return b.squamousCategory;
    if (b.glandularCategory) return b.glandularCategory.replace('_', ' ');
    if (b.generalCategory === 'OtherMalignancy') return 'Other malignancy';
    if (b.otherMalignancy) return b.otherMalignancy;
    if (b.generalCategory) return b.generalCategory;
  }
  return row.trigger === 'NarrativeKeyword' ? 'Narrative keyword' : row.trigger === 'ManualFlag' ? 'Manual flag' : '—';
}

export const patientName = (row: EscalationRow): string =>
  row.record.patient ? `${row.record.patient.firstName} ${row.record.patient.lastName}`.trim() : '—';
