/**
 * Seed a default TAT config for every lab that has none.
 * Standard cytology: routine 5 business days (120h); urgent/high-grade 24h;
 * warn 24h before the deadline. Run: npx ts-node prisma/seed-tat.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const labs = await prisma.lab.findMany({ select: { id: true, name: true } });
  let created = 0;
  for (const lab of labs) {
    const existing = await prisma.tATConfig.count({ where: { labId: lab.id } });
    if (existing > 0) continue;
    await prisma.tATConfig.create({
      data: { labId: lab.id, name: 'Standard Cytology', specimenType: null, thresholdHours: 120, warningHours: 24, urgentThresholdHours: 24 },
    });
    created++;
  }
  console.log(`Seeded default TAT config for ${created} lab(s) (${labs.length} total).`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
