/**
 * One-off: create sample records (cases) for the TEST-* patients so they show up
 * across the dashboard queues and analytics. Idempotent — labNumbers TST-#### are
 * skipped if they already exist.
 * Run:  npx ts-node prisma/add-test-records.ts
 */
import { randomUUID } from 'crypto';
import { PrismaClient, RecordStatus, RequisitionFormType, SpecimenType } from '@prisma/client';

const prisma = new PrismaClient();
const DEMO_LAB = 'a0cded2b-cd81-4db8-ac8c-65315185c944';
const G = RequisitionFormType.Gynecology;
const NG = RequisitionFormType.NonGynecology;
const S = RecordStatus;

const day = 24 * 60 * 60 * 1000;
const ago = (d: number) => new Date(Date.now() - d * day);

type H = { s: RecordStatus; d: number };
type Rec = {
  p: number; form: RequisitionFormType; spec: SpecimenType; status: RecordStatus;
  urgent?: boolean; billed?: boolean; created: number; dx: string; hist: H[];
};

// p = index into the TEST-000N patients (0..5). created/hist in days-ago.
const RECORDS: Rec[] = [
  // --- recent / open: priority queue, today, urgent, overdue, awaiting ---
  { p: 0, form: NG, spec: SpecimenType.PLEURAL_FLD, status: S.Pending, urgent: true, created: 0, dx: 'Pleural effusion, r/o malignancy', hist: [{ s: S.Pending, d: 0 }] },
  { p: 1, form: G, spec: SpecimenType.CERV_SCRAP, status: S.Processing, urgent: true, created: 1, dx: 'Abnormal Pap — ASC-US', hist: [{ s: S.Pending, d: 1 }, { s: S.Submitted, d: 0.9 }, { s: S.Processing, d: 0.4 }] },
  { p: 2, form: NG, spec: SpecimenType.URINE, status: S.Pending, created: 5, dx: 'Hematuria workup', hist: [{ s: S.Pending, d: 5 }] }, // overdue (>3d Pending)
  { p: 3, form: G, spec: SpecimenType.ENDOCERV_ASP, status: S.Submitted, created: 0, dx: 'Routine cervical screen', hist: [{ s: S.Pending, d: 0 }, { s: S.Submitted, d: 0 }] }, // today + awaiting processing
  { p: 4, form: NG, spec: SpecimenType.CSF, status: S.Submitted, created: 2, dx: 'CSF cytology', hist: [{ s: S.Pending, d: 2 }, { s: S.Submitted, d: 1.8 }] },
  { p: 5, form: G, spec: SpecimenType.VAG_POOL, status: S.Resulted, created: 4, dx: 'Vaginal pool — inflammatory', hist: [{ s: S.Pending, d: 4 }, { s: S.Submitted, d: 3.8 }, { s: S.Processing, d: 3 }, { s: S.Completed, d: 1 }, { s: S.Resulted, d: 0.5 }] }, // awaiting authorization

  // --- authorized recently: feeds avg TAT (approved <30d) + unbilled ---
  { p: 0, form: NG, spec: SpecimenType.BREAST_ASP, status: S.Approved, billed: false, created: 6, dx: 'Breast aspirate — benign', hist: [{ s: S.Pending, d: 6 }, { s: S.Submitted, d: 5.6 }, { s: S.Processing, d: 4 }, { s: S.Completed, d: 3 }, { s: S.Resulted, d: 2.5 }, { s: S.Approved, d: 2 }] }, // TAT ~3.6d, unbilled
  { p: 1, form: G, spec: SpecimenType.CERV_SCRAP, status: S.Completed, billed: false, created: 12, dx: 'Cervical screen — NILM', hist: [{ s: S.Pending, d: 12 }, { s: S.Submitted, d: 11.6 }, { s: S.Processing, d: 10 }, { s: S.Completed, d: 8 }] }, // unbilled

  // --- older, authorized/paid: trailing-12-month volume + revenue ---
  { p: 2, form: NG, spec: SpecimenType.JOINT_ASP, status: S.Approved, billed: true, created: 45, dx: 'Joint aspirate — crystals', hist: [{ s: S.Pending, d: 45 }, { s: S.Submitted, d: 44.6 }, { s: S.Completed, d: 42 }, { s: S.Approved, d: 41 }] },
  { p: 3, form: G, spec: SpecimenType.CERV_SCRAP, status: S.Paid, billed: true, created: 80, dx: 'Cervical screen — NILM', hist: [{ s: S.Pending, d: 80 }, { s: S.Submitted, d: 79.5 }, { s: S.Completed, d: 77 }, { s: S.Approved, d: 76 }, { s: S.Paid, d: 70 }] },
  { p: 4, form: NG, spec: SpecimenType.SYNOVIAL_FLD, status: S.Approved, billed: true, created: 130, dx: 'Synovial fluid — reactive', hist: [{ s: S.Pending, d: 130 }, { s: S.Submitted, d: 129.5 }, { s: S.Completed, d: 127 }, { s: S.Approved, d: 126 }] },
  { p: 5, form: G, spec: SpecimenType.ENDOCERV_ASP, status: S.Paid, billed: true, created: 210, dx: 'Endocervical — benign', hist: [{ s: S.Pending, d: 210 }, { s: S.Submitted, d: 209.5 }, { s: S.Completed, d: 206 }, { s: S.Approved, d: 205 }, { s: S.Paid, d: 200 }] },
];

async function main() {
  const lab =
    (await prisma.lab.findUnique({ where: { id: DEMO_LAB } })) ??
    (await prisma.lab.findFirst({ orderBy: { createdAt: 'asc' } }));
  if (!lab) throw new Error('No lab found');
  const patients = await prisma.patient.findMany({
    where: { labId: lab.id, registrationNo: { startsWith: 'TEST-' } },
    orderBy: { registrationNo: 'asc' },
  });
  if (patients.length < 6) throw new Error(`Expected 6 TEST-* patients, found ${patients.length}. Run add-test-patients.ts first.`);
  const user = await prisma.user.findFirst({ where: { labId: lab.id } });
  console.log(`Lab ${lab.id} · ${patients.length} test patients · status events by user ${user?.id ?? '(none)'}`);

  let created = 0;
  let skipped = 0;
  for (let i = 0; i < RECORDS.length; i++) {
    const r = RECORDS[i];
    const patient = patients[r.p % patients.length];
    const labNumber = `TST-${String(i + 1).padStart(4, '0')}`;
    if (await prisma.record.findUnique({ where: { labId_labNumber: { labId: lab.id, labNumber } } })) {
      skipped++;
      continue;
    }
    const createdAt = ago(r.created);
    await prisma.record.create({
      data: {
        labId: lab.id,
        identifier: randomUUID(),
        labNumber,
        formType: r.form,
        status: r.status,
        urgent: r.urgent ?? false,
        billed: r.billed ?? false,
        clinicalDiagnosis: r.dx,
        specimenDate: createdAt,
        dateStatus: ago(r.hist[r.hist.length - 1].d),
        patientId: patient.id,
        clientId: patient.clientId,
        createdAt,
        updatedAt: ago(r.hist[r.hist.length - 1].d),
        specimens: {
          create: [{ labId: lab.id, type: r.spec, label: `${r.spec} · 1`, dateReceived: createdAt, clientId: patient.clientId }],
        },
        statusHistory: {
          create: r.hist.map((h) => ({ labId: lab.id, status: h.s, userId: user?.id ?? null, createdAt: ago(h.d) })),
        },
      },
    });
    created++;
    console.log(`  + ${labNumber}  ${patient.firstName} ${patient.lastName}  ${r.status}${r.urgent ? ' (urgent)' : ''}`);
  }

  const total = await prisma.record.count({ where: { labId: lab.id } });
  console.log(`\nDone — created ${created}, skipped ${skipped}. Records in lab now: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
