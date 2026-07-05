/**
 * Seed the 3 default shifts for every lab (Tier 6 Workforce Management).
 * Idempotent — upserts on (labId, name).
 * Run: npx ts-node prisma/seed-shifts.ts
 */
import { PrismaClient, ShiftType } from '@prisma/client';

const prisma = new PrismaClient();

const SHIFTS: { name: string; startTime: string; endTime: string; type: ShiftType; color: string }[] = [
  { name: 'Morning', startTime: '08:00', endTime: '16:00', type: ShiftType.Morning, color: '#4F46E5' }, // indigo
  { name: 'Evening', startTime: '16:00', endTime: '00:00', type: ShiftType.Evening, color: '#7C3AED' }, // violet
  { name: 'Night', startTime: '00:00', endTime: '08:00', type: ShiftType.Night, color: '#64748B' }, // slate
];

async function main() {
  const labs = await prisma.lab.findMany({ select: { id: true } });
  let created = 0;
  for (const lab of labs) {
    for (const s of SHIFTS) {
      const res = await prisma.shift.upsert({
        where: { labId_name: { labId: lab.id, name: s.name } },
        update: { startTime: s.startTime, endTime: s.endTime, type: s.type, color: s.color },
        create: { labId: lab.id, ...s },
      });
      if (res.id) created++;
    }
  }
  console.log(`Seeded/updated ${created} shift row(s) across ${labs.length} lab(s).`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
