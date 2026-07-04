// Clinical recall-interval derivation from a Bethesda classification.
// High-grade / malignant results return null (escalation handles those — not a
// recall). Standard screening-guideline intervals otherwise.

export interface BethesdaLite {
  specimenAdequacy?: string | null;
  generalCategory?: string | null;
  squamousCategory?: string | null;
  ascSubtype?: string | null;
  glandularCategory?: string | null;
}

export interface RecallInterval { months: number; diagnosis: string }

export function recallIntervalFor(b: BethesdaLite | null | undefined): RecallInterval | null {
  if (!b) return null;
  // Unsatisfactory → repeat collection in 3 months.
  if (b.specimenAdequacy === 'Unsatisfactory') return { months: 3, diagnosis: 'UNSAT' };

  // High-grade / malignant → no recall (abnormal-escalation covers these).
  if (b.squamousCategory === 'HSIL' || b.squamousCategory === 'SCC') return null;
  if (b.squamousCategory === 'ASC' && b.ascSubtype === 'ASCH') return null;
  if (['AIS', 'Adenocarcinoma', 'AGC_FavorNeoplastic'].includes(b.glandularCategory ?? '')) return null;
  if (b.generalCategory === 'OtherMalignancy') return null;

  // Low-grade / atypical → 12-month repeat.
  if (b.squamousCategory === 'ASC' && b.ascSubtype === 'ASCUS') return { months: 12, diagnosis: 'ASC-US' };
  if (b.squamousCategory === 'LSIL') return { months: 12, diagnosis: 'LSIL' };
  if (b.glandularCategory === 'AGC') return { months: 12, diagnosis: 'AGC' };

  // Normal → 3-year routine recall.
  if (b.generalCategory === 'NILM') return { months: 36, diagnosis: 'NILM' };
  return null;
}
