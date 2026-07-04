// Shared types + display metadata for Requisition Tracking.

export type TrackingStage = 'Pending' | 'FormReceived' | 'BenchReceived' | 'Verified' | 'Processing' | 'Filed' | 'Rejected';
export type FormCondition = 'Good' | 'Damaged' | 'Incomplete' | 'Illegible';

export interface TrackingCard {
  requisitionId: string;
  referenceNo: string;
  clientName: string;
  patientName: string;
  currentStage: TrackingStage;
  stageEnteredAt: string;
  dateReceived: string;
  fileLocation: string | null;
  barcodeValue: string | null;
}

export interface TrackingEvent {
  id: string; stage: TrackingStage; notes: string | null; scannedBarcode: string | null; performedAt: string;
  performedBy: { firstName: string; lastName: string } | null;
}

export interface TrackingDetail extends TrackingCard {
  detail: {
    formCondition: FormCondition; formConditionNotes: string | null;
    formReceivedAt: string | null; formReceivedBy: string | null;
    benchReceivedAt: string | null; benchReceivedBy: string | null;
    verifiedAt: string | null; verifiedBy: string | null; verificationNotes: string | null;
    filedAt: string | null; filedBy: string | null; fileLocation: string | null;
    barcodeScanned: boolean; barcodeValue: string | null;
  };
  events: TrackingEvent[];
}

export interface TrackingStats {
  pendingCount: number; formReceivedCount: number; benchReceivedCount: number;
  verifiedCount: number; filedCount: number; rejectedCount: number;
  filedToday: number; avgTimeToBench: number | null; avgTimeToVerify: number | null;
}

// The 5 pipeline columns (Rejected is terminal, shown separately). Zero orange.
export const PIPELINE: TrackingStage[] = ['Pending', 'FormReceived', 'BenchReceived', 'Verified', 'Filed'];

export const STAGE_META: Record<TrackingStage, { label: string; bg: string; fg: string }> = {
  Pending: { label: 'Pending', bg: '#F1F5F9', fg: '#475569' },
  FormReceived: { label: 'Form Received', bg: '#DBEAFE', fg: '#1D4ED8' },
  BenchReceived: { label: 'At Bench', bg: '#EEF2FF', fg: '#4F46E5' },
  Verified: { label: 'Verified', bg: '#F5F3FF', fg: '#7C3AED' },
  Processing: { label: 'Processing', bg: '#EFF6FF', fg: '#2563EB' },
  Filed: { label: 'Filed', bg: '#DCFCE7', fg: '#16A34A' },
  Rejected: { label: 'Rejected', bg: '#FEE2E2', fg: '#B91C1C' },
};

// Next-stage action per current stage (mirrors the backend NEXT_ACTION map).
export const NEXT_ACTION: Partial<Record<TrackingStage, { label: string; endpoint: string }>> = {
  Pending: { label: 'Receive Form', endpoint: 'receive-form' },
  FormReceived: { label: 'Receive at Bench', endpoint: 'receive-bench' },
  BenchReceived: { label: 'Verify', endpoint: 'verify' },
  Verified: { label: 'File', endpoint: 'file' },
};

/** Human "2h 15m" from an ISO timestamp to now; plus an over-24h flag. */
export function timeInStage(iso: string): { label: string; over24h: boolean } {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
  const label = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  return { label, over24h: ms > 24 * 3_600_000 };
}
