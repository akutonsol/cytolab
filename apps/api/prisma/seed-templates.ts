/**
 * Seed standard Bethesda-based result templates for every lab.
 * Idempotent (upsert on [labId, name]). Run after migration:
 *   npx ts-node prisma/seed-templates.ts
 */
import { PrismaClient, TemplateCategory } from '@prisma/client';

const prisma = new PrismaClient();

const TEMPLATES = [
  {
    name: 'NILM - Normal',
    shortCode: 'NILM',
    category: TemplateCategory.Cervical,
    specimenAdequacy: 'Satisfactory for evaluation',
    generalCategory: 'Negative for Intraepithelial Lesion or Malignancy',
    interpretation: 'Negative for intraepithelial lesion or malignancy. No epithelial cell abnormality identified.',
    recommendation: 'Routine screening as per clinical guidelines.',
  },
  {
    name: 'LSIL - Low Grade',
    shortCode: 'LSIL',
    category: TemplateCategory.Cervical,
    specimenAdequacy: 'Satisfactory for evaluation',
    generalCategory: 'Epithelial Cell Abnormality',
    interpretation: 'Low-grade squamous intraepithelial lesion (LSIL). HPV/mild dysplasia changes identified.',
    recommendation: 'Colposcopy recommended. Clinical correlation advised.',
  },
  {
    name: 'HSIL - High Grade',
    shortCode: 'HSIL',
    category: TemplateCategory.Cervical,
    specimenAdequacy: 'Satisfactory for evaluation',
    generalCategory: 'Epithelial Cell Abnormality',
    interpretation: 'High-grade squamous intraepithelial lesion (HSIL). Moderate to severe dysplasia identified.',
    recommendation: 'Urgent colposcopy and biopsy recommended.',
  },
  {
    name: 'ASCUS - Atypical Squamous',
    shortCode: 'ASCUS',
    category: TemplateCategory.Cervical,
    specimenAdequacy: 'Satisfactory for evaluation',
    generalCategory: 'Epithelial Cell Abnormality',
    interpretation: 'Atypical squamous cells of undetermined significance (ASC-US).',
    recommendation: 'HPV reflex testing or repeat cytology in 1 year.',
  },
  {
    name: 'Unsatisfactory Specimen',
    shortCode: 'UNSAT',
    category: TemplateCategory.Cervical,
    specimenAdequacy: 'Unsatisfactory for evaluation',
    generalCategory: 'Unsatisfactory',
    interpretation: 'Specimen is unsatisfactory for evaluation. Insufficient squamous cellularity.',
    recommendation: 'Repeat specimen collection recommended.',
  },
  {
    name: 'AGUS - Atypical Glandular',
    shortCode: 'AGUS',
    category: TemplateCategory.Cervical,
    specimenAdequacy: 'Satisfactory for evaluation',
    generalCategory: 'Epithelial Cell Abnormality',
    interpretation: 'Atypical glandular cells of undetermined significance (AGC).',
    recommendation: 'Colposcopy with endocervical sampling. Consider endometrial sampling if age ≥35.',
  },
];

async function main() {
  const labs = await prisma.lab.findMany({ select: { id: true, name: true } });
  if (labs.length === 0) {
    console.log('No labs found — nothing to seed.');
    return;
  }
  let count = 0;
  for (const lab of labs) {
    for (const t of TEMPLATES) {
      await prisma.resultTemplate.upsert({
        where: { labId_name: { labId: lab.id, name: t.name } },
        update: {
          category: t.category,
          shortCode: t.shortCode,
          specimenAdequacy: t.specimenAdequacy,
          generalCategory: t.generalCategory,
          interpretation: t.interpretation,
          recommendation: t.recommendation,
        },
        create: { labId: lab.id, ...t },
      });
      count++;
    }
    console.log(`Seeded ${TEMPLATES.length} templates for lab "${lab.name}"`);
  }
  console.log(`Done — ${count} template upserts across ${labs.length} lab(s).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
