// Client mirror of GET /quality-governance/overview (apps/api quality-governance module).
// Read-only orchestration aggregate; every section carries its own status so a future
// section failure isolates to that section and never collapses permissions or siblings.
// The permission map is descriptive only; owner endpoints remain the enforcement authority.

export type SectionStatus = 'ready' | 'empty' | 'forbidden' | 'error' | 'deferred';

export interface Section<T> {
  status: SectionStatus;
  data: T | null;
  reason?: string;
}

// Descriptive permission map — mirrors real owner permission codes from the caller's
// claims. `medicalDirector` is permission-derived (resultsheet:authorize), never a role
// name. `viewChangeRequest`/`changeChangeRequest` are mirrored truthfully (currently
// unseeded → false for non-superusers), never aliased to record:view.
export interface EffectiveQualityPermissions {
  viewRecord: boolean;
  changeRecord: boolean;
  viewResultSheet: boolean;
  authorize: boolean;
  viewResultEntry: boolean;
  viewReport: boolean;
  security: boolean;
  viewNotification: boolean;
  viewChangeRequest: boolean;
  changeChangeRequest: boolean;
  medicalDirector: boolean;
}

// Overview — a factual composition of owner-recorded summaries only. `open` is the owner's
// own count; `note` is a factual owner-count descriptor. No score, ranking, or inference.
export interface OverviewSource {
  key: string;
  label: string;
  status: 'ready' | 'forbidden' | 'error';
  open: number | null;
  note: string | null;
}
export interface OverviewData {
  asOf: string;
  sources: OverviewSource[];
  unavailable: string[];
}

// Correlation & Discordance — recorded CorrelationCase evidence only. `correlationResult`,
// `discordanceReason`, `reviewRequired` are shown exactly as stored; never recomputed.
export interface CorrelationCaseRow {
  id: string;
  identity: string | null;
  cytologyDiagnosis: string;
  histologyDiagnosis: string | null;
  histologySource: string;
  correlationResult: string | null;
  discordanceReason: string | null;
  reviewRequired: boolean;
  reviewedAt: string | null;
  reviewerName: string | null;
  cytologyDate: string | null;
  createdAt: string | null;
  ownerPath: string;
}
export interface CorrelationSection {
  total: number;
  concordant: number;
  minorDiscordant: number;
  majorDiscordant: number;
  unresolved: number;
  pendingReview: number;
  recent: CorrelationCaseRow[];
}
export interface DiscordanceSection {
  count: number;
  items: CorrelationCaseRow[];
}

// Quality Control — recorded QC evidence. `result` is the stored status; `failureReason`
// and `correctiveAction` are recorded notes (never CAPA/root-cause/effectiveness). No
// severity (the models record none).
export interface QcCheckRow {
  id: string;
  checkType: string;
  result: string;
  failureReason: string | null;
  correctiveAction: string | null;
  equipmentName: string | null;
  performerName: string | null;
  recordIdentity: string | null;
  performedAt: string | null;
  createdAt: string | null;
  ownerPath: string;
}
export interface QcAlertRow {
  id: string;
  status: string;
  relatedCheckType: string | null;
  failureReason: string | null;
  equipmentName: string | null;
  createdAt: string | null;
  resolvedAt: string | null;
  ownerPath: string;
}
export interface QcSection {
  totalChecks: number;
  pass: number;
  fail: number;
  marginal: number;
  openAlerts: number;
  recentChecks: QcCheckRow[];
  alerts: QcAlertRow[];
}

// Proficiency — recorded proficiency evidence. `status` is the owner's recorded state;
// `averageScore` is the owner-computed lab average. No competency/ranking/remediation.
export interface ProficiencyTestRow {
  id: string;
  name: string;
  testType: string;
  status: string;
  administeredByName: string | null;
  passingScore: number | null;
  caseCount: number;
  responderCount: number;
  startDate: string | null;
  endDate: string | null;
  createdAt: string | null;
  ownerPath: string;
}
export interface ProficiencySection {
  totalTests: number;
  completedTests: number;
  averageScore: number | null;
  tests: ProficiencyTestRow[];
}

export interface QualityOverviewAggregate {
  asOf: string;
  permissions: Section<EffectiveQualityPermissions>;
  overview: Section<OverviewData>;
  correlation: Section<CorrelationSection>;
  discordance: Section<DiscordanceSection>;
  qc: Section<QcSection>;
  proficiency: Section<ProficiencySection>;
  escalations: Section<null>;
  recall: Section<null>;
  benchmarks: Section<null>;
  medicalDirector: Section<null>;
  governance: Section<null>;
}
