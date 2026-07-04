import { EscalationSeverity, EscalationTrigger } from '@prisma/client';

/** The Bethesda fields relevant to severity (a subset of BethesdaResult). */
export interface BethesdaLite {
  specimenAdequacy?: string | null;
  generalCategory?: string | null;
  squamousCategory?: string | null;
  ascSubtype?: string | null;
  glandularCategory?: string | null;
  otherMalignancy?: string | null;
}

export interface SeverityResult {
  severity: EscalationSeverity;
  trigger: EscalationTrigger;
  /** Short human-readable reason (e.g. "HSIL", "keyword: carcinoma"). */
  reason: string;
}

/**
 * Derive escalation severity from a structured Bethesda classification.
 * Returns null when the classification warrants no escalation (NILM /
 * Unsatisfactory / empty).
 */
export function severityFromBethesda(b: BethesdaLite | null | undefined): SeverityResult | null {
  if (!b) return null;

  // Malignant — immediate escalation.
  if (
    b.squamousCategory === 'SCC' ||
    b.glandularCategory === 'Adenocarcinoma' ||
    b.glandularCategory === 'AIS' ||
    b.generalCategory === 'OtherMalignancy' ||
    (b.otherMalignancy && b.otherMalignancy.trim().length > 0)
  ) {
    const reason =
      b.squamousCategory === 'SCC' ? 'SCC'
        : b.glandularCategory === 'Adenocarcinoma' ? 'Adenocarcinoma'
          : b.glandularCategory === 'AIS' ? 'AIS'
            : b.generalCategory === 'OtherMalignancy' ? 'Other malignancy'
              : 'Malignancy noted';
    return { severity: 'Malignant', trigger: 'BethesdaClassification', reason };
  }

  // High-grade — urgent review required.
  if (
    b.squamousCategory === 'HSIL' ||
    b.ascSubtype === 'ASCH' ||
    b.glandularCategory === 'AGC_FavorNeoplastic'
  ) {
    const reason =
      b.squamousCategory === 'HSIL' ? 'HSIL'
        : b.ascSubtype === 'ASCH' ? 'ASC-H'
          : 'AGC (favor neoplastic)';
    return { severity: 'HighGrade', trigger: 'BethesdaClassification', reason };
  }

  // Abnormal — notify physician, flag for review.
  if (
    b.squamousCategory === 'LSIL' ||
    b.ascSubtype === 'ASCUS' ||
    b.glandularCategory === 'AGC'
  ) {
    const reason =
      b.squamousCategory === 'LSIL' ? 'LSIL'
        : b.ascSubtype === 'ASCUS' ? 'ASC-US'
          : 'AGC';
    return { severity: 'Abnormal', trigger: 'BethesdaClassification', reason };
  }

  // NILM, Unsatisfactory, or a bare general categorization → no escalation.
  return null;
}

// Keyword sets, most-severe first (checked in order). Matched case-insensitively
// against the narrative text.
const MALIGNANT_KW = ['malign', 'carcinoma', 'invasive', 'scc'];
const HIGHGRADE_KW = ['hsil', 'high-grade', 'high grade', 'asch', 'asc-h'];
const ABNORMAL_KW = ['lsil', 'low-grade', 'low grade', 'ascus', 'asc-us', 'agus', 'atypical'];

/**
 * Derive severity from free-text narrative keyword matching — used when no
 * structured Bethesda result exists. Returns null when nothing matches.
 */
export function severityFromNarrative(narrative: string | null | undefined): SeverityResult | null {
  if (!narrative) return null;
  const text = narrative.toLowerCase();
  const hit = (kws: string[]) => kws.find((k) => text.includes(k));

  const m = hit(MALIGNANT_KW);
  if (m) return { severity: 'Malignant', trigger: 'NarrativeKeyword', reason: `keyword: ${m}` };
  const h = hit(HIGHGRADE_KW);
  if (h) return { severity: 'HighGrade', trigger: 'NarrativeKeyword', reason: `keyword: ${h}` };
  const a = hit(ABNORMAL_KW);
  if (a) return { severity: 'Abnormal', trigger: 'NarrativeKeyword', reason: `keyword: ${a}` };
  return null;
}

/** Bethesda takes precedence; fall back to narrative keyword matching. */
export function deriveSeverity(
  bethesda: BethesdaLite | null | undefined,
  narrative: string | null | undefined,
): SeverityResult | null {
  return severityFromBethesda(bethesda) ?? severityFromNarrative(narrative);
}

/** Expected review timeframe per severity — surfaced in the UI. */
export const REVIEW_TIMEFRAME: Record<EscalationSeverity, string> = {
  Malignant: 'immediate',
  HighGrade: 'urgent (within 24 hours)',
  Abnormal: 'routine (within 5 days)',
};
