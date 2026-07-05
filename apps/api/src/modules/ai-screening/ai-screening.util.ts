import { AIConfidence } from '@prisma/client';

/** Readable AI "primary finding" text keyed by Bethesda short code. */
export const FINDING_TEXT: Record<string, string> = {
  UNSAT: 'Unsatisfactory specimen',
  NILM: 'Negative for intraepithelial lesion (NILM)',
  ASCUS: 'Atypical squamous cells (ASC-US)',
  'ASC-H': 'Atypical squamous cells, cannot exclude HSIL',
  LSIL: 'Low-grade squamous intraepithelial lesion',
  HSIL: 'High-grade squamous intraepithelial lesion',
  SCC: 'Squamous cell carcinoma',
  AGUS: 'Atypical glandular cells',
  MALIG: 'Malignant cells present',
};

export const ABNORMAL_CODES = new Set(['ASCUS', 'ASC-H', 'LSIL', 'HSIL', 'SCC', 'AGUS', 'MALIG']);

export function confidenceLevelFor(c: number): AIConfidence {
  if (c >= 90) return 'High';
  if (c >= 70) return 'Medium';
  return 'Low';
}

export const rnd = (lo: number, hi: number): number => Math.round(lo + Math.random() * (hi - lo));
