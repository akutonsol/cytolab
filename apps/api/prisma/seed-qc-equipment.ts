/**
 * Seed 3 default equipment items for every lab that has none:
 *   Stainer Unit 1 (Stainer), Centrifuge A (Centrifuge), Microscope 1 (Microscope).
 * Idempotent — skips a lab that already has equipment.
 * Run: npx ts-node prisma/seed-qc-equipment.ts
 */
import { EquipmentType, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULTS: { name: string; type: EquipmentType }[] = [
  { name: 'Stainer Unit 1', type: 'Stainer' },
  { name: 'Centrifuge A', type: 'Centrifuge' },
  { name: 'Microscope 1', type: 'Microscope' },
];

async function main() {
  const labs = await prisma.lab.findMany({ select: { id: true, name: true } });
  let created = 0;
  for (const lab of labs) {
    for (const d of DEFAULTS) {
      const res = await prisma.equipment.upsert({
        where: { labId_name: { labId: lab.id, name: d.name } },
        update: {},
        create: { labId: lab.id, name: d.name, type: d.type },
      });
      if (res.createdAt.getTime() === res.updatedAt.getTime()) created++;
    }
  }
  console.log(`Seeded ${created} equipment item(s) across ${labs.length} lab(s).`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
