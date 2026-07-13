// Domain status → presentation tokens (P2).
//
// A SINGLE presentation source for the app's recorded status enums. It maps each REAL
// owner value to a semantic `tone` (rendered by <Badge> from Tier-2 tokens), a human
// `label` (matching the owner's own wording — never re-worded), and an optional non-colour
// `icon`. It is PRESENTATION ONLY:
//   • it never reinterprets a status, computes severity, or infers urgency;
//   • it never combines unrelated domains into one hierarchy;
//   • it never replaces the owner enums — pages still read the real value and only ask this
//     module how to *show* it.
// Each domain is a separate map. Add a new domain by adding a new map — do not fold values
// from one domain into another.
//
// Zero-orange: the shared <Badge> `warning` tone paints the lighter `--color-warning` on an
// amber-100 fill, whose anti-aliased edges fall inside the detector's trip box (globals.css
// documents this: "text on amber-100 must be --status-warning-strong"). Making <Badge warning>
// compliant is a Badge-primitive change out of P2 scope, so — per the P2 brief ("if warning
// cannot be represented without amber/orange, use a neutral or non-orange semantic treatment")
// — warning-semantic statuses are mapped to `neutral` here. The recorded label (e.g. "Due",
// "Marginal") still carries the meaning (non-colour signal), and this guarantees zero-orange.
// FOLLOW-UP: give <Badge> a detector-safe amber `warning` tone (`--status-warning-strong` on
// amber-50/100), then re-point these entries to `warning` — tracked for a later phase.

import { AlertTriangle, CheckCircle2, type LucideIcon } from 'lucide-react';

// Subset of the Badge tone union used for recorded statuses. `warning` is intentionally not
// emitted yet (see the zero-orange note above) but stays in the type for the follow-up.
export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'primary';

export interface StatusPresentation {
  tone: StatusTone;
  label: string;
  icon?: LucideIcon;
}

const s = (tone: StatusTone, label: string, icon?: LucideIcon): StatusPresentation => ({ tone, label, icon });

// ── RecordStatus (Prisma enum) ────────────────────────────────────────────────
export const RECORD_STATUS: Record<string, StatusPresentation> = {
  Pending: s('neutral', 'Pending'),
  Submitted: s('info', 'Submitted'),
  Processing: s('info', 'Processing'),
  Partial: s('info', 'Partial'),
  Resulted: s('info', 'Resulted'),
  Completed: s('success', 'Completed'),
  Approved: s('success', 'Approved', CheckCircle2),
  Billed: s('neutral', 'Billed'),
  Paid: s('success', 'Paid'),
  OnHold: s('neutral', 'On Hold'),
};

// ── Recall status (lib/recall.ts) ─────────────────────────────────────────────
export const RECALL_STATUS: Record<string, StatusPresentation> = {
  Pending: s('neutral', 'Pending'),
  Due: s('neutral', 'Due'),
  Overdue: s('danger', 'Overdue', AlertTriangle),
  Completed: s('success', 'Completed', CheckCircle2),
  Cancelled: s('neutral', 'Cancelled'),
  Declined: s('neutral', 'Declined'),
};

// ── Escalation status (lib/escalations.ts) ────────────────────────────────────
export const ESCALATION_STATUS: Record<string, StatusPresentation> = {
  Pending: s('neutral', 'Pending'),
  Acknowledged: s('info', 'Acknowledged'),
  UnderReview: s('primary', 'Under Review'),
  Resolved: s('success', 'Resolved', CheckCircle2),
  Dismissed: s('neutral', 'Dismissed'),
};

// ── Escalation severity (lib/escalations.ts) ──────────────────────────────────
export const ESCALATION_SEVERITY: Record<string, StatusPresentation> = {
  Abnormal: s('neutral', 'Abnormal'),
  HighGrade: s('danger', 'High Grade', AlertTriangle),
  Malignant: s('danger', 'Malignant', AlertTriangle),
};

// ── QC result (lib/qc.ts) ─────────────────────────────────────────────────────
export const QC_RESULT: Record<string, StatusPresentation> = {
  Pass: s('success', 'Pass', CheckCircle2),
  Marginal: s('neutral', 'Marginal'),
  Fail: s('danger', 'Fail', AlertTriangle),
};

// ── QC / equipment alert status (lib/qc.ts) ───────────────────────────────────
export const QC_ALERT_STATUS: Record<string, StatusPresentation> = {
  Open: s('neutral', 'Open'),
  Acknowledged: s('info', 'Acknowledged'),
  Resolved: s('success', 'Resolved', CheckCircle2),
};

// ── Proficiency test status ───────────────────────────────────────────────────
export const PROFICIENCY_STATUS: Record<string, StatusPresentation> = {
  Draft: s('neutral', 'Draft'),
  Active: s('info', 'Active'),
  Closed: s('neutral', 'Closed'),
};

// ── System health check status (CheckStatus) ──────────────────────────────────
export const SYSTEM_HEALTH_STATUS: Record<string, StatusPresentation> = {
  ok: s('success', 'OK', CheckCircle2),
  warn: s('neutral', 'Warning'),
  error: s('danger', 'Error', AlertTriangle),
};

/**
 * Safe lookup. Returns the mapped presentation, or a neutral fallback that shows the raw
 * value verbatim — so an unknown/new owner value renders truthfully (never crashes, never
 * silently hidden, never re-labelled).
 */
export function statusPresentation(
  map: Record<string, StatusPresentation>,
  value: string | null | undefined,
): StatusPresentation {
  if (value && map[value]) return map[value];
  return s('neutral', value ?? '—');
}
