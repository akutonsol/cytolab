import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { AppointmentsService } from './appointments.service';

/**
 * Appointments from real data: create an appointment, run it through the
 * lifecycle, and confirm list/stats/calendar reflect it. Lab-scoped; the
 * notifications helper is stubbed. Gated on DATABASE_URL.
 */
const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('AppointmentsService (integration)', () => {
  const raw = new PrismaClient();
  const labContext = new LabContext();
  const prisma = new PrismaService(labContext);
  const notifs = { notifyUser: async () => undefined } as any;
  const service = new AppointmentsService(prisma, notifs);

  const tag = `appt-${Date.now().toString(36)}`;
  let labId: string;
  let patientId: string;
  const run = <T>(fn: () => Promise<T>) => labContext.run({ labId }, fn);
  const at = (h: number, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };

  beforeAll(async () => {
    const lab = await raw.lab.create({ data: { name: `Appt ${tag}`, slug: `appt-${tag}` } });
    labId = lab.id;
    const patient = await raw.patient.create({ data: { labId, registrationNo: `${tag}-P1`, firstName: 'Ahsan', lastName: 'Habib' } });
    patientId = patient.id;
  });

  afterAll(async () => {
    await raw.appointment.deleteMany({ where: { labId } });
    await raw.patient.deleteMany({ where: { labId } });
    await raw.lab.deleteMany({ where: { id: labId } });
    await prisma.$disconnect();
    await raw.$disconnect();
  });

  it('creates an appointment and lists it for today', () =>
    run(async () => {
      const created = await service.create({ patientId, appointmentType: 'SpecimenCollection', scheduledAt: at(9) }, 'system');
      expect(created.status).toBe('Scheduled');
      expect(created.patientName).toBe('Ahsan Habib');

      const today = await service.today();
      expect(today.some((a) => a.id === created.id)).toBe(true);
    }));

  it('runs the lifecycle: confirm → check-in → complete', () =>
    run(async () => {
      const a = await service.create({ patientId, appointmentType: 'FollowUp', scheduledAt: at(11) }, 'system');
      expect((await service.confirm(a.id)).status).toBe('Confirmed');
      const checked = await service.checkIn(a.id);
      expect(checked.status).toBe('CheckedIn');
      expect(checked.checkedInAt).toBeTruthy();
      const done = await service.complete(a.id, {});
      expect(done.status).toBe('Completed');
      expect(done.completedAt).toBeTruthy();
    }));

  it('reschedules into a fresh Scheduled appointment', () =>
    run(async () => {
      const a = await service.create({ patientId, appointmentType: 'Consultation', scheduledAt: at(13) }, 'system');
      const next = await service.reschedule(a.id, { newScheduledAt: at(15) }, 'system');
      expect(next.status).toBe('Scheduled');
      expect(next.id).not.toBe(a.id);
      expect((await service.findOne(a.id)).status).toBe('Rescheduled');
    }));

  it('aggregates stats and calendar', () =>
    run(async () => {
      const stats = await service.stats();
      expect(stats.todayCount).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(stats.byType)).toBe(true);
      const now = new Date();
      const cal = await service.calendar({ year: now.getFullYear(), month: now.getMonth() + 1 });
      const key = now.toISOString().slice(0, 10);
      expect(cal.dates[key]?.length ?? 0).toBeGreaterThanOrEqual(1);
    }));
});
