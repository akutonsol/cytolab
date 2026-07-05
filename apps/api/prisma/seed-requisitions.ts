/**
 * Seed ~22 demo requisitions for the primary demo lab (the lab with the most
 * records) across the four named demo clients, with a realistic mix of statuses.
 *
 * Status mapping (the RequisitionStatus enum has no "Received" value):
 *   Completed → all lines fulfilled
 *   Partial   → fulfilled < ordered
 *   Active    → "Received": form logged (dateReceived set), not yet processed
 *   Pending   → not yet received
 *
 * Each line costs $1,000 (100000 cents) so amount = ordered × $1,000 lands in
 * the $8k–$45k band for ordered counts of 8–45.
 *
 * Idempotent: lines are tagged with notes = 'SEED-REQ'; re-runs skip if ≥20 exist.
 * Run: npx ts-node prisma/seed-requisitions.ts
 */
import { PrismaClient, RequisitionStatus, RequisitionFormType } from '@prisma/client';

const prisma = new PrismaClient();

const SEED_MARKER = 'SEED-REQ';
const LINE_COST = 100_000; // $1,000 in cents
const CLIENT_NAMES = ['Kingston Medical', 'Montego Diagnostics', 'Spanish Town Clinic', 'Ocho Rios Pathology'];

const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
// A random datetime between Jan 5 2026 and Jul 3 2026 (the demo window).
const randDate = () => {
  const start = new Date(2026, 0, 5).getTime();
  const end = new Date(2026, 6, 3).getTime();
  const t = start + Math.random() * (end - start);
  const d = new Date(t);
  d.setHours(randInt(8, 17), randInt(0, 59), 0, 0);
  return d;
};

async function main() {
  // 1) Primary demo lab = the lab with the most records.
  const byLab = await prisma.record.groupBy({ by: ['labId'], _count: { _all: true }, orderBy: { _count: { id: 'desc' } } });
  const labId = byLab[0]?.labId ?? (await prisma.lab.findFirst({ orderBy: { createdAt: 'asc' } }))?.id;
  if (!labId) throw new Error('No lab found');
  const lab = await prisma.lab.findUnique({ where: { id: labId }, select: { id: true, name: true } });
  console.log(`Primary lab: ${lab?.name ?? labId} (${labId}) — ${byLab[0]?._count._all ?? 0} records`);

  // Idempotency guard.
  const existing = await prisma.requisition.count({ where: { labId, lines: { some: { notes: SEED_MARKER } } } });
  if (existing >= 20) { console.log(`Already seeded (${existing} demo requisitions). Skipping.`); return; }

  // 2) Resolve the named clients (fall back to any clients in the lab).
  const named = await prisma.client.findMany({
    where: { labId, OR: CLIENT_NAMES.map((n) => ({ officeName: { contains: n, mode: 'insensitive' as const } })) },
    select: { id: true, officeName: true, firstName: true, lastName: true },
  });
  let clients = named;
  if (clients.length === 0) {
    clients = await prisma.client.findMany({ where: { labId }, take: 4, select: { id: true, officeName: true, firstName: true, lastName: true } });
  }
  if (clients.length === 0) throw new Error('No clients found for this lab — seed clients first.');
  console.log(`Using ${clients.length} client(s): ${clients.map((c) => c.officeName || `${c.firstName} ${c.lastName}`).join(', ')}`);

  // 3) Next reference number (start above the current numeric max for this lab).
  const refs = await prisma.requisition.findMany({ where: { labId }, select: { referenceNo: true } });
  const maxRef = refs.reduce((m, r) => { const n = parseInt(r.referenceNo ?? '', 10); return Number.isFinite(n) && n > m ? n : m; }, 1454);
  let nextRef = maxRef + 1;

  // 4) Status plan (22 total): Partial 10, Completed 6, Active/Received 4, Pending 2.
  const plan: RequisitionStatus[] = [
    ...Array<RequisitionStatus>(10).fill(RequisitionStatus.Partial),
    ...Array<RequisitionStatus>(6).fill(RequisitionStatus.Completed),
    ...Array<RequisitionStatus>(4).fill(RequisitionStatus.Active),
    ...Array<RequisitionStatus>(2).fill(RequisitionStatus.Pending),
  ];

  let created = 0;
  const tally: Record<string, number> = {};
  for (const status of plan) {
    const ordered = randInt(8, 45);
    const fulfilled = status === RequisitionStatus.Completed ? ordered
      : status === RequisitionStatus.Partial ? Math.max(1, ordered - randInt(1, 3))
        : 0; // Active (received) / Pending: not yet processed
    const createdAt = randDate();
    const dateReceived = status === RequisitionStatus.Pending ? null : createdAt;
    const client = pick(clients);

    await prisma.requisition.create({
      data: {
        labId,
        referenceNo: String(nextRef++),
        status,
        amount: ordered * LINE_COST,
        clientId: client.id,
        dateReceived,
        createdAt,
        lines: {
          create: Array.from({ length: ordered }, (_, i) => ({
            labId,
            formType: i % 2 === 0 ? RequisitionFormType.Gynecology : RequisitionFormType.NonGynecology,
            isUrgent: Math.random() < 0.12,
            isCompleted: i < fulfilled,
            amount: LINE_COST,
            notes: SEED_MARKER,
          })),
        },
      },
    });
    created++;
    tally[status] = (tally[status] ?? 0) + 1;
  }

  const totalNow = await prisma.requisition.count({ where: { labId } });
  console.log(`\nSeeded ${created} requisitions for lab ${lab?.name ?? labId}.`);
  console.log(`By status: ${Object.entries(tally).map(([s, n]) => `${s}=${n}`).join(', ')}`);
  console.log(`Requisitions in lab now: ${totalNow}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
