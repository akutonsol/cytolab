/**
 * Seed the standard cytology coding dictionary (LOINC / SNOMED CT / ICD-10) for
 * every lab. Idempotent — upserts on the unique (labId, system, code).
 * Run: npx ts-node prisma/seed-medical-codes.ts
 */
import { CodeSystem, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CODES: { system: CodeSystem; code: string; display: string; category: string }[] = [
  // LOINC — tests / observations
  { system: 'LOINC', code: '10524-7', display: 'Microscopic observation in Cervical smear', category: 'Cytology' },
  { system: 'LOINC', code: '19765-7', display: 'Microscopic observation in Cervical smear by Cytotech', category: 'Cytology' },
  { system: 'LOINC', code: '33717-0', display: 'Cytology report of Cervical smear', category: 'Cytology' },
  { system: 'LOINC', code: 'LP7786-0', display: 'Pathology study', category: 'Procedure' },
  // SNOMED CT — diagnoses (mapped to Bethesda)
  { system: 'SNOMED_CT', code: '416940007', display: 'Past history of (Bethesda) NILM', category: 'Diagnosis' },
  { system: 'SNOMED_CT', code: '373883009', display: 'Cervical cytology - NILM', category: 'Diagnosis' },
  { system: 'SNOMED_CT', code: '285838002', display: 'ASC-US', category: 'Diagnosis' },
  { system: 'SNOMED_CT', code: '285854005', display: 'Low grade SIL (LSIL)', category: 'Diagnosis' },
  { system: 'SNOMED_CT', code: '285855006', display: 'High grade SIL (HSIL)', category: 'Diagnosis' },
  { system: 'SNOMED_CT', code: '413448000', display: 'ASC-H', category: 'Diagnosis' },
  { system: 'SNOMED_CT', code: '254886006', display: 'Squamous cell carcinoma of cervix', category: 'Diagnosis' },
  { system: 'SNOMED_CT', code: '413443001', display: 'AGC', category: 'Diagnosis' },
  // ICD-10
  { system: 'ICD10', code: 'R87.619', display: 'Abnormal cytological findings in specimen from cervix uteri', category: 'Diagnosis' },
  { system: 'ICD10', code: 'Z12.4', display: 'Encounter for screening for malignant neoplasm of cervix', category: 'Procedure' },
  { system: 'ICD10', code: 'N87.1', display: 'Moderate cervical dysplasia', category: 'Diagnosis' },
  { system: 'ICD10', code: 'N87.0', display: 'Mild cervical dysplasia', category: 'Diagnosis' },
];

async function main() {
  const labs = await prisma.lab.findMany({ select: { id: true } });
  let created = 0;
  for (const lab of labs) {
    for (const c of CODES) {
      const res = await prisma.medicalCode.upsert({
        where: { labId_system_code: { labId: lab.id, system: c.system, code: c.code } },
        update: { display: c.display, category: c.category },
        create: { labId: lab.id, system: c.system, code: c.code, display: c.display, category: c.category },
      });
      if (res.createdAt.getTime() === new Date().getTime()) created++;
    }
  }
  const total = await prisma.medicalCode.count();
  console.log(`Seeded ${CODES.length} standard codes across ${labs.length} lab(s); dictionary now holds ${total} rows.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
