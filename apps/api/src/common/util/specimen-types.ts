import { RequisitionFormType, SpecimenType } from '@prisma/client';

/**
 * Which specimen types belong to each cytology form class. The record form
 * offers only the chosen form type's chips; SpecimenType (material) and
 * RequisitionFormType (test class) are orthogonal axes, joined by this map.
 */
export const GYN_SPECIMEN_TYPES: SpecimenType[] = [
  SpecimenType.ENDOCERV_ASP,
  SpecimenType.CERV_SCRAP,
  SpecimenType.VAG_POOL,
];

export const NONGYN_SPECIMEN_TYPES: SpecimenType[] = [
  SpecimenType.URINE,
  SpecimenType.CSF,
  SpecimenType.PLEURAL_FLD,
  SpecimenType.BREAST_ASP,
  SpecimenType.JOINT_ASP,
  SpecimenType.SYNOVIAL_FLD,
  SpecimenType.OTHER,
];

export function specimenTypesForForm(formType: RequisitionFormType): SpecimenType[] {
  return formType === RequisitionFormType.Gynecology ? GYN_SPECIMEN_TYPES : NONGYN_SPECIMEN_TYPES;
}
