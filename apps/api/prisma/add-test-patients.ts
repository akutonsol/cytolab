/**
 * One-off: dump a few test patients into the demo lab for manual testing.
 * Run:  npx ts-node prisma/add-test-patients.ts
 * Idempotent — reg numbers TEST-000N are skipped if they already exist.
 */
import { PrismaClient, Gender } from '@prisma/client';

const prisma = new PrismaClient();
const DEMO_LAB = 'a0cded2b-cd81-4db8-ac8c-65315185c944';

const PATIENTS = [
  { firstName: 'Amara', lastName: 'Bennett', gender: Gender.Female, dob: '1989-04-17', phone: '+1-876-555-0111', email: 'amara.bennett@example.com', blood: 'O+' },
  { firstName: 'Daniel', lastName: 'Foster', gender: Gender.Male, dob: '1976-11-02', phone: '+1-876-555-0122', email: 'daniel.foster@example.com', blood: 'A-' },
  { firstName: 'Keisha', lastName: 'Grant', gender: Gender.Female, dob: '1994-07-29', phone: '+1-876-555-0133', email: 'keisha.grant@example.com', blood: 'B+' },
  { firstName: 'Trevor', lastName: 'Simms', gender: Gender.Male, dob: '1968-01-23', phone: '+1-876-555-0144', email: 'trevor.simms@example.com', blood: 'AB+' },
  { firstName: 'Renee', lastName: 'Palmer', gender: Gender.Female, dob: '2001-09-05', phone: '+1-876-555-0155', email: 'renee.palmer@example.com', blood: 'O-' },
  { firstName: 'Marcus', lastName: 'Lloyd', gender: Gender.Male, dob: '1985-06-14', phone: '+1-876-555-0166', email: 'marcus.lloyd@example.com', blood: 'A+' },
];

async function main() {
  const lab =
    (await prisma.lab.findUnique({ where: { id: DEMO_LAB } })) ??
    (await prisma.lab.findFirst({ orderBy: { createdAt: 'asc' } }));
  if (!lab) throw new Error('No lab found — is the DB seeded/onboarded?');
  const client = await prisma.client.findFirst({ where: { labId: lab.id }, orderBy: { createdAt: 'asc' } });
  console.log(`Lab: ${lab.id} (${(lab as any).name ?? '—'}) · attaching to client: ${client?.id ?? '(none)'}`);

  let created = 0;
  let skipped = 0;
  for (let i = 0; i < PATIENTS.length; i++) {
    const p = PATIENTS[i];
    const registrationNo = `TEST-${String(i + 1).padStart(4, '0')}`;
    const existing = await prisma.patient.findUnique({
      where: { labId_registrationNo: { labId: lab.id, registrationNo } },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.patient.create({
      data: {
        labId: lab.id,
        registrationNo,
        firstName: p.firstName,
        lastName: p.lastName,
        gender: p.gender,
        dateOfBirth: new Date(p.dob),
        phoneNumber: p.phone,
        email: p.email,
        bloodGroup: p.blood,
        clientId: client?.id ?? null,
      },
    });
    created++;
    console.log(`  + ${registrationNo}  ${p.firstName} ${p.lastName}`);
  }

  const total = await prisma.patient.count({ where: { labId: lab.id } });
  console.log(`\nDone — created ${created}, skipped ${skipped}. Patients in lab now: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
