import { PrismaClient, RecordStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { PatientsService } from './patients.service';

/**
 * "Today at a glance" overview aggregation: today's requisitions/records, the
 * featured open case, KPI counts, and alert counts (notifications = today's
 * status events, authorizedToday = today's Approved events). Gated on DATABASE_URL.
 */
const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('PatientsService.overview (integration)', () => {
  const raw = new PrismaClient();
  const labContext = new LabContext();
  const prisma = new PrismaService(labContext);
  const service = new PatientsService(prisma, labContext);

  const tag = `ov-${Date.now().toString(36)}`;
  let labId: string;
  let patientId: string;
  const todayAt = (h: number) => { const d = new Date(); d.setHours(h, 0, 0, 0); return d; };
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
  const run = <T>(fn: () => Promise<T>) => labContext.run({ labId }, fn);

  const mk = (key: string, status: RecordStatus, opts: { urgent?: boolean; formType?: any; createdAt: Date; events: [RecordStatus, Date][] }) =>
    raw.record.create({
      data: {
        labId, identifier: `${tag}-${key}`, labNumber: `${tag}-${key}`, patientId,
        status, urgent: opts.urgent ?? false, formType: opts.formType ?? null, createdAt: opts.createdAt, specimenDate: opts.createdAt,
        specimens: { create: [{ labId, type: 'CERV_SCRAP', label: 'Cervical smear' }] },
        statusHistory: { create: opts.events.map(([s, at]) => ({ labId, status: s, createdAt: at })) },
      },
    });

  beforeAll(async () => {
    const lab = await raw.lab.create({ data: { name: `Ov ${tag}`, slug: `ov-${tag}`, targetTatDays: 3 } });
    labId = lab.id;
    const p = await raw.patient.create({ data: { labId, registrationNo: `${tag}-P`, firstName: 'A', lastName: 'B' } });
    patientId = p.id;

    // Today: urgent Gyn open (featured/attention), a Pending, a Submitted, and an Approved-today.
    await mk('URG', RecordStatus.Processing, { urgent: true, formType: 'Gynecology', createdAt: todayAt(7), events: [[RecordStatus.Submitted, todayAt(7)], [RecordStatus.Processing, todayAt(8)]] });
    await mk('PEND', RecordStatus.Pending, { createdAt: todayAt(9), events: [[RecordStatus.Submitted, todayAt(9)]] });
    await mk('SUB', RecordStatus.Submitted, { createdAt: todayAt(10), events: [[RecordStatus.Submitted, todayAt(10)]] });
    await mk('APP', RecordStatus.Approved, { formType: 'NonGynecology', createdAt: todayAt(6), events: [[RecordStatus.Submitted, todayAt(6)], [RecordStatus.Approved, todayAt(9)]] });
    // Not today (yesterday), already Completed — excluded from "today" lists and
    // from the Pending/Submitted KPI counts.
    await mk('OLD', RecordStatus.Completed, { createdAt: daysAgo(1), events: [[RecordStatus.Submitted, daysAgo(1)], [RecordStatus.Completed, daysAgo(1)]] });
  });

  afterAll(async () => {
    await raw.recordStatusEvent.deleteMany({ where: { labId } });
    await raw.specimen.deleteMany({ where: { labId } });
    await raw.record.deleteMany({ where: { labId } });
    await raw.patient.deleteMany({ where: { labId } });
    await raw.lab.deleteMany({ where: { id: labId } });
    await prisma.$disconnect();
    await raw.$disconnect();
  });

  it('aggregates today\'s queue, featured case, KPIs and alert counts from real data', () =>
    run(async () => {
      const o = await service.overview();

      // 4 records created today (URG, PEND, SUB, APP); OLD excluded.
      expect(o.today.requisitionsToday).toBe(4);
      expect(o.records).toHaveLength(4);

      // Featured = the urgent open Gyn case; queue excludes the Approved one.
      expect(o.featured?.labNumber).toBe(`${tag}-URG`);
      expect(o.featured?.formType).toBe('Gyn');
      expect(o.featured?.urgent).toBe(true);
      const queueLabs = o.queue.map((q: any) => q.type);
      expect(o.queue.find((q: any) => q.patient)).toBeTruthy();
      expect(o.queue.some((q: any) => q.at)).toBe(true);
      expect(o.queue).toHaveLength(3); // URG, PEND, SUB (not APP)
      void queueLabs;

      // KPIs: one Pending, one Submitted (today) — but counts are lab-wide.
      expect(o.kpis.pendingRequisitions).toBe(1);
      expect(o.kpis.awaitingProcessing).toBe(1);

      // Alerts: authorizedToday = 1 (APP approved today); notifications = all of
      // today's status events (URG: Submitted+Processing, PEND: Submitted,
      // SUB: Submitted, APP: Submitted+Approved = 6).
      expect(o.alerts.authorizedToday).toBe(1);
      expect(o.alerts.notifications).toBe(6);
      expect(o.alerts.attention?.labNumber).toBe(`${tag}-URG`);

      // Stage mapping present on table rows.
      expect(o.records.every((r: any) => typeof r.stage.pct === 'number')).toBe(true);
    }));
});
