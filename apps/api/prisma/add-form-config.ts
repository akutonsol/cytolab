/**
 * One-off: seed default FormConfig (fields + print groups) for the demo lab,
 * both form types. Idempotent — skips a form type that already has a config.
 * Run:  npx ts-node prisma/add-form-config.ts
 */
import { PrismaClient, RequisitionFormType } from '@prisma/client';
import { FORM_DEFAULTS } from '../src/modules/form-config/form-config.defaults';

const prisma = new PrismaClient();
const DEMO_LAB = 'a0cded2b-cd81-4db8-ac8c-65315185c944';

async function main() {
  const lab =
    (await prisma.lab.findUnique({ where: { id: DEMO_LAB } })) ??
    (await prisma.lab.findFirst({ orderBy: { createdAt: 'asc' } }));
  if (!lab) throw new Error('No lab found');

  for (const formType of [RequisitionFormType.Gynecology, RequisitionFormType.NonGynecology]) {
    const existing = await prisma.formConfig.findUnique({ where: { labId_formType: { labId: lab.id, formType } } });
    if (existing) { console.log(`  = ${formType} already configured — skipped`); continue; }
    const d = FORM_DEFAULTS[formType];
    await prisma.formConfig.create({
      data: {
        labId: lab.id,
        formType,
        printGroups: { create: d.groups.map((name, i) => ({ labId: lab.id, name, sortOrder: i })) },
        fields: { create: d.fields.map((f, i) => ({ labId: lab.id, fieldKey: f.fieldKey, label: f.label, fieldType: f.fieldType, sortOrder: i })) },
      },
    });
    console.log(`  + ${formType}: ${d.fields.length} fields, ${d.groups.length} print groups`);
  }
  console.log('Done.');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
