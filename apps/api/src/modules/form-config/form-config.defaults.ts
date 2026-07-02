import { FormFieldType, RequisitionFormType } from '@prisma/client';

// Default UI config for the two hardcoded clinical-feature forms. `fieldKey`
// matches the real Prisma column name on GynClinicalFeatures /
// NonGynClinicalFeatures (or Record, for clinicalDiagnosis) — never renamed.
export interface DefaultField { fieldKey: string; label: string; fieldType: FormFieldType }
export interface FormDefaults { fields: DefaultField[]; groups: string[] }

const T = FormFieldType.TEXT;
const C = FormFieldType.CHECKBOX;

export const FORM_DEFAULTS: Record<RequisitionFormType, FormDefaults> = {
  [RequisitionFormType.Gynecology]: {
    fields: [
      { fieldKey: 'registrationNo', label: 'Registration No.', fieldType: T },
      { fieldKey: 'routineCheck', label: 'Routine Check', fieldType: C },
      { fieldKey: 'previousCytology', label: 'Previous Cytology', fieldType: C },
      { fieldKey: 'lmp', label: 'LMP', fieldType: T },
      // clinicalDiagnosis lives on Record (not GynClinicalFeatures) — same key.
      { fieldKey: 'clinicalDiagnosis', label: 'Clinical Diagnosis', fieldType: T },
      { fieldKey: 'clinicalAppearanceOfCervix', label: 'Clinical Appearance of Cervix', fieldType: T },
      { fieldKey: 'nowPregnant', label: 'Now Pregnant', fieldType: C },
      { fieldKey: 'pregnancies', label: 'Pregnancies', fieldType: T },
      { fieldKey: 'leucorrhea', label: 'Leucorrhea', fieldType: T },
      { fieldKey: 'menopause', label: 'Menopause', fieldType: C },
      { fieldKey: 'dateOfMenopause', label: 'Date of Menopause', fieldType: T },
      { fieldKey: 'lengthOfCycle', label: 'Length of Cycle', fieldType: T },
      { fieldKey: 'pelvicAbnormalities', label: 'Pelvic Abnormalities', fieldType: T },
    ],
    groups: ['GYNAECOLOGICAL DETAILS', 'CLINICAL APPEARANCE OF CERVIX', 'PREVIOUS CYTOLOGY', 'Registration No.'],
  },
  [RequisitionFormType.NonGynecology]: {
    fields: [
      { fieldKey: 'registrationNo', label: 'Registration No.', fieldType: T },
      { fieldKey: 'sampleDescription', label: 'Sample Description', fieldType: T },
      { fieldKey: 'natureAndSource', label: 'Nature & Source of Specimen', fieldType: T },
    ],
    groups: ['REGISTRATION NO.', 'NON-GYNAECOLOGICAL DETAILS'],
  },
};
