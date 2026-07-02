/**
 * One-off: seed a small service catalog + a default tax for the demo lab so the
 * Billing "Create Invoice" flow has services to pick and a default tax to apply.
 * Idempotent — skips services (by code) / the tax (by name) that already exist.
 * Run:  npx ts-node prisma/add-billing-catalog.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DEMO_LAB = 'a0cded2b-cd81-4db8-ac8c-65315185c944';

// price in minor units (cents)
const SERVICES = [
  { name: 'Pap Smear Cytology', code: 'PAP', price: 4500 },
  { name: 'Fine Needle Aspiration', code: 'FNA', price: 12000 },
  { name: 'Non-Gyn Cytology Panel', code: 'NGC', price: 8000 },
  { name: 'Urgent Processing Surcharge', code: 'URG', price: 3000 },
];

async function main() {
  const lab =
    (await prisma.lab.findUnique({ where: { id: DEMO_LAB } })) ??
    (await prisma.lab.findFirst({ orderBy: { createdAt: 'asc' } }));
  if (!lab) throw new Error('No lab found');

  let created = 0;
  for (const s of SERVICES) {
    if (await prisma.service.findFirst({ where: { labId: lab.id, code: s.code } })) continue;
    await prisma.service.create({ data: { labId: lab.id, ...s, active: true } });
    created++;
  }
  if (!(await prisma.tax.findFirst({ where: { labId: lab.id, name: 'GCT' } }))) {
    await prisma.tax.create({ data: { labId: lab.id, name: 'GCT', code: 'GCT', rateBasisPoints: 1500, isDefault: true } });
  }
  console.log(`Services created ${created} (now ${await prisma.service.count({ where: { labId: lab.id } })}), taxes ${await prisma.tax.count({ where: { labId: lab.id } })}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
