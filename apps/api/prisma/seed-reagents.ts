/**
 * Seed 5 common cytology reagent lots for every lab that has none.
 * Idempotent — upserts on (labId, lotNumber).
 * Run: npx ts-node prisma/seed-reagents.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const REAGENTS: { name: string; lotNumber: string; expiry: string; unit: string; storageTemp: string }[] = [
  { name: 'Papanicolaou Stain', lotNumber: 'PAP-2026-001', expiry: '2026-12-31', unit: 'mL', storageTemp: 'Room temp' },
  { name: 'Hematoxylin', lotNumber: 'HEM-2026-001', expiry: '2026-09-30', unit: 'mL', storageTemp: 'Room temp' },
  { name: 'Eosin', lotNumber: 'EON-2026-001', expiry: '2026-11-30', unit: 'mL', storageTemp: 'Room temp' },
  { name: 'Fixative (95% Ethanol)', lotNumber: 'FIX-2026-001', expiry: '2027-06-30', unit: 'L', storageTemp: 'Flammable cabinet' },
  { name: 'Mounting Medium', lotNumber: 'MNT-2026-001', expiry: '2027-03-31', unit: 'mL', storageTemp: 'Room temp' },
];

async function main() {
  const labs = await prisma.lab.findMany({ select: { id: true } });
  let created = 0;
  for (const lab of labs) {
    for (const r of REAGENTS) {
      const res = await prisma.reagentLot.upsert({
        where: { labId_lotNumber: { labId: lab.id, lotNumber: r.lotNumber } },
        update: {},
        create: {
          labId: lab.id, name: r.name, lotNumber: r.lotNumber, expiryDate: new Date(r.expiry),
          unit: r.unit, storageTemp: r.storageTemp, status: 'Active',
        },
      });
      if (res.createdAt.getTime() === res.updatedAt.getTime()) created++;
    }
  }
  console.log(`Seeded ${created} reagent lot(s) across ${labs.length} lab(s).`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
