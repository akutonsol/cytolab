// Frontend source of truth for feature metadata. Mirrors the backend FeatureKey
// enum (apps/api prisma schema) — keep the two in sync. Tier 1 (Standard/core)
// features are always on and are NOT represented here; only toggleable tier 2-5
// features are gated.

export type FeatureKey =
  // Tier 2 — Clinical
  | 'TAT_ALERTS'
  | 'PRIOR_HISTORY'
  | 'BETHESDA_SYSTEM'
  | 'ABNORMAL_ESCALATION'
  | 'CASE_ASSIGNMENT'
  | 'QC_MODULE'
  | 'APPOINTMENTS'
  // Tier 3 — Operational
  | 'VOICE_TO_TEXT'
  | 'RESULT_TEMPLATES'
  | 'BATCH_AUTHORIZATION'
  | 'REQUISITION_TRACKING'
  | 'SLIDE_LABEL_PRINTING'
  | 'ANCILLARY_ORDERS'
  | 'SCREENING_BATCHES'
  // Tier 4 — Compliance
  | 'BETHESDA_ANALYTICS'
  | 'CORRELATION_TRACKING'
  | 'PROFICIENCY_TESTING'
  | 'REAGENT_TRACKING'
  | 'PATIENT_RECALL'
  | 'REPORT_CENTER'
  | 'QUALITY_GOVERNANCE'
  // Tier 5 — Enterprise
  | 'WSI_VIEWER'
  | 'AI_SCREENING'
  | 'TELECONSULTATION'
  | 'LOINC_SNOMED'
  | 'HL7_FHIR'
  | 'OPERATIONS_HUB'
  | 'ENTERPRISE_ADMINISTRATION'
  | 'ENTERPRISE_CASE_MGMT'
  | 'WORKFORCE_MANAGEMENT';

export interface FeatureDefinition {
  key: FeatureKey;
  name: string;
  description: string;
  /** Fuller explanation shown in the module details dialog. Falls back to `description`. */
  longDescription?: string;
  /** Concrete things the module lets you do — rendered as a bullet list in the details dialog. */
  capabilities?: string[];
  tier: number;
  tierName: string;
  /** Lucide icon name (resolved at render time). */
  icon: string;
  docsUrl?: string | null;
  /** Dedicated nav route, or null when the feature is embedded in a workflow. */
  navPath: string | null;
  dependsOn: FeatureKey[];
  /** True for features not yet built — shown as "Coming Soon", cannot be toggled on. */
  comingSoon?: boolean;
}

export interface TierMeta {
  tier: number;
  name: string;
  description: string;
  /** Tailwind-ish token used for badges/borders in the management UI. */
  color: string;
}

export const TIER_META: Record<number, TierMeta> = {
  1: { tier: 1, name: 'Standard', description: 'Core LIMS features included in all plans. Always enabled.', color: 'slate' },
  2: { tier: 2, name: 'Clinical', description: 'High clinical value features that directly impact patient outcomes.', color: 'indigo' },
  3: { tier: 3, name: 'Operational', description: 'Efficiency tools for lab staff workflows.', color: 'blue' },
  4: { tier: 4, name: 'Compliance', description: 'Analytics and regulatory compliance tools.', color: 'violet' },
  5: { tier: 5, name: 'Enterprise', description: 'Advanced technology differentiators.', color: 'purple' },
  6: { tier: 6, name: 'Workforce', description: 'Staff time, attendance, timesheets and scheduling.', color: 'indigo' },
};

export const FEATURES: Record<FeatureKey, FeatureDefinition> = {
  // ── Tier 2 — Clinical ──────────────────────────────────────────────
  TAT_ALERTS: {
    key: 'TAT_ALERTS',
    name: 'TAT Alerts',
    description: 'Automatic escalation alerts when cases exceed turnaround time targets.',
    longDescription: 'Continuously monitors every open case against your lab’s turnaround-time targets and escalates automatically before a case breaches its SLA.',
    capabilities: ['Per-specimen-type turnaround targets', 'Automatic escalation as a case nears or exceeds its target', 'Dashboard of at-risk and breached cases', 'Alerts routed to the assigned pathologist and supervisor'],
    tier: 2, tierName: 'Clinical', icon: 'Clock', docsUrl: null, navPath: '/tat', dependsOn: [],
  },
  PRIOR_HISTORY: {
    key: 'PRIOR_HISTORY',
    name: 'Prior History Lookup',
    description: 'View patient cytology history when entering and authorizing results.',
    longDescription: 'Surfaces a patient’s previous cytology cases inline while staff enter and authorize results, so prior abnormals are never missed.',
    capabilities: ['Patient cytology timeline on the result-entry screen', 'Highlights prior abnormal or unsatisfactory results', 'One-click open of any prior report during sign-out'],
    tier: 2, tierName: 'Clinical', icon: 'History', docsUrl: null, navPath: null, dependsOn: [],
  },
  BETHESDA_SYSTEM: {
    key: 'BETHESDA_SYSTEM',
    name: 'Bethesda System',
    description: 'Standardized TBS 2014 cervical cytology classification.',
    longDescription: 'Adds the standardized Bethesda System (TBS 2014) classification to cervical cytology reporting for consistent, guideline-aligned diagnoses.',
    capabilities: ['Structured TBS adequacy, category, and interpretation fields', 'Guided category selection during result entry', 'Feeds standardized data into Bethesda Analytics'],
    tier: 2, tierName: 'Clinical', icon: 'ClipboardList', docsUrl: null, navPath: null, dependsOn: [],
  },
  ABNORMAL_ESCALATION: {
    key: 'ABNORMAL_ESCALATION',
    name: 'Abnormal Escalation',
    description: 'Route abnormal findings to a senior pathologist for mandatory secondary review.',
    longDescription: 'Automatically routes abnormal findings to a senior pathologist for a mandatory secondary review before a case can be signed out.',
    capabilities: ['Rule-based routing of abnormal results to senior review', 'Blocks sign-out until secondary review is complete', 'Audit trail of who reviewed and when'],
    tier: 2, tierName: 'Clinical', icon: 'AlertTriangle', docsUrl: null, navPath: '/escalations', dependsOn: [],
  },
  CASE_ASSIGNMENT: {
    key: 'CASE_ASSIGNMENT',
    name: 'Case Assignment & Workload',
    description: 'Assign cases to pathologists and balance workload against daily throughput targets.',
    longDescription: 'Distributes incoming cases across pathologists and keeps individual workloads balanced against daily throughput targets.',
    capabilities: ['Assign or reassign cases to specific pathologists', 'Live workload view per pathologist', 'Balances against configurable daily throughput targets'],
    tier: 2, tierName: 'Clinical', icon: 'Users2', docsUrl: null, navPath: '/workload', dependsOn: [],
  },
  QC_MODULE: {
    key: 'QC_MODULE',
    name: 'Quality Control',
    description: 'Track slide prep, staining, and fixation quality; log QC failures and trends.',
    longDescription: 'Tracks slide preparation, staining, and fixation quality and logs QC failures so you can spot trends before they affect diagnoses.',
    capabilities: ['Log QC checks for prep, staining, and fixation', 'Record and categorize QC failures', 'Trend reporting on recurring quality issues', 'Equipment QC tracking'],
    tier: 2, tierName: 'Clinical', icon: 'ShieldCheck', docsUrl: null, navPath: '/qc', dependsOn: [],
  },
  APPOINTMENTS: {
    key: 'APPOINTMENTS',
    name: 'Appointments',
    description: 'Schedule and manage patient appointments for collection, follow-up, and recall visits.',
    longDescription: 'Schedules and manages patient visits for specimen collection, follow-up, and recall.',
    capabilities: ['Book and manage collection and follow-up appointments', 'Calendar view of scheduled visits', 'Links appointments to recall reminders'],
    tier: 2, tierName: 'Clinical', icon: 'CalendarDays', docsUrl: null, navPath: '/appointments', dependsOn: [],
  },

  // ── Tier 3 — Operational ───────────────────────────────────────────
  VOICE_TO_TEXT: {
    key: 'VOICE_TO_TEXT',
    name: 'Voice-to-Text Dictation',
    description: 'Dictate findings using the browser microphone in result entry.',
    longDescription: 'Lets pathologists dictate findings with the browser microphone directly into result entry — no external transcription hardware required.',
    capabilities: ['In-browser dictation in result-entry fields', 'No external transcription hardware required', 'Edit and correct transcribed text inline'],
    tier: 3, tierName: 'Operational', icon: 'Mic', docsUrl: null, navPath: null, dependsOn: [],
  },
  RESULT_TEMPLATES: {
    key: 'RESULT_TEMPLATES',
    name: 'Result Templates',
    description: 'Reusable cytology report templates for common findings.',
    longDescription: 'Reusable report templates for common findings that speed up and standardize result entry.',
    capabilities: ['Create and manage reusable report templates', 'Insert a template into result entry in one click', 'Standardizes wording across pathologists'],
    tier: 3, tierName: 'Operational', icon: 'FileText', docsUrl: null, navPath: '/result-templates', dependsOn: [],
  },
  BATCH_AUTHORIZATION: {
    key: 'BATCH_AUTHORIZATION',
    name: 'Batch Authorization',
    description: 'Review and sign off multiple result sheets in a single guided pass.',
    longDescription: 'Review and sign off multiple result sheets in a single guided pass instead of one at a time.',
    capabilities: ['Queue of results ready for authorization', 'Guided one-by-one review with keyboard flow', 'Bulk sign-out of reviewed cases'],
    tier: 3, tierName: 'Operational', icon: 'ListChecks', docsUrl: null, navPath: '/batch-authorize', dependsOn: [],
  },
  REQUISITION_TRACKING: {
    key: 'REQUISITION_TRACKING',
    name: 'Requisition Tracking',
    description: 'Track the paper requisition form from receipt to filing — a full chain-of-custody trail.',
    longDescription: 'Tracks the paper requisition form from receipt through filing for a complete chain-of-custody trail.',
    capabilities: ['Log each requisition handling step from receipt to filing', 'Chain-of-custody audit trail', 'Locate the physical form at any time'],
    tier: 3, tierName: 'Operational', icon: 'PackageSearch', docsUrl: null, navPath: '/req-tracking', dependsOn: [],
  },
  SLIDE_LABEL_PRINTING: {
    key: 'SLIDE_LABEL_PRINTING',
    name: 'Slide Label Printing',
    description: 'Generate and print barcoded slide and cassette labels for specimens.',
    longDescription: 'Generates and prints barcoded slide and cassette labels for specimens.',
    capabilities: ['Barcoded slide and cassette label generation', 'Print directly from the specimen record', 'Scannable barcodes for downstream tracking'],
    tier: 3, tierName: 'Operational', icon: 'Printer', docsUrl: null, navPath: null, dependsOn: [],
  },
  ANCILLARY_ORDERS: {
    key: 'ANCILLARY_ORDERS',
    name: 'Ancillary Orders',
    description: 'Order and track ancillary tests (IHC, special stains, molecular) on specimens.',
    longDescription: 'Adds an ancillary-order workflow so staff can request and track add-on tests (IHC, special stains, molecular, cytochemistry) against a specimen through to completion.',
    capabilities: ['Create ancillary/add-on test orders on a specimen', 'Track order status Ordered → In Process → Complete', 'Flag orders that block sign-out', 'Dedicated open-orders work queue'],
    tier: 3, tierName: 'Operational', icon: 'Microscope', docsUrl: null, navPath: '/ancillary-orders', dependsOn: [],
  },
  SCREENING_BATCHES: {
    key: 'SCREENING_BATCHES',
    name: 'Screening Batches',
    description: 'Group specimens into cytotechnologist screening batches through their review lifecycle.',
    longDescription: 'Organizes specimens into cytotechnologist screening batches and tracks each batch through Draft → Ready → Assigned → In Screening → Completed.',
    capabilities: ['Assemble specimens into screening batches', 'Assign batches to cytotechnologists', 'Track batch lifecycle and progress', 'Screening-batch work console'],
    tier: 3, tierName: 'Operational', icon: 'Layers', docsUrl: null, navPath: '/screening-batches', dependsOn: [],
  },

  // ── Tier 4 — Compliance ────────────────────────────────────────────
  BETHESDA_ANALYTICS: {
    key: 'BETHESDA_ANALYTICS',
    name: 'Bethesda Analytics',
    description: 'Aggregate TBS category distributions, ASC/SIL ratios, and CAP reporting benchmarks.',
    longDescription: 'Aggregates TBS category distributions and ASC/SIL ratios against CAP benchmarks for compliance reporting. Requires the Bethesda System module.',
    capabilities: ['TBS category distribution charts', 'ASC/SIL ratio monitoring', 'CAP benchmark comparisons', 'Exportable compliance reports'],
    tier: 4, tierName: 'Compliance', icon: 'BarChart3', docsUrl: null, navPath: '/bethesda-analytics', dependsOn: ['BETHESDA_SYSTEM'],
  },
  CORRELATION_TRACKING: {
    key: 'CORRELATION_TRACKING',
    name: 'Cyto-Histo Correlation',
    description: 'Correlate cytology results against histology follow-up for discrepancy review.',
    longDescription: 'Correlates cytology results against histology follow-up to surface discrepancies for review.',
    capabilities: ['Match cytology cases to histology follow-up', 'Flag cyto-histo discrepancies', 'Discrepancy review worklist'],
    tier: 4, tierName: 'Compliance', icon: 'GitCompare', docsUrl: null, navPath: '/correlation', dependsOn: [],
  },
  PROFICIENCY_TESTING: {
    key: 'PROFICIENCY_TESTING',
    name: 'Proficiency Testing',
    description: 'Circulate unknown cases for blind review and track pathologist accuracy for CAP/CLIA.',
    longDescription: 'Circulates unknown cases for blind review and tracks pathologist accuracy for CAP/CLIA proficiency requirements.',
    capabilities: ['Circulate blinded unknown cases', 'Track per-pathologist accuracy', 'CAP/CLIA proficiency records'],
    tier: 4, tierName: 'Compliance', icon: 'GraduationCap', docsUrl: null, navPath: '/proficiency', dependsOn: [],
  },
  REAGENT_TRACKING: {
    key: 'REAGENT_TRACKING',
    name: 'Reagent & Lot Tracking',
    description: 'Track reagent lots, expiry, and QC per batch for regulatory compliance.',
    longDescription: 'Tracks reagent lots, expiry dates, and per-batch QC for regulatory compliance.',
    capabilities: ['Reagent lot and expiry tracking', 'Per-batch QC records', 'Expiry and low-stock awareness'],
    tier: 4, tierName: 'Compliance', icon: 'FlaskConical', docsUrl: null, navPath: '/reagents', dependsOn: [],
  },
  PATIENT_RECALL: {
    key: 'PATIENT_RECALL',
    name: 'Patient Recall',
    description: 'Schedule and track recall reminders for patients due for repeat screening.',
    longDescription: 'Schedules and tracks recall reminders for patients due for repeat screening.',
    capabilities: ['Automatic recall scheduling based on result and interval', 'Worklist of patients due for recall', 'Track reminder status and outcome'],
    tier: 4, tierName: 'Compliance', icon: 'BellRing', docsUrl: null, navPath: '/recalls', dependsOn: [],
  },
  REPORT_CENTER: {
    key: 'REPORT_CENTER',
    name: 'Report Center',
    description: 'Run, customize, and export analytics reports across specimens, clinical, financial, patient, staff, and quality data.',
    longDescription: 'Runs, customizes, and exports analytics reports across specimen, clinical, financial, patient, staff, and quality data.',
    capabilities: ['Prebuilt reports across six data domains', 'Customizable filters and columns', 'Export to standard formats'],
    tier: 4, tierName: 'Compliance', icon: 'FileBarChart', docsUrl: null, navPath: '/report-center', dependsOn: [],
  },
  QUALITY_GOVERNANCE: {
    key: 'QUALITY_GOVERNANCE',
    name: 'Quality & Governance Workspace',
    description: 'Unified workspace aggregating QC, correlation, proficiency, escalations, and governance evidence.',
    longDescription: 'A single orchestration workspace that brings QC checks, cyto-histo correlation, proficiency testing, abnormal escalations, recalls, and governance events into one oversight surface.',
    capabilities: ['One workspace across all quality/compliance evidence', 'Governance and oversight event timeline', 'Cross-module quality worklist', 'Surfaces gaps for accreditation review'],
    tier: 4, tierName: 'Compliance', icon: 'ClipboardCheck', docsUrl: null, navPath: '/quality-governance', dependsOn: [],
  },

  // ── Tier 5 — Enterprise ────────────────────────────────────────────
  WSI_VIEWER: {
    key: 'WSI_VIEWER',
    name: 'Whole Slide Imaging',
    description: 'Digital whole-slide image viewer for remote review and annotation.',
    longDescription: 'A digital whole-slide image viewer for remote review and annotation.',
    capabilities: ['View whole-slide images in the browser', 'Pan, zoom, and annotate regions', 'Enables remote sign-out'],
    tier: 5, tierName: 'Enterprise', icon: 'ScanEye', docsUrl: null, navPath: '/wsi', dependsOn: [],
  },
  AI_SCREENING: {
    key: 'AI_SCREENING',
    name: 'AI Pre-Screening',
    description: 'AI-assisted cytology pre-screening to prioritize and flag abnormal cases.',
    longDescription: 'AI-assisted pre-screening that prioritizes and flags abnormal cases. Requires Whole Slide Imaging.',
    capabilities: ['AI flagging of suspicious regions', 'Case prioritization by abnormality likelihood', 'Assists — never replaces — pathologist review'],
    tier: 5, tierName: 'Enterprise', icon: 'Sparkles', docsUrl: null, navPath: '/ai-screening', dependsOn: ['WSI_VIEWER'],
  },
  TELECONSULTATION: {
    key: 'TELECONSULTATION',
    name: 'Teleconsultation',
    description: 'Share cases with external experts for remote consultation and sign-out.',
    longDescription: 'Shares cases with external experts for remote consultation and sign-out.',
    capabilities: ['Securely share a case with an external expert', 'Remote consultation and second opinion', 'Capture the consultant’s sign-out'],
    tier: 5, tierName: 'Enterprise', icon: 'Video', docsUrl: null, navPath: '/teleconsult', dependsOn: [],
  },
  LOINC_SNOMED: {
    key: 'LOINC_SNOMED',
    name: 'LOINC / SNOMED Coding',
    description: 'Map results to LOINC and SNOMED CT terminologies for interoperability.',
    longDescription: 'Maps results to LOINC and SNOMED CT terminologies for interoperability.',
    capabilities: ['Map results to LOINC codes', 'Map findings to SNOMED CT', 'Standardized coded data for interoperability'],
    tier: 5, tierName: 'Enterprise', icon: 'Tags', docsUrl: null, navPath: '/coding', dependsOn: [],
  },
  HL7_FHIR: {
    key: 'HL7_FHIR',
    name: 'HL7 / FHIR Interface',
    description: 'Exchange orders and results with EHRs over HL7 v2 and FHIR interfaces.',
    longDescription: 'Exchanges orders and results with EHRs over HL7 v2 and FHIR.',
    capabilities: ['Inbound order intake from EHRs', 'Outbound result delivery', 'HL7 v2 and FHIR interfaces'],
    tier: 5, tierName: 'Enterprise', icon: 'Network', docsUrl: null, navPath: '/fhir', dependsOn: [],
  },
  OPERATIONS_HUB: {
    key: 'OPERATIONS_HUB',
    name: 'Operations Command Center',
    description: 'Live laboratory operations dashboard — attention items, in-flight work, and bottlenecks.',
    longDescription: 'A real-time operations command center that surfaces what needs attention, what is in flight, and what is falling behind across the lab, updating live as cases move.',
    capabilities: ['Live operations overview with realtime updates', 'Attention rail for at-risk work', 'End-to-end pipeline board', 'Quality-alert and integration-health drill-downs'],
    tier: 5, tierName: 'Enterprise', icon: 'Activity', docsUrl: null, navPath: '/operations', dependsOn: [],
  },
  ENTERPRISE_ADMINISTRATION: {
    key: 'ENTERPRISE_ADMINISTRATION',
    name: 'Enterprise Administration',
    description: 'Consolidated administration workspace across configuration, users, security, billing, and modules.',
    longDescription: 'A single enterprise administration surface consolidating lab configuration, branding, users, roles, security, clients, billing, services, forms, and module toggles.',
    capabilities: ['One workspace over ~20 admin sections', 'Cross-cutting configuration and controls', 'Enterprise-wide user, role, and security management', 'Module/feature-flag administration'],
    tier: 5, tierName: 'Enterprise', icon: 'Building2', docsUrl: null, navPath: '/enterprise-administration', dependsOn: [],
  },
  ENTERPRISE_CASE_MGMT: {
    key: 'ENTERPRISE_CASE_MGMT',
    name: 'Enterprise Case Management',
    description: 'Multi-queue enterprise case-management console for triaging and routing cases at scale.',
    longDescription: 'An enterprise case-management command center that presents case queues, summaries, and detail panels for triaging and routing work across the organization at scale.',
    capabilities: ['Multi-queue case console', 'Summary cards and queue rails', 'Case detail and routing panel', 'Enterprise-scale triage'],
    tier: 5, tierName: 'Enterprise', icon: 'LayoutGrid', docsUrl: null, navPath: '/command-center', dependsOn: [],
  },
  // ── Tier 6 — Workforce ─────────────────────────────────────────────
  WORKFORCE_MANAGEMENT: {
    key: 'WORKFORCE_MANAGEMENT',
    name: 'Workforce Management',
    description: 'Time clock, attendance, timesheets and shift scheduling for lab staff.',
    longDescription: 'Time clock, attendance, timesheets, and shift scheduling for lab staff. Feeds the Payroll engine.',
    capabilities: ['Staff time clock and attendance', 'Timesheets and overtime', 'Shift scheduling and leave', 'Feeds the Payroll engine'],
    tier: 6, tierName: 'Workforce', icon: 'Clock', docsUrl: null, navPath: '/workforce', dependsOn: [],
  },
};

export const ALL_FEATURES: FeatureDefinition[] = Object.values(FEATURES);
export const FEATURE_KEYS = Object.keys(FEATURES) as FeatureKey[];

/** A feature is "built" (togglable & enforceable) when it is not marked comingSoon. */
export const isBuilt = (key: FeatureKey): boolean => !FEATURES[key].comingSoon;
