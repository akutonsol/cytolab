// Bethesda System (TBS 2014) — shared types, option lists, and a client mirror of
// the server's narrative/shortCode helpers (bethesda.service.ts) for live preview.

export type SpecimenAdequacy = 'Satisfactory' | 'Unsatisfactory';
export type GeneralCategory = 'NILM' | 'EpithelialAbnormality' | 'OtherMalignancy';
export type SquamousCategory = 'ASC' | 'LSIL' | 'HSIL' | 'SCC';
export type ASCSubtype = 'ASCUS' | 'ASCH';
export type GlandularCategory = 'AGC' | 'AGC_FavorNeoplastic' | 'AIS' | 'Adenocarcinoma' | 'Other';
export type HPVResult = 'Positive' | 'Negative' | 'NotPerformed';
export type BethesdaRecommendation =
  | 'RoutineScreening' | 'RepeatIn1Year' | 'HPVReflexTesting' | 'Colposcopy'
  | 'UrgentColposcopy' | 'EndocervicalSampling' | 'RepeatSpecimen' | 'ClinicalCorrelation';

export interface BethesdaSelections {
  specimenAdequacy: SpecimenAdequacy;
  unsatisfactoryReason?: string | null;
  generalCategory?: GeneralCategory | null;
  organisms?: string[];
  otherNonNeoplastic?: string[];
  squamousCategory?: SquamousCategory | null;
  ascSubtype?: ASCSubtype | null;
  glandularCategory?: GlandularCategory | null;
  glandularSubtype?: string | null;
  otherMalignancy?: string | null;
  hpvResult?: HPVResult | null;
  hpvGenotype?: string | null;
  recommendation?: BethesdaRecommendation | null;
  recommendationNotes?: string | null;
}
export interface BethesdaResult extends BethesdaSelections {
  id: string;
  recordId: string;
  generatedNarrative: string | null;
  shortCode: string | null;
  reportedAt: string;
  reportedBy: { firstName: string; lastName: string } | null;
}

export const GENERAL_LABEL: Record<GeneralCategory, string> = {
  NILM: 'Negative (NILM)', EpithelialAbnormality: 'Epithelial Cell Abnormality', OtherMalignancy: 'Other Malignancy',
};
export const SQUAMOUS_LABEL: Record<SquamousCategory, string> = { ASC: 'ASC', LSIL: 'LSIL', HSIL: 'HSIL', SCC: 'Squamous Cell Carcinoma' };
export const GLANDULAR_LABEL: Record<GlandularCategory, string> = {
  AGC: 'AGC', AGC_FavorNeoplastic: 'AGC — favor neoplastic', AIS: 'Adenocarcinoma in situ (AIS)', Adenocarcinoma: 'Adenocarcinoma', Other: 'Other',
};
export const RECOMMENDATION_LABEL: Record<BethesdaRecommendation, string> = {
  RoutineScreening: 'Routine screening', RepeatIn1Year: 'Repeat cytology in 1 year', HPVReflexTesting: 'HPV reflex testing',
  Colposcopy: 'Colposcopy', UrgentColposcopy: 'Urgent colposcopy + biopsy', EndocervicalSampling: 'Colposcopy + endocervical sampling',
  RepeatSpecimen: 'Repeat specimen collection', ClinicalCorrelation: 'Clinical correlation',
};
export const ORGANISM_OPTIONS = ['Trichomonas vaginalis', 'Candida spp.', 'Shift in flora (bacterial vaginosis)', 'Actinomyces spp.', 'Herpes simplex virus', 'Cytomegalovirus'];
export const NON_NEOPLASTIC_OPTIONS = ['Reactive cellular changes', 'Atrophy', 'Radiation changes', 'Repair', 'Glandular cells status post-hysterectomy', 'IUD-associated changes'];

const GENERAL: Record<GeneralCategory, string> = {
  NILM: 'Negative for Intraepithelial Lesion or Malignancy', EpithelialAbnormality: 'Epithelial Cell Abnormality', OtherMalignancy: 'Other Malignancy',
};
const REC_TEXT: Record<BethesdaRecommendation, string> = {
  RoutineScreening: 'Routine screening as per clinical guidelines.', RepeatIn1Year: 'Repeat cytology in 1 year.',
  HPVReflexTesting: 'HPV reflex testing recommended.', Colposcopy: 'Colposcopy recommended. Clinical correlation advised.',
  UrgentColposcopy: 'Urgent colposcopy and biopsy recommended.', EndocervicalSampling: 'Colposcopy with endocervical sampling.',
  RepeatSpecimen: 'Repeat specimen collection recommended.', ClinicalCorrelation: 'Clinical correlation advised.',
};
const squamousText = (d: BethesdaSelections) => {
  switch (d.squamousCategory) {
    case 'ASC': return d.ascSubtype === 'ASCH' ? 'Atypical squamous cells, cannot exclude high-grade squamous intraepithelial lesion (ASC-H).' : 'Atypical squamous cells of undetermined significance (ASC-US).';
    case 'LSIL': return 'Low-grade squamous intraepithelial lesion (LSIL).';
    case 'HSIL': return 'High-grade squamous intraepithelial lesion (HSIL).';
    case 'SCC': return 'Squamous cell carcinoma.';
    default: return '';
  }
};
const glandularText = (d: BethesdaSelections) => {
  switch (d.glandularCategory) {
    case 'AGC': return 'Atypical glandular cells (AGC).';
    case 'AGC_FavorNeoplastic': return 'Atypical glandular cells, favor neoplastic.';
    case 'AIS': return 'Endocervical adenocarcinoma in situ (AIS).';
    case 'Adenocarcinoma': return 'Adenocarcinoma.';
    case 'Other': return d.glandularSubtype?.trim() || 'Atypical glandular cells, other.';
    default: return '';
  }
};

export function generateNarrative(d: BethesdaSelections): string {
  const blocks: string[] = [];
  blocks.push(`SPECIMEN ADEQUACY: ${d.specimenAdequacy === 'Satisfactory' ? 'Satisfactory for evaluation' : `Unsatisfactory for evaluation${d.unsatisfactoryReason ? ` — ${d.unsatisfactoryReason}` : ''}`}`);
  if (d.specimenAdequacy === 'Unsatisfactory') {
    blocks.push(`RECOMMENDATION: ${d.recommendation ? REC_TEXT[d.recommendation] : REC_TEXT.RepeatSpecimen}${d.recommendationNotes ? ` ${d.recommendationNotes}` : ''}`);
    return blocks.join('\n\n');
  }
  if (d.generalCategory) blocks.push(`GENERAL CATEGORIZATION: ${GENERAL[d.generalCategory]}`);
  const interp: string[] = [];
  if (d.generalCategory === 'NILM') {
    interp.push('Negative for intraepithelial lesion or malignancy.');
    if (d.organisms?.length) interp.push(`Organisms identified: ${d.organisms.join(', ')}.`);
    if (d.otherNonNeoplastic?.length) interp.push(`Other non-neoplastic findings: ${d.otherNonNeoplastic.join(', ')}.`);
  } else if (d.generalCategory === 'EpithelialAbnormality') {
    const s = squamousText(d); if (s) interp.push(s);
    const g = glandularText(d); if (g) interp.push(g);
  } else if (d.generalCategory === 'OtherMalignancy' && d.otherMalignancy) interp.push(d.otherMalignancy.trim());
  if (interp.length) blocks.push(`INTERPRETATION / RESULT:\n${interp.join('\n')}`);
  if (d.hpvResult) blocks.push(`HPV TESTING: ${d.hpvResult === 'NotPerformed' ? 'Not performed' : d.hpvResult}${d.hpvGenotype ? ` (genotype ${d.hpvGenotype})` : ''}.`);
  if (d.recommendation) blocks.push(`RECOMMENDATION: ${REC_TEXT[d.recommendation]}${d.recommendationNotes ? ` ${d.recommendationNotes}` : ''}`);
  return blocks.join('\n\n');
}

export function deriveShortCode(d: BethesdaSelections): string | null {
  if (d.specimenAdequacy === 'Unsatisfactory') return 'UNSAT';
  if (d.generalCategory === 'NILM') return 'NILM';
  if (d.squamousCategory) return d.squamousCategory === 'ASC' ? (d.ascSubtype === 'ASCH' ? 'ASC-H' : 'ASCUS') : d.squamousCategory;
  if (d.glandularCategory) return 'AGUS';
  if (d.generalCategory === 'OtherMalignancy') return 'MALIG';
  return null;
}
