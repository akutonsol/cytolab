// Client mirror of the Screening Batch owner allowlists (Phase 4.2 · C7).
// These match the C3 response mappers exactly — NO labId, createdById,
// assignedById, screenedById, nested Lab/User/Record, patient/result/diagnosis.
// The API is authoritative for tenancy, lifecycle, membership, and completion.

export type ScreeningBatchStatus =
  | 'Draft'
  | 'Ready'
  | 'Assigned'
  | 'InScreening'
  | 'Completed'
  | 'Closed'
  | 'Cancelled';

export type ScreeningDisposition = 'Pending' | 'Screened' | 'Flagged' | 'QCSelected';

// Owner-recorded dispositions a client may set (never a reset to Pending).
export type RecordableDisposition = Exclude<ScreeningDisposition, 'Pending'>;

export interface ScreeningBatch {
  id: string;
  batchNumber: string;
  status: ScreeningBatchStatus;
  assignedToId: string | null;
  assignedAt: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  closedAt: string | null;
  notes: string | null;
  caseCount: number;
  pendingCount: number;
}

export interface ScreeningBatchCase {
  id: string;
  recordId: string;
  disposition: ScreeningDisposition;
  screenedAt: string | null;
  addedAt: string;
  updatedAt: string;
  notes: string | null;
}

export interface ScreeningBatchDetail extends ScreeningBatch {
  cases: ScreeningBatchCase[];
}

export interface QueueResult {
  items: ScreeningBatch[];
  total: number;
  cap: number;
  truncated: boolean;
}

export interface OperationalSummary {
  openBatchCount: number;
  openCaseCount: number;
  pendingCaseCount: number;
  byStatus: { status: ScreeningBatchStatus; count: number }[];
}

// ── Truthful presentation labels (persisted workflow language only) ───────────
export const STATUS_LABEL: Record<ScreeningBatchStatus, string> = {
  Draft: 'Draft',
  Ready: 'Ready',
  Assigned: 'Assigned',
  InScreening: 'In Screening',
  Completed: 'Completed',
  Closed: 'Closed',
  Cancelled: 'Cancelled',
};

export const DISPOSITION_LABEL: Record<ScreeningDisposition, string> = {
  Pending: 'Pending',
  Screened: 'Screened',
  Flagged: 'Flagged',
  QCSelected: 'QC Selected',
};

// Badge tones — all from semantic tokens (zero orange; no warning/amber tone used).
export const STATUS_TONE: Record<ScreeningBatchStatus, 'neutral' | 'info' | 'success' | 'muted'> = {
  Draft: 'neutral',
  Ready: 'info',
  Assigned: 'info',
  InScreening: 'info',
  Completed: 'success',
  Closed: 'muted',
  Cancelled: 'muted',
};

export const DISPOSITION_TONE: Record<ScreeningDisposition, 'neutral' | 'info' | 'success' | 'danger'> = {
  Pending: 'neutral',
  Screened: 'success',
  Flagged: 'danger',
  QCSelected: 'info',
};

// UI-convenience mirror of the owner transition matrix. The server rejects any
// illegal transition regardless of what the client shows. `Assign`/`disposition`
// are separate endpoints and are not modeled as status edges here.
export const STATUS_ACTIONS: Record<
  ScreeningBatchStatus,
  { to: ScreeningBatchStatus; label: string; destructive?: boolean }[]
> = {
  Draft: [{ to: 'Ready', label: 'Mark Ready' }, { to: 'Cancelled', label: 'Cancel', destructive: true }],
  Ready: [{ to: 'Assigned', label: 'Mark Assigned' }, { to: 'Cancelled', label: 'Cancel', destructive: true }],
  Assigned: [{ to: 'InScreening', label: 'Start screening' }, { to: 'Cancelled', label: 'Cancel', destructive: true }],
  InScreening: [{ to: 'Completed', label: 'Complete' }, { to: 'Cancelled', label: 'Cancel', destructive: true }],
  Completed: [{ to: 'Closed', label: 'Close' }],
  Closed: [],
  Cancelled: [],
};

export const NON_TERMINAL: ScreeningBatchStatus[] = [
  'Draft',
  'Ready',
  'Assigned',
  'InScreening',
  'Completed',
];

export const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

export const fmtDateTime = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
