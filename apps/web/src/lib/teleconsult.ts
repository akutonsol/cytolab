// Shared types + display metadata for Teleconsultation. Zero orange — Priority
// urgency and Partial agreement use detector-safe amber (#B45309).

export type ConsultUrgency = 'Routine' | 'Priority' | 'Urgent';
export type ConsultStatus = 'Pending' | 'Viewed' | 'InProgress' | 'Responded' | 'Accepted' | 'Declined' | 'Expired';
export type ConsultAgreement = 'FullAgreement' | 'PartialAgreement' | 'Disagreement';

export interface Consult {
  id: string;
  recordId: string;
  status: ConsultStatus;
  urgency: ConsultUrgency;
  consultantName: string;
  consultantEmail: string;
  consultantInstitution: string | null;
  clinicalSummary: string;
  specificQuestion: string;
  sharedNarrative: boolean;
  sharedBethesda: boolean;
  sharedImages: boolean;
  consultantResponse: string | null;
  consultantDiagnosis: string | null;
  agreementLevel: ConsultAgreement | null;
  respondedAt: string | null;
  accessToken: string;
  tokenExpiresAt: string;
  dueDate: string | null;
  notes: string | null;
  createdAt: string;
  requestedById: string;
  caseReference: string;
  labNo: string;
  specimenType: string;
  patientInitials: string;
  requesterName: string;
  isOverdue: boolean;
}

export interface ConsultAnalytics {
  total: number;
  pending: number;
  responded: number;
  avgResponseDays: number;
  agreementRate: number;
  byUrgency: { urgency: string; count: number }[];
}

export interface ConsultPrefill {
  recordId: string;
  labNo: string;
  patientInitials: string;
  specimenType: string;
  bethesdaClassification: string | null;
  hasWsi: boolean;
}

export interface PublicCase {
  id: string;
  caseReference: string;
  specimenType: string;
  clinicalSummary: string;
  specificQuestion: string;
  urgency: ConsultUrgency;
  narrative: string | null;
  bethesdaClassification: string | null;
  requestingLab: string;
  dueDate: string | null;
  status: ConsultStatus;
}

export const URGENCY_META: Record<ConsultUrgency, { label: string; bg: string; fg: string }> = {
  Routine: { label: 'Routine', bg: '#F1F5F9', fg: '#475569' },
  Priority: { label: 'Priority', bg: '#FFFBEB', fg: '#B45309' }, // amber, not orange
  Urgent: { label: 'Urgent', bg: '#FEE2E2', fg: '#B91C1C' },
};

export const STATUS_META: Record<ConsultStatus, { label: string; bg: string; fg: string }> = {
  Pending: { label: 'Pending', bg: '#F1F5F9', fg: '#64748B' },
  Viewed: { label: 'Viewed', bg: '#EEF2FF', fg: '#4F46E5' },
  InProgress: { label: 'In Progress', bg: '#EEF2FF', fg: '#4F46E5' },
  Responded: { label: 'Responded', bg: '#DBEAFE', fg: '#1D4ED8' },
  Accepted: { label: 'Accepted', bg: '#DCFCE7', fg: '#16A34A' },
  Declined: { label: 'Declined', bg: '#F1F5F9', fg: '#94A3B8' },
  Expired: { label: 'Expired', bg: '#FEE2E2', fg: '#B91C1C' },
};

export const AGREEMENT_META: Record<ConsultAgreement, { label: string; bg: string; fg: string }> = {
  FullAgreement: { label: 'Full Agreement', bg: '#DCFCE7', fg: '#16A34A' },
  PartialAgreement: { label: 'Partial Agreement', bg: '#FFFBEB', fg: '#B45309' }, // amber, not orange
  Disagreement: { label: 'Disagreement', bg: '#FEE2E2', fg: '#B91C1C' },
};

/** Progress timeline stages in order; index of the current stage from status. */
export const TIMELINE = ['Sent', 'Viewed', 'Responded', 'Accepted'] as const;
export function timelineIndex(status: ConsultStatus): number {
  switch (status) {
    case 'Pending': return 0;
    case 'Viewed':
    case 'InProgress': return 1;
    case 'Responded': return 2;
    case 'Accepted': return 3;
    case 'Declined':
    case 'Expired': return 2; // terminal after response/expiry
    default: return 0;
  }
}

export const shortDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
export const dateTime = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
