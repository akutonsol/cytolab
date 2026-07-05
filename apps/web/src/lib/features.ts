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
  // Tier 4 — Compliance
  | 'BETHESDA_ANALYTICS'
  | 'CORRELATION_TRACKING'
  | 'PROFICIENCY_TESTING'
  | 'REAGENT_TRACKING'
  | 'PATIENT_RECALL'
  | 'REPORT_CENTER'
  // Tier 5 — Enterprise
  | 'WSI_VIEWER'
  | 'AI_SCREENING'
  | 'TELECONSULTATION'
  | 'LOINC_SNOMED'
  | 'HL7_FHIR'
  | 'WORKFORCE_MANAGEMENT';

export interface FeatureDefinition {
  key: FeatureKey;
  name: string;
  description: string;
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
    tier: 2, tierName: 'Clinical', icon: 'Clock', docsUrl: null, navPath: '/tat', dependsOn: [],
  },
  PRIOR_HISTORY: {
    key: 'PRIOR_HISTORY',
    name: 'Prior History Lookup',
    description: 'View patient cytology history when entering and authorizing results.',
    tier: 2, tierName: 'Clinical', icon: 'History', docsUrl: null, navPath: null, dependsOn: [],
  },
  BETHESDA_SYSTEM: {
    key: 'BETHESDA_SYSTEM',
    name: 'Bethesda System',
    description: 'Standardized TBS 2014 cervical cytology classification.',
    tier: 2, tierName: 'Clinical', icon: 'ClipboardList', docsUrl: null, navPath: null, dependsOn: [],
  },
  ABNORMAL_ESCALATION: {
    key: 'ABNORMAL_ESCALATION',
    name: 'Abnormal Escalation',
    description: 'Route abnormal findings to a senior pathologist for mandatory secondary review.',
    tier: 2, tierName: 'Clinical', icon: 'AlertTriangle', docsUrl: null, navPath: '/escalations', dependsOn: [],
  },
  CASE_ASSIGNMENT: {
    key: 'CASE_ASSIGNMENT',
    name: 'Case Assignment & Workload',
    description: 'Assign cases to pathologists and balance workload against daily throughput targets.',
    tier: 2, tierName: 'Clinical', icon: 'Users2', docsUrl: null, navPath: '/workload', dependsOn: [],
  },
  QC_MODULE: {
    key: 'QC_MODULE',
    name: 'Quality Control',
    description: 'Track slide prep, staining, and fixation quality; log QC failures and trends.',
    tier: 2, tierName: 'Clinical', icon: 'ShieldCheck', docsUrl: null, navPath: '/qc', dependsOn: [],
  },
  APPOINTMENTS: {
    key: 'APPOINTMENTS',
    name: 'Appointments',
    description: 'Schedule and manage patient appointments for collection, follow-up, and recall visits.',
    tier: 2, tierName: 'Clinical', icon: 'CalendarDays', docsUrl: null, navPath: '/appointments', dependsOn: [],
  },

  // ── Tier 3 — Operational ───────────────────────────────────────────
  VOICE_TO_TEXT: {
    key: 'VOICE_TO_TEXT',
    name: 'Voice-to-Text Dictation',
    description: 'Dictate findings using the browser microphone in result entry.',
    tier: 3, tierName: 'Operational', icon: 'Mic', docsUrl: null, navPath: null, dependsOn: [],
  },
  RESULT_TEMPLATES: {
    key: 'RESULT_TEMPLATES',
    name: 'Result Templates',
    description: 'Reusable cytology report templates for common findings.',
    tier: 3, tierName: 'Operational', icon: 'FileText', docsUrl: null, navPath: '/result-templates', dependsOn: [],
  },
  BATCH_AUTHORIZATION: {
    key: 'BATCH_AUTHORIZATION',
    name: 'Batch Authorization',
    description: 'Review and sign off multiple result sheets in a single guided pass.',
    tier: 3, tierName: 'Operational', icon: 'ListChecks', docsUrl: null, navPath: '/batch-authorize', dependsOn: [],
  },
  REQUISITION_TRACKING: {
    key: 'REQUISITION_TRACKING',
    name: 'Requisition Tracking',
    description: 'Track the paper requisition form from receipt to filing — a full chain-of-custody trail.',
    tier: 3, tierName: 'Operational', icon: 'PackageSearch', docsUrl: null, navPath: '/req-tracking', dependsOn: [],
  },
  SLIDE_LABEL_PRINTING: {
    key: 'SLIDE_LABEL_PRINTING',
    name: 'Slide Label Printing',
    description: 'Generate and print barcoded slide and cassette labels for specimens.',
    tier: 3, tierName: 'Operational', icon: 'Printer', docsUrl: null, navPath: null, dependsOn: [],
  },

  // ── Tier 4 — Compliance ────────────────────────────────────────────
  BETHESDA_ANALYTICS: {
    key: 'BETHESDA_ANALYTICS',
    name: 'Bethesda Analytics',
    description: 'Aggregate TBS category distributions, ASC/SIL ratios, and CAP reporting benchmarks.',
    tier: 4, tierName: 'Compliance', icon: 'BarChart3', docsUrl: null, navPath: '/bethesda-analytics', dependsOn: ['BETHESDA_SYSTEM'],
  },
  CORRELATION_TRACKING: {
    key: 'CORRELATION_TRACKING',
    name: 'Cyto-Histo Correlation',
    description: 'Correlate cytology results against histology follow-up for discrepancy review.',
    tier: 4, tierName: 'Compliance', icon: 'GitCompare', docsUrl: null, navPath: '/correlation', dependsOn: [],
  },
  PROFICIENCY_TESTING: {
    key: 'PROFICIENCY_TESTING',
    name: 'Proficiency Testing',
    description: 'Circulate unknown cases for blind review and track pathologist accuracy for CAP/CLIA.',
    tier: 4, tierName: 'Compliance', icon: 'GraduationCap', docsUrl: null, navPath: '/proficiency', dependsOn: [],
  },
  REAGENT_TRACKING: {
    key: 'REAGENT_TRACKING',
    name: 'Reagent & Lot Tracking',
    description: 'Track reagent lots, expiry, and QC per batch for regulatory compliance.',
    tier: 4, tierName: 'Compliance', icon: 'FlaskConical', docsUrl: null, navPath: '/reagents', dependsOn: [],
  },
  PATIENT_RECALL: {
    key: 'PATIENT_RECALL',
    name: 'Patient Recall',
    description: 'Schedule and track recall reminders for patients due for repeat screening.',
    tier: 4, tierName: 'Compliance', icon: 'BellRing', docsUrl: null, navPath: '/recalls', dependsOn: [],
  },
  REPORT_CENTER: {
    key: 'REPORT_CENTER',
    name: 'Report Center',
    description: 'Run, customize, and export analytics reports across specimens, clinical, financial, patient, staff, and quality data.',
    tier: 4, tierName: 'Compliance', icon: 'FileBarChart', docsUrl: null, navPath: '/report-center', dependsOn: [],
  },

  // ── Tier 5 — Enterprise ────────────────────────────────────────────
  WSI_VIEWER: {
    key: 'WSI_VIEWER',
    name: 'Whole Slide Imaging',
    description: 'Digital whole-slide image viewer for remote review and annotation.',
    tier: 5, tierName: 'Enterprise', icon: 'ScanEye', docsUrl: null, navPath: '/wsi', dependsOn: [],
  },
  AI_SCREENING: {
    key: 'AI_SCREENING',
    name: 'AI Pre-Screening',
    description: 'AI-assisted cytology pre-screening to prioritize and flag abnormal cases.',
    tier: 5, tierName: 'Enterprise', icon: 'Sparkles', docsUrl: null, navPath: '/ai-screening', dependsOn: ['WSI_VIEWER'],
  },
  TELECONSULTATION: {
    key: 'TELECONSULTATION',
    name: 'Teleconsultation',
    description: 'Share cases with external experts for remote consultation and sign-out.',
    tier: 5, tierName: 'Enterprise', icon: 'Video', docsUrl: null, navPath: '/teleconsult', dependsOn: [],
  },
  LOINC_SNOMED: {
    key: 'LOINC_SNOMED',
    name: 'LOINC / SNOMED Coding',
    description: 'Map results to LOINC and SNOMED CT terminologies for interoperability.',
    tier: 5, tierName: 'Enterprise', icon: 'Tags', docsUrl: null, navPath: '/coding', dependsOn: [],
  },
  HL7_FHIR: {
    key: 'HL7_FHIR',
    name: 'HL7 / FHIR Interface',
    description: 'Exchange orders and results with EHRs over HL7 v2 and FHIR interfaces.',
    tier: 5, tierName: 'Enterprise', icon: 'Network', docsUrl: null, navPath: '/fhir', dependsOn: [],
  },
  // ── Tier 6 — Workforce ─────────────────────────────────────────────
  WORKFORCE_MANAGEMENT: {
    key: 'WORKFORCE_MANAGEMENT',
    name: 'Workforce Management',
    description: 'Time clock, attendance, timesheets and shift scheduling for lab staff.',
    tier: 6, tierName: 'Workforce', icon: 'Clock', docsUrl: null, navPath: '/workforce', dependsOn: [],
  },
};

export const ALL_FEATURES: FeatureDefinition[] = Object.values(FEATURES);
export const FEATURE_KEYS = Object.keys(FEATURES) as FeatureKey[];

/** A feature is "built" (togglable & enforceable) when it is not marked comingSoon. */
export const isBuilt = (key: FeatureKey): boolean => !FEATURES[key].comingSoon;
