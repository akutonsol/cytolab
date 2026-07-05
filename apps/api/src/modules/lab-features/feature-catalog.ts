import { FeatureKey } from '@prisma/client';

/**
 * Backend source of truth for feature tiers and build status.
 *
 * Tier 1 (Standard/core) features are always on and are NOT persisted as
 * LabFeature rows — they are enforced in code and never appear here. Only the
 * toggleable tier 2-5 keys live in this catalog and in the database.
 *
 * `BUILT` marks features that already ship in the product; on seed these default
 * to enabled (labs get them immediately). Everything else seeds disabled and is
 * surfaced in the UI as "Coming Soon".
 */
export const FEATURE_TIERS: Record<FeatureKey, number> = {
  // Tier 2 — Clinical
  TAT_ALERTS: 2,
  PRIOR_HISTORY: 2,
  BETHESDA_SYSTEM: 2,
  ABNORMAL_ESCALATION: 2,
  CASE_ASSIGNMENT: 2,
  QC_MODULE: 2,
  // Tier 3 — Operational
  VOICE_TO_TEXT: 3,
  RESULT_TEMPLATES: 3,
  BATCH_AUTHORIZATION: 3,
  REQUISITION_TRACKING: 3,
  SLIDE_LABEL_PRINTING: 3,
  // Tier 4 — Compliance
  BETHESDA_ANALYTICS: 4,
  CORRELATION_TRACKING: 4,
  PROFICIENCY_TESTING: 4,
  REAGENT_TRACKING: 4,
  PATIENT_RECALL: 4,
  // Tier 5 — Enterprise
  WSI_VIEWER: 5,
  AI_SCREENING: 5,
  TELECONSULTATION: 5,
  LOINC_SNOMED: 5,
  HL7_FHIR: 5,
};

/** Features already built and deployed — enabled by default on seed. */
export const BUILT_FEATURES: ReadonlySet<FeatureKey> = new Set<FeatureKey>([
  'TAT_ALERTS',
  'PRIOR_HISTORY',
  'BETHESDA_SYSTEM',
  'ABNORMAL_ESCALATION',
  'CASE_ASSIGNMENT',
  'QC_MODULE',
  'BATCH_AUTHORIZATION',
  'REQUISITION_TRACKING',
  'SLIDE_LABEL_PRINTING',
  'BETHESDA_ANALYTICS',
  'CORRELATION_TRACKING',
  'PROFICIENCY_TESTING',
  'REAGENT_TRACKING',
  'PATIENT_RECALL',
  'VOICE_TO_TEXT',
  'RESULT_TEMPLATES',
  'WSI_VIEWER',
  'AI_SCREENING',
]);

export const ALL_FEATURE_KEYS = Object.keys(FEATURE_TIERS) as FeatureKey[];
