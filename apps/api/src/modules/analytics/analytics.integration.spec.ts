import { PrismaClient, RecordStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { AnalyticsService } from './analytics.service';

/**
 * Analytics aggregations from real data. Verifies the ambiguous bits: TAT
 * (Submitted→Approved vs targetTatDays), the attention-queue counts, revenue
 * from non-draft bills, and monthly volume. Gated on DATABASE_URL.
 */
const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('Analytics dashboard (integration)', () => {
  const raw = new PrismaClient();
  const labContext = new LabContext();
  const prisma = new PrismaService(labContext);
  const analytics = new AnalyticsService(prisma, labContext);

  const tag = `an-${Date.now().toString(36)}`;
  let labId: string;
  let patientId: string;
  const now = Date.now();
  const daysAgo = (n: number) => new Date(now - n * 86_400_000);
  const run = <T>(fn: () => Promise<T>) => labContext.run({ labId }, fn);

  const mkRecord = async (
    key: string,
    status: RecordStatus,
    opts: { urgent?: boolean; billed?: boolean; createdAt: Date; events: [RecordStatus, Date][] },
  ) => {
    await raw.record.create({
      data: {
        labId, identifier: `${tag}-${key}`, labNumber: `${tag}-${key}`, patientId,
        status, urgent: opts.urgent ?? false, billed: opts.billed ?? false, createdAt: opts.createdAt,
        statusHistory: { create: opts.events.map(([s, at]) => ({ labId, status: s, createdAt: at })) },
        specimens: { create: [{ labId, type: 'CERV_SCRAP' }] },
      },
    });
  };

  beforeAll(async () => {
    const lab = await raw.lab.create({ data: { name: `An ${tag}`, slug: `an-${tag}`, targetTatDays: 3 } });
    labId = lab.id;
    const p = await raw.patient.create({ data: { labId, registrationNo: `${tag}-P`, firstName: 'A', lastName: 'B' } });
    patientId = p.id;

    // A: on-time (TAT 1d), billed. B: delayed (TAT 8d), unbilled.
    await mkRecord('A', RecordStatus.Approved, { billed: true, createdAt: daysAgo(2), events: [[RecordStatus.Submitted, daysAgo(2)], [RecordStatus.Approved, daysAgo(1)]] });
    await mkRecord('B', RecordStatus.Approved, { createdAt: daysAgo(2), events: [[RecordStatus.Submitted, daysAgo(9)], [RecordStatus.Approved, daysAgo(1)]] });
    // C: awaiting authorization (Resulted). D: completed unbilled. E: urgent pending (Submitted).
    await mkRecord('C', RecordStatus.Resulted, { createdAt: daysAgo(5), events: [[RecordStatus.Submitted, daysAgo(5)], [RecordStatus.Resulted, daysAgo(1)]] });
    await mkRecord('D', RecordStatus.Completed, { createdAt: daysAgo(5), events: [[RecordStatus.Submitted, daysAgo(5)], [RecordStatus.Completed, daysAgo(1)]] });
    await mkRecord('E', RecordStatus.Submitted, { urgent: true, createdAt: daysAgo(5), events: [[RecordStatus.Submitted, daysAgo(5)]] });

    // Revenue: one issued bill of $100 for A.
    const a = await raw.record.findFirstOrThrow({ where: { labId, identifier: `${tag}-A` } });
    await raw.bill.create({ data: { labId, recordId: a.id, referenceNo: `${tag}-BILL`, status: 'Issued', total: 10000, createdAt: daysAgo(1) } });
  });

  afterAll(async () => {
    await raw.bill.deleteMany({ where: { labId } });
    await raw.recordStatusEvent.deleteMany({ where: { labId } });
    await raw.specimen.deleteMany({ where: { labId } });
    await raw.record.deleteMany({ where: { labId } });
    await raw.patient.deleteMany({ where: { labId } });
    await raw.lab.deleteMany({ where: { id: labId } });
    await prisma.$disconnect();
    await raw.$disconnect();
  });

  it('computes TAT on-time %, attention counts, revenue and volume from real data', () =>
    run(async () => {
      const d = await analytics.dashboard();

      // TAT: A on-time (1d), B delayed (8d) → 50% on time (2 approved records).
      expect(d.kpis.onTimeTat.value).toBe(50);
      expect(d.compliance.onTimePct).toBe(50);

      // Monthly volume actual = fulfilled records (A,B,C,D reached Completed+); E (Submitted) excluded.
      expect(d.monthlyVolume.reduce((a: number, m: any) => a + m.actual, 0)).toBe(4);

      // Attention queue.
      const count = (key: string) => d.attention.items.find((i: any) => i.key === key)!.count;
      expect(count('awaiting')).toBe(1); // C (Resulted)
      expect(count('urgent')).toBe(1); // E (urgent + pending)
      expect(count('unbilled')).toBe(3); // B, C, D (fulfilled, billed=false)
      expect(count('overdue')).toBe(3); // C, D, E open & older than 3 days
      expect(d.attention.total).toBe(d.attention.items.reduce((a: number, i: any) => a + i.count, 0));

      // Revenue from the single $100 issued bill.
      expect(d.kpis.revenue.value).toBe(100);
      expect(d.volumeRevenue.reduce((a: number, m: any) => a + m.revenue, 0)).toBe(100);

      // Target is derived (no monthlyVolumeTarget set) and shape is present.
      expect(d.targetDerived).toBe(true);
      expect(d.monthlyVolume).toHaveLength(12);
      expect(d.compliance.week).toHaveLength(7);
      expect(d.insights.items.length).toBeGreaterThan(0);
    }));

  it('home(): priority queue, throughput, radar, effectiveness and activity from real data', () =>
    run(async () => {
      const h = await analytics.home();

      // Priority queue = open records (C Resulted, D Completed, E Submitted), NOT A/B (Approved).
      const labs = h.priorityRecords.map((r: any) => r.labNumber);
      expect(labs).toEqual(expect.arrayContaining([`${tag}-C`, `${tag}-D`, `${tag}-E`]));
      expect(labs).not.toContain(`${tag}-A`);
      // Progress ring value per lifecycle status.
      expect(h.priorityRecords.find((r: any) => r.labNumber === `${tag}-C`)!.progress).toBe(90); // Resulted
      expect(h.priorityRecords.find((r: any) => r.labNumber === `${tag}-E`)!.progress).toBe(25); // Submitted

      // Throughput = 42 daily buckets with a peak flagged.
      expect(h.throughput.series).toHaveLength(42);
      expect(h.throughput.series.filter((s: any) => s.peak).length).toBeGreaterThanOrEqual(1);

      // Radar: 5 dimensions, each 0–100, two series.
      expect(h.radar.map((r: any) => r.dim)).toEqual(['Turnaround', 'Authorization', 'Volume', 'On-time', 'Quality']);
      h.radar.forEach((r: any) => { expect(r.current).toBeGreaterThanOrEqual(0); expect(r.current).toBeLessThanOrEqual(100); });

      // Effectiveness: OEE + real stats. On-time 50% (A on-time, B delayed).
      expect(h.effectiveness.onTime).toBe(50);
      expect(typeof h.effectiveness.oee).toBe('number');
      expect(h.effectiveness.reportsAuthorized).toBeGreaterThanOrEqual(2); // A, B approved recently

      // Activity feed from RecordStatusEvent.
      expect(h.activity.length).toBeGreaterThan(0);
      expect(h.activity[0]).toHaveProperty('labNumber');
      expect(h.activity[0]).toHaveProperty('patient');
    }));
});
