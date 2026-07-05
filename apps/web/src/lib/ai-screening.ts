// Shared types + display metadata for AI Screening.
// Zero orange — Medium uses detector-safe amber (#B45309).

export type AIScreenStatus = 'Pending' | 'Processing' | 'Completed' | 'Failed' | 'Skipped';
export type AIConfidenceLevel = 'High' | 'Medium' | 'Low';

export interface AIFinding { region: string; finding: string; confidence: number }

export interface AIScreening {
  id: string;
  recordId: string;
  status: AIScreenStatus;
  confidence: number | null;
  confidenceLevel: AIConfidenceLevel | null;
  findings: AIFinding[] | null;
  primaryFinding: string | null;
  flaggedAreas: number;
  agreedWithAI: boolean | null;
  pathologistNote: string | null;
  processedAt: string | null;
  reviewedAt: string | null;
  reviewedById: string | null;
  createdAt: string;
  patientName: string;
  labNo: string;
  specimenType: string | null;
  reviewerName: string | null;
}

export interface AIAnalytics {
  totalScreened: number;
  pendingReview: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
  agreementRate: number;
  avgConfidence: number;
  bySpecimenType: { type: string; count: number; avgConfidence: number }[];
  trendByMonth: { month: string; count: number; avgConfidence: number }[];
}

export const LEVEL_META: Record<AIConfidenceLevel, { label: string; ring: string; bg: string; fg: string }> = {
  High: { label: 'High', ring: '#16A34A', bg: '#DCFCE7', fg: '#16A34A' },
  Medium: { label: 'Medium', ring: '#B45309', bg: '#FFFBEB', fg: '#B45309' }, // amber, not orange
  Low: { label: 'Low', ring: '#DC2626', bg: '#FEE2E2', fg: '#B91C1C' },
};

export function levelFor(confidence: number | null): AIConfidenceLevel | null {
  if (confidence == null) return null;
  if (confidence >= 90) return 'High';
  if (confidence >= 70) return 'Medium';
  return 'Low';
}

/** Ring / accent color for a confidence value or level. */
export function confidenceColor(level: AIConfidenceLevel | null, confidence?: number | null): string {
  const l = level ?? levelFor(confidence ?? null);
  return l ? LEVEL_META[l].ring : '#94A3B8';
}

export const SPECIMEN_LABEL: Record<string, string> = {
  Gynecology: 'Gynecologic',
  NonGynecology: 'Non-gynecologic',
  Unknown: 'Unknown',
};

export const shortDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
