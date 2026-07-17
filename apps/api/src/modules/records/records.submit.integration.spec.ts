import { PrismaClient, RecordStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { RecordsService } from './records.service';

/**
 * Submit to Cytolab: hands the case off to the lab — Pending → Submitted (NOT
 * Processing), and the urgent toggle marks the case express. Gated on DATABASE_URL.
 */
const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('Record submit(urgent) (integration)', () => {
  const raw = new PrismaClient();
  const labContext = new LabContext();
  const prisma = new PrismaService(labContext);
  const records = new RecordsService(prisma, labContext, { notifyUser: async () => {}, notifyPermission: async () => {} } as any, { record: async () => {} } as any);

  const tag = `sub-${Date.now().toString(36)}`;
  let labId: string;
  let patientId: string;

  const run = <T>(fn: () => Promise<T>) => labContext.run({ labId }, fn);

  beforeAll(async () => {
    const lab = await raw.lab.create({ data: { name: `Sub ${tag}`, slug: `sub-${tag}` } });
    labId = lab.id;
    const patient = await raw.patient.create({
      data: { labId, registrationNo: `${tag}-P`, firstName: 'P', lastName: 'X' },
    });
    patientId = patient.id;
  });

  afterAll(async () => {
    await raw.recordStatusEvent.deleteMany({ where: { labId } });
    await raw.record.deleteMany({ where: { labId } });
    await raw.patient.deleteMany({ where: { labId } });
    await raw.labSequence.deleteMany({ where: { labId } });
    await raw.lab.deleteMany({ where: { id: labId } });
    await prisma.$disconnect();
    await raw.$disconnect();
  });

  it('submit(urgent=true) sets urgent and transitions Pending → Submitted (not Processing)', async () => {
    const rec = await run(() => records.create(null as any, { patientId } as any));
    expect(rec.status).toBe(RecordStatus.Pending);
    expect(rec.urgent).toBe(false);

    const submitted = await run(() => records.submit(rec.id, null as any, true));
    expect(submitted.status).toBe(RecordStatus.Submitted);
    expect(submitted.status).not.toBe(RecordStatus.Processing);
    expect(submitted.urgent).toBe(true);
  });

  it('submit without urgent leaves urgent false and still transitions to Submitted', async () => {
    const rec = await run(() => records.create(null as any, { patientId } as any));
    const submitted = await run(() => records.submit(rec.id, null as any));
    expect(submitted.status).toBe(RecordStatus.Submitted);
    expect(submitted.urgent).toBe(false);
  });
});
