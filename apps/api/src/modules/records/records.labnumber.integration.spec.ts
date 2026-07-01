import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { allocateSequence } from '../../common/util/lab-sequence';
import { RecordsService } from './records.service';

/**
 * Record Lab No. (CBL{YY}-{MM}-{seq}): correct format, a MONTHLY-reset sequence,
 * and concurrency-safe allocation (reusing the shared allocator). Gated on
 * DATABASE_URL.
 */
const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('Record Lab No. (integration)', () => {
  const raw = new PrismaClient();
  const labContext = new LabContext();
  const prisma = new PrismaService(labContext);
  const records = new RecordsService(prisma, labContext);

  const tag = `labno-${Date.now().toString(36)}`;
  let labId: string;
  let patientId: string;

  beforeAll(async () => {
    // Slug starts "cbl" so the derived prefix is CBL (legacy-style).
    const lab = await raw.lab.create({ data: { name: `LabNo ${tag}`, slug: `cbl-${tag}` } });
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

  it('generates CBL{YY}-{MM}-{seq} with the current year-month, N distinct & sequential', async () => {
    const N = 15;
    const created = await labContext.run({ labId }, () =>
      Promise.all(Array.from({ length: N }, () => records.create(null as any, { patientId } as any))),
    );
    const labNos = created.map((r) => r.labNumber!);
    expect(new Set(labNos).size).toBe(N); // no collisions

    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const pattern = new RegExp(`^CBL${yy}-${mm}-\\d{3}$`);
    expect(labNos.every((n) => pattern.test(n))).toBe(true);

    const seqs = labNos.map((n) => Number(n.split('-')[2])).sort((a, b) => a - b);
    expect(seqs[0]).toBe(1); // first of the month
    expect(seqs[N - 1]).toBe(N);
  });

  it('resets the sequence per month (a new month starts at 1)', async () => {
    // Drive the underlying monthly counters directly — independent per month.
    const june = await labContext.run({ labId }, async () => [
      await allocateSequence(prisma, labId, 'recordLabNo:2099-06', 0n),
      await allocateSequence(prisma, labId, 'recordLabNo:2099-06', 0n),
    ]);
    const july = await labContext.run({ labId }, () => allocateSequence(prisma, labId, 'recordLabNo:2099-07', 0n));

    expect(june.map(Number)).toEqual([1, 2]); // June: 1,2
    expect(Number(july)).toBe(1); // July resets to 1
  });
});
