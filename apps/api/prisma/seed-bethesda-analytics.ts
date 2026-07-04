/**
 * Seed a realistic distribution of BethesdaResult rows (with backing
 * patients/records) across the last 12 months, so Bethesda Analytics has data
 * to aggregate. Idempotent-ish: skips when the lab already has ≥ 40 results.
 * Run: npx ts-node prisma/seed-bethesda-analytics.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TOTAL = 70;
const rand = (n: number) => Math.floor(Math.random() * n);

interface Cls {
  specimenAdequacy: 'Satisfactory' | 'Unsatisfactory';
  generalCategory?: 'NILM' | 'EpithelialAbnormality' | 'OtherMalignancy';
  squamousCategory?: 'ASC' | 'LSIL' | 'HSIL' | 'SCC';
  ascSubtype?: 'ASCUS' | 'ASCH';
  glandularCategory?: 'AGC' | 'AGC_FavorNeoplastic' | 'AIS' | 'Adenocarcinoma';
}

function pickClass(): Cls {
  if (Math.random() < 0.05) return { specimenAdequacy: 'Unsatisfactory' };
  if (Math.random() < 0.86) return { specimenAdequacy: 'Satisfactory', generalCategory: 'NILM' };
  const abn = (extra: Partial<Cls>, general: Cls['generalCategory'] = 'EpithelialAbnormality'): Cls =>
    ({ specimenAdequacy: 'Satisfactory', generalCategory: general, ...extra });
  const a = Math.random();
  if (a < 0.45) return abn({ squamousCategory: 'ASC', ascSubtype: 'ASCUS' });
  if (a < 0.65) return abn({ squamousCategory: 'LSIL' });
  if (a < 0.78) return abn({ squamousCategory: 'ASC', ascSubtype: 'ASCH' });
  if (a < 0.90) return abn({ squamousCategory: 'HSIL' });
  if (a < 0.95) return abn({ glandularCategory: 'AGC' });
  if (a < 0.98) return abn({ squamousCategory: 'SCC' }, 'OtherMalignancy');
  return abn({ glandularCategory: 'Adenocarcinoma' }, 'OtherMalignancy');
}

function pickHpv(): { hpvResult: 'Positive' | 'Negative' | 'NotPerformed'; hpvGenotype?: string } {
  const r = Math.random();
  if (r < 0.6) return { hpvResult: 'NotPerformed' };
  if (r < 0.8) return { hpvResult: 'Negative' };
  return { hpvResult: 'Positive', hpvGenotype: ['16', '18', 'Other HR'][rand(3)] };
}

async function main() {
  const lab = (process.env.LAB_ID ? await prisma.lab.findFirst({ where: { id: process.env.LAB_ID }, select: { id: true } }) : null)
    ?? await prisma.lab.findFirst({ where: { name: 'Demo Lab' }, select: { id: true } })
    ?? await prisma.lab.findFirst({ where: { slug: 'cytolab-demo' }, select: { id: true } })
    ?? await prisma.lab.findFirst({ select: { id: true } });
  if (!lab) throw new Error('No lab found');
  const labId = lab.id;

  const existing = await prisma.bethesdaResult.count({ where: { labId } });
  if (existing >= 40) { console.log(`Lab already has ${existing} Bethesda results — skipping.`); return; }

  const reporters = await prisma.user.findMany({ where: { labId, isActive: true }, select: { id: true }, take: 3 });
  const reporterIds = reporters.map((r) => r.id);
  const tag = Date.now().toString(36);
  const now = new Date();
  let made = 0;

  for (let i = 0; i < TOTAL; i++) {
    const cls = pickClass();
    const hpv = pickHpv();
    const monthOffset = rand(12);
    const day = 1 + rand(27);
    const reportedAt = new Date(now.getFullYear(), now.getMonth() - monthOffset, day, 9 + rand(8));

    const patient = await prisma.patient.create({
      data: { labId, registrationNo: `BA-${tag}-${i}`, firstName: 'Patient', lastName: `#${i}` },
      select: { id: true },
    });
    const record = await prisma.record.create({
      data: { labId, identifier: `BAREC-${tag}-${i}`, patientId: patient.id, status: 'Approved', formType: 'Gynecology', specimenDate: reportedAt },
      select: { id: true },
    });
    await prisma.bethesdaResult.create({
      data: {
        labId, recordId: record.id,
        specimenAdequacy: cls.specimenAdequacy,
        generalCategory: cls.generalCategory ?? null,
        squamousCategory: cls.squamousCategory ?? null,
        ascSubtype: cls.ascSubtype ?? null,
        glandularCategory: cls.glandularCategory ?? null,
        hpvResult: cls.specimenAdequacy === 'Satisfactory' ? hpv.hpvResult : 'NotPerformed',
        hpvGenotype: hpv.hpvGenotype ?? null,
        reportedById: reporterIds.length ? reporterIds[rand(reporterIds.length)] : null,
        reportedAt,
      },
    });
    made++;
  }
  console.log(`Seeded ${made} Bethesda results across 12 months for lab ${labId}.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
