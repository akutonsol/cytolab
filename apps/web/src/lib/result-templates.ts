// Shared types + helpers for the Result Templates module.

export type TemplateCategory = 'Cervical' | 'Endometrial' | 'Respiratory' | 'Urinary' | 'Breast' | 'Thyroid' | 'Other';
export const CATEGORIES: TemplateCategory[] = ['Cervical', 'Endometrial', 'Respiratory', 'Urinary', 'Breast', 'Thyroid', 'Other'];

export interface ResultTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  shortCode: string | null;
  description: string | null;
  isActive: boolean;
  usageCount: number;
  specimenAdequacy: string | null;
  generalCategory: string | null;
  interpretation: string | null;
  recommendation: string | null;
  additionalNotes?: string | null;
  findings?: { key: string; value: string }[] | null;
  createdAt: string;
  createdBy: { id: string; firstName: string; lastName: string } | null;
}

/** Compose a template's fields into a result-sheet narrative block. */
export function composeNarrative(t: Pick<ResultTemplate, 'specimenAdequacy' | 'generalCategory' | 'interpretation' | 'recommendation' | 'additionalNotes'>): string {
  const parts: string[] = [];
  if (t.specimenAdequacy) parts.push(`Specimen Adequacy: ${t.specimenAdequacy}`);
  if (t.generalCategory) parts.push(`General Categorization: ${t.generalCategory}`);
  if (t.interpretation) parts.push(`Interpretation:\n${t.interpretation}`);
  if (t.recommendation) parts.push(`Recommendation:\n${t.recommendation}`);
  if (t.additionalNotes) parts.push(t.additionalNotes);
  return parts.join('\n\n');
}
