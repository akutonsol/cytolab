/**
 * One-off: seed a day's worth of appointments into the demo lab so the
 * Appointments dashboard renders with real data. Idempotent — appointments whose
 * (labId, title, scheduledAt) already exist are skipped.
 * Run:  npx ts-node prisma/add-appointments.ts
 */
import { AppointmentStatus, AppointmentType, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DEMO_LAB = 'a0cded2b-cd81-4db8-ac8c-65315185c944';

const T = AppointmentType;
const S = AppointmentStatus;

const day = 24 * 60 * 60 * 1000;
// A DateTime today at h:m (server-local), or offset by whole days.
const at = (h: number, m = 0, dayOffset = 0) => {
  const d = new Date(Date.now() + dayOffset * day);
  d.setHours(h, m, 0, 0);
  return d;
};

type Row = {
  title: string; type: AppointmentType; status: AppointmentStatus;
  when: Date; duration: number; p: number; notes?: string;
};

// p = index into the demo patients (TEST-* first, else any).
const ROWS: Row[] = [
  // 4 collections today (mix of statuses)
  { title: 'Specimen Collection', type: T.COLLECTION, status: S.COMPLETED, when: at(9), duration: 30, p: 0 },
  { title: 'Blood Draw', type: T.COLLECTION, status: S.IN_PROGRESS, when: at(10), duration: 30, p: 1 },
  { title: 'Pap Collection', type: T.COLLECTION, status: S.SCHEDULED, when: at(11), duration: 30, p: 2 },
  { title: 'Afternoon Collection', type: T.COLLECTION, status: S.SCHEDULED, when: at(14), duration: 45, p: 3 },
  // 2 callbacks (one live, one pending)
  { title: 'Result Callback', type: T.CALLBACK, status: S.IN_PROGRESS, when: at(13), duration: 15, p: 4, notes: 'Discuss lipid panel' },
  { title: 'Prescription Renewal Callback', type: T.CALLBACK, status: S.SCHEDULED, when: at(15), duration: 15, p: 5 },
  // 1 missed (yesterday)
  { title: 'Missed Follow-up', type: T.FOLLOWUP, status: S.MISSED, when: at(10, 30, -1), duration: 30, p: 0 },
  // 1 follow-up tomorrow
  { title: 'Follow-up Consultation', type: T.FOLLOWUP, status: S.SCHEDULED, when: at(11, 0, 1), duration: 30, p: 1 },
];

async function main() {
  const lab =
    (await prisma.lab.findUnique({ where: { id: DEMO_LAB } })) ??
    (await prisma.lab.findFirst({ orderBy: { createdAt: 'asc' } }));
  if (!lab) throw new Error('No lab found');

  const patients = await prisma.patient.findMany({
    where: { labId: lab.id },
    orderBy: [{ registrationNo: 'asc' }],
    take: 12,
  });
  if (!patients.length) throw new Error('No patients found — run add-test-patients.ts first.');
  const staff = await prisma.user.findFirst({ where: { labId: lab.id } });
  console.log(`Lab ${lab.id} · ${patients.length} patients · assigning to ${staff?.id ?? '(none)'}`);

  let created = 0;
  let skipped = 0;
  for (const r of ROWS) {
    const patient = patients[r.p % patients.length];
    const exists = await prisma.appointment.findFirst({
      where: { labId: lab.id, title: r.title, scheduledAt: r.when },
    });
    if (exists) { skipped++; continue; }
    await prisma.appointment.create({
      data: {
        labId: lab.id,
        title: r.title,
        type: r.type,
        status: r.status,
        scheduledAt: r.when,
        duration: r.duration,
        notes: r.notes ?? null,
        patientId: patient.id,
        clientId: patient.clientId,
        assignedUserId: staff?.id ?? null,
      },
    });
    created++;
    console.log(`  + ${r.when.toLocaleString()}  ${r.title}  ${r.status}  (${patient.firstName} ${patient.lastName})`);
  }

  const total = await prisma.appointment.count({ where: { labId: lab.id } });
  console.log(`\nDone — created ${created}, skipped ${skipped}. Appointments in lab now: ${total}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
