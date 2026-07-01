import { PrismaClient, RecordStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from './lab-context';

/**
 * End-to-end proof of cross-lab isolation against a real Postgres.
 *
 * Seeds two labs, each with its own row in every tenant-scoped model, then runs
 * unscoped queries inside lab A's context and asserts none of lab B's rows come
 * back — across Patient, Client, Requisition, RequisitionLine, Record and
 * RecordStatusEvent (the last two of which are only reachable because they now
 * carry their own labId column).
 *
 * Gated on DATABASE_URL so it is skipped when no database is available; run the
 * migrations first (`prisma migrate deploy`).
 */
const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('tenancy guard — cross-lab isolation (integration)', () => {
  const raw = new PrismaClient(); // unscoped client, for seeding + teardown
  const labContext = new LabContext();
  const prisma = new PrismaService(labContext); // lab-scoped client (guard applied)

  const tag = `it-${Date.now().toString(36)}`;
  const seeded: Record<
    'A' | 'B',
    {
      labId: string;
      patientId: string;
      clientId: string;
      requisitionId: string;
      lineId: string;
      recordId: string;
      eventId: string;
      resultSheetId: string;
      reportId: string;
    }
  > = {} as any;

  async function seedLab(key: 'A' | 'B') {
    const lab = await raw.lab.create({ data: { name: `Lab ${key} ${tag}`, slug: `lab-${key}-${tag}` } });
    const patient = await raw.patient.create({
      data: { labId: lab.id, registrationNo: `${tag}-${key}-P`, firstName: 'P', lastName: key },
    });
    const client = await raw.client.create({ data: { labId: lab.id, firstName: 'C', lastName: key } });
    const requisition = await raw.requisition.create({ data: { labId: lab.id } });
    const line = await raw.requisitionLine.create({
      data: { labId: lab.id, requisitionId: requisition.id, notes: `line-${key}` },
    });
    const record = await raw.record.create({
      data: { labId: lab.id, identifier: `${tag}-${key}-R`, patientId: patient.id },
    });
    const event = await raw.recordStatusEvent.create({
      data: { labId: lab.id, recordId: record.id, status: RecordStatus.Pending },
    });
    // Result sheet + released report hold diagnostic data — assert their isolation too.
    const resultSheet = await raw.resultSheet.create({
      data: { labId: lab.id, recordId: record.id, authorized: true, authorizedAt: new Date() },
    });
    const report = await raw.report.create({
      data: { labId: lab.id, resultSheetId: resultSheet.id, content: `report-${key}` },
    });
    seeded[key] = {
      labId: lab.id,
      patientId: patient.id,
      clientId: client.id,
      requisitionId: requisition.id,
      lineId: line.id,
      recordId: record.id,
      eventId: event.id,
      resultSheetId: resultSheet.id,
      reportId: report.id,
    };
  }

  beforeAll(async () => {
    await seedLab('A');
    await seedLab('B');
  });

  afterAll(async () => {
    const labIds = [seeded.A?.labId, seeded.B?.labId].filter(Boolean) as string[];
    if (labIds.length) {
      // Delete children before parents to respect RESTRICT foreign keys.
      await raw.report.deleteMany({ where: { labId: { in: labIds } } });
      await raw.resultSheet.deleteMany({ where: { labId: { in: labIds } } });
      await raw.recordStatusEvent.deleteMany({ where: { labId: { in: labIds } } });
      await raw.requisitionLine.deleteMany({ where: { labId: { in: labIds } } });
      await raw.record.deleteMany({ where: { labId: { in: labIds } } });
      await raw.requisition.deleteMany({ where: { labId: { in: labIds } } });
      await raw.patient.deleteMany({ where: { labId: { in: labIds } } });
      await raw.client.deleteMany({ where: { labId: { in: labIds } } });
      await raw.lab.deleteMany({ where: { id: { in: labIds } } });
    }
    await raw.$disconnect();
    await prisma.$disconnect();
  });

  /**
   * Run fn inside lab A's tenant context (as a request would). The await happens
   * *inside* run() so the query executes within the AsyncLocalStorage scope —
   * exactly how the middleware wraps a request handler.
   */
  const asLabA = <T>(fn: () => Promise<T>): Promise<T> =>
    labContext.run({ labId: seeded.A.labId }, async () => await fn());

  it('Patient: an unscoped read in lab A returns only lab A rows', async () => {
    const rows = await asLabA(() => prisma.patient.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.labId === seeded.A.labId)).toBe(true);
    expect(rows.find((r) => r.id === seeded.B.patientId)).toBeUndefined();
  });

  it('Client: lab B rows are invisible from lab A', async () => {
    const rows = await asLabA(() => prisma.client.findMany());
    expect(rows.every((r) => r.labId === seeded.A.labId)).toBe(true);
    expect(rows.some((r) => r.id === seeded.B.clientId)).toBe(false);
  });

  it('Requisition: lab B rows are invisible from lab A', async () => {
    const rows = await asLabA(() => prisma.requisition.findMany());
    expect(rows.every((r) => r.labId === seeded.A.labId)).toBe(true);
    expect(rows.some((r) => r.id === seeded.B.requisitionId)).toBe(false);
  });

  it('RequisitionLine (column-scoped): lab B rows are invisible from lab A', async () => {
    const rows = await asLabA(() => prisma.requisitionLine.findMany());
    expect(rows.every((r) => r.labId === seeded.A.labId)).toBe(true);
    expect(rows.some((r) => r.id === seeded.B.lineId)).toBe(false);
  });

  it('Record: lab B rows are invisible from lab A', async () => {
    const rows = await asLabA(() => prisma.record.findMany());
    expect(rows.every((r) => r.labId === seeded.A.labId)).toBe(true);
    expect(rows.some((r) => r.id === seeded.B.recordId)).toBe(false);
  });

  it('RecordStatusEvent (column-scoped): lab B rows are invisible from lab A', async () => {
    const rows = await asLabA(() => prisma.recordStatusEvent.findMany());
    expect(rows.every((r) => r.labId === seeded.A.labId)).toBe(true);
    expect(rows.some((r) => r.id === seeded.B.eventId)).toBe(false);
  });

  it('ResultSheet (diagnostic data): lab B sheets are invisible from lab A', async () => {
    const rows = await asLabA(() => prisma.resultSheet.findMany());
    expect(rows.every((r) => r.labId === seeded.A.labId)).toBe(true);
    expect(rows.some((r) => r.id === seeded.B.resultSheetId)).toBe(false);
  });

  it('Report (diagnostic data): lab B reports are invisible from lab A', async () => {
    const rows = await asLabA(() => prisma.report.findMany());
    expect(rows.every((r) => r.labId === seeded.A.labId)).toBe(true);
    expect(rows.some((r) => r.id === seeded.B.reportId)).toBe(false);
  });

  it('cannot fetch a lab B record or report by id from lab A context', async () => {
    const stolenRecord = await asLabA(() => prisma.record.findFirst({ where: { id: seeded.B.recordId } }));
    const stolenReport = await asLabA(() => prisma.report.findFirst({ where: { id: seeded.B.reportId } }));
    expect(stolenRecord).toBeNull();
    expect(stolenReport).toBeNull();
  });

  it('count from lab A never includes lab B rows', async () => {
    const total = await raw.record.count({ where: { labId: { in: [seeded.A.labId, seeded.B.labId] } } });
    const scoped = await asLabA(() => prisma.record.count());
    expect(total).toBeGreaterThanOrEqual(2);
    expect(scoped).toBe(1);
  });
});
