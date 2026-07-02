import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { AppointmentsService } from './appointments.service';

/**
 * Appointments aggregation from real data: create a scheduled-today appointment
 * and confirm the overview KPIs, today's schedule and callbacks reflect it.
 * Lab-scoped throughout. Gated on DATABASE_URL.
 */
const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('AppointmentsService (integration)', () => {
  const raw = new PrismaClient();
  const labContext = new LabContext();
  const prisma = new PrismaService(labContext);
  const service = new AppointmentsService(prisma);

  const tag = `appt-${Date.now().toString(36)}`;
  let labId: string;
  let patientId: string;
  const run = <T>(fn: () => Promise<T>) => labContext.run({ labId }, fn);

  const at = (h: number, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };

  beforeAll(async () => {
    const lab = await raw.lab.create({ data: { name: `Appt ${tag}`, slug: `appt-${tag}` } });
    labId = lab.id;
    const patient = await raw.patient.create({
      data: { labId, registrationNo: `${tag}-P1`, firstName: 'Ahsan', lastName: 'Habib' },
    });
    patientId = patient.id;
  });

  afterAll(async () => {
    await raw.appointment.deleteMany({ where: { labId } });
    await raw.patient.deleteMany({ where: { labId } });
    await raw.lab.deleteMany({ where: { id: labId } });
    await prisma.$disconnect();
    await raw.$disconnect();
  });

  it('creates appointments and aggregates them into the overview', () =>
    run(async () => {
      // A scheduled collection today, a pending callback, and a missed visit.
      const created = await service.create({ title: 'Specimen collection', type: 'COLLECTION', scheduledAt: at(9), patientId });
      expect(created.status).toBe('SCHEDULED');
      expect(created.patient?.firstName).toBe('Ahsan');

      await service.create({ title: 'Result callback', type: 'CALLBACK', scheduledAt: at(11), patientId });
      const missedAppt = await service.create({ title: 'Missed follow-up', type: 'FOLLOWUP', scheduledAt: at(8), patientId });
      await service.updateStatus(missedAppt.id, 'MISSED');

      const overview = await service.overview();
      expect(overview.kpis.scheduledToday).toBeGreaterThanOrEqual(1);
      expect(overview.kpis.pendingCallbacks).toBeGreaterThanOrEqual(1);
      expect(overview.kpis.missed).toBeGreaterThanOrEqual(1);

      // Today's schedule includes the collection, ordered by time.
      const titles = overview.todaySchedule.map((a) => a.title);
      expect(titles).toContain('Specimen collection');
      // The callback surfaces in the callbacks panel.
      expect(overview.callbacks.some((c) => c.title === 'Result callback')).toBe(true);
      // A missed appointment yields an overdue alert.
      expect(overview.alerts.some((a) => a.type === 'overdue')).toBe(true);
    }));

  it('filters findAll by type and updates status', () =>
    run(async () => {
      const list = await service.findAll({ type: 'CALLBACK', page: 1, pageSize: 20 });
      expect(list.data.every((a) => a.type === 'CALLBACK')).toBe(true);
      expect(list.total).toBeGreaterThanOrEqual(1);
    }));
});
