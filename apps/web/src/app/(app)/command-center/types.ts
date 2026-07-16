// Phase 5 · E3A — Enterprise Command Center UI.
//
// Read-only DISPLAY MIRRORS of the certified E2 API response contracts. The UI
// renders exactly what these endpoints return; it never computes membership,
// counts, status, overdue, urgency, or ownership. Keep in sync with the backend
// `enterprise-case-management.types.ts` — do not add UI-derived fields.

export type SectionStatus = 'ready' | 'empty' | 'forbidden' | 'error' | 'deferred';
export type QueueCategory = 'record-projection' | 'cross-owner' | 'operational-overlay';

export interface EnterpriseCountState {
  value: number | null; // null unless status === 'ready' | 'empty'
  status: SectionStatus;
  reason?: string;
}

export interface EnterpriseUnavailableSource {
  key: string;
  status: SectionStatus;
  reason: string;
}

// GET /enterprise/summary
export interface EnterpriseSummaryCount {
  key: string;
  count: EnterpriseCountState;
}
export interface EnterpriseSummaryResponse {
  asOf: string; // request time — NOT an owner scan/evaluation time
  counts: EnterpriseSummaryCount[];
  unavailable: EnterpriseUnavailableSource[];
}

// GET /enterprise/queues
export interface EnterpriseQueueCatalogItem {
  key: string;
  label: string;
  category: QueueCategory;
  count: EnterpriseCountState;
  ownerPath: string | null;
}
export interface EnterpriseQueueCatalogResponse {
  asOf: string;
  queues: EnterpriseQueueCatalogItem[]; // FROZEN order — render as supplied, never sort
  unavailable: EnterpriseUnavailableSource[];
}

// GET /enterprise/queues/:queue — the allowlisted record row (exact E2 projection)
export interface EnterpriseRecordProjectionRow {
  id: string;
  identifier: string | null;
  labNumber: string | null;
  formType: string | null;
  status: string;
  urgent: boolean;
  specimenDate: string | null;
  createdAt: string;
  statusChangedAt: string | null;
  assignedToId: string | null;
  assignedToName: string | null;
  patientDisplayName: string | null;
  ownerPath: string; // /records/:id — the ONLY navigation target
}
export interface EnterpriseQueueDetailData {
  items: EnterpriseRecordProjectionRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
export interface EnterpriseQueueDetailSection {
  status: SectionStatus;
  data: EnterpriseQueueDetailData | null; // null for forbidden/error/deferred — never render as empty
  reason?: string;
}
export interface EnterpriseQueueDetailResponse {
  queue: string;
  category: QueueCategory;
  section: EnterpriseQueueDetailSection;
  echo: { page: number; pageSize: number; assignedToId: string | null };
}
