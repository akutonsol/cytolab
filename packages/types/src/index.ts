// @cytolab/types — canonical shared types & enums between API and Web.
// Keep this package DEPENDENCY-FREE (types, enums, and const literals only).
//
// Migration note: apps are not yet rewired to import from here. Consuming-app
// migration (adding `transpilePackages` in Next config, replacing local copies)
// is tracked in TECH_DEBT.md. Until then, this is the reference home only.

/** Internal record lifecycle (source of truth for RecordStatus). */
export const RECORD_STATUSES = [
  'DRAFT',
  'RECEIVED',
  'IN_PROGRESS',
  'PARTIAL',
  'COMPLETED',
  'BILLED',
  'PAID',
  'CANCELLED',
] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];

/** Client-facing simplified specimen lifecycle (portal view). */
export const WORKFLOW_STAGES = ['Collect', 'Process', 'AI Analysis', 'Review', 'Report'] as const;
export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];
