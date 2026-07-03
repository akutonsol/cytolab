// Mirror of the API's specimen-type class map. The record form offers only the
// chosen form type's chips; labels use the legacy dotted display form.

export type FormType = 'Gynecology' | 'NonGynecology';

export const SPECIMEN_LABELS: Record<string, string> = {
  ENDOCERV_ASP: 'ENDOCERV.ASP',
  CERV_SCRAP: 'CERV.SCRAP',
  VAG_POOL: 'VAG.POOL',
  URINE: 'URINE',
  CSF: 'CSF',
  PLEURAL_FLD: 'PLEURAL.FLD',
  BREAST_ASP: 'BREAST.ASP',
  JOINT_ASP: 'JOINT.ASP',
  SYNOVIAL_FLD: 'SYNOVIAL.FLD',
  OTHER: 'OTHER',
  SPUTUM: 'SPUTUM',
  BRONCHIAL_WASH: 'BRONCHIAL.WASH',
  THYROID_FNA: 'THYROID.FNA',
  LYMPH_NODE: 'LYMPH.NODE',
  BONE_MARROW: 'BONE.MARROW',
  SKIN_SCRAPING: 'SKIN.SCRAPING',
};

export const GYN_SPECIMEN_TYPES = ['ENDOCERV_ASP', 'CERV_SCRAP', 'VAG_POOL'];
export const NONGYN_SPECIMEN_TYPES = [
  'URINE',
  'CSF',
  'PLEURAL_FLD',
  'BREAST_ASP',
  'JOINT_ASP',
  'SYNOVIAL_FLD',
  'OTHER',
  'SPUTUM',
  'BRONCHIAL_WASH',
  'THYROID_FNA',
  'LYMPH_NODE',
  'BONE_MARROW',
  'SKIN_SCRAPING',
];

export function specimenTypesForForm(formType: FormType): string[] {
  return formType === 'Gynecology' ? GYN_SPECIMEN_TYPES : NONGYN_SPECIMEN_TYPES;
}
