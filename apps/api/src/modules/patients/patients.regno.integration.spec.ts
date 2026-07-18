import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { PatientsService } from './patients.service';

/**
 * Concurrency proof for the registration-number generator: many patient creates
 * running at once must never receive the same registrationNo. The allocator is a
 * single atomic INSERT … ON CONFLICT DO UPDATE … RETURNING against a per-lab
 * LabSequence row, so the DB serializes concurrent allocations. Gated on
 * DATABASE_URL (run migrations first).
 */
const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('PatientsService — registration number (integration)', () => {
  const raw = new PrismaClient();
  const labContext = new LabContext();
  const prisma = new PrismaService(labContext);
  const service = new PatientsService(prisma, labContext, { recordPhiRead: async () => {} } as any);

  const tag = `regno-${Date.now().toString(36)}`;
  let labId: string;

  beforeAll(async () => {
    const lab = await raw.lab.create({ data: { name: `RegNo Lab ${tag}`, slug: `lab-${tag}` } });
    labId = lab.id;
  });

  afterAll(async () => {
    await raw.patient.deleteMany({ where: { labId } });
    await raw.labSequence.deleteMany({ where: { labId } });
    await raw.lab.deleteMany({ where: { id: labId } });
    await prisma.$disconnect();
    await raw.$disconnect();
  });

  it('gives N concurrent creates N distinct, sequential registration numbers', async () => {
    const N = 25;

    const created = await labContext.run({ labId }, () =>
      Promise.all(
        Array.from({ length: N }, (_, i) =>
          service.create({ firstName: 'Conc', lastName: `P${i}` } as any),
        ),
      ),
    );

    const regNos = created.map((p) => p.registrationNo);
    const unique = new Set(regNos);

    // No duplicates — the core guarantee.
    expect(unique.size).toBe(N);

    // And they are exactly the contiguous block above the base (10000001..10000000+N).
    const numeric = regNos.map((r) => Number(r)).sort((a, b) => a - b);
    expect(numeric[0]).toBe(10_000_001);
    expect(numeric[N - 1]).toBe(10_000_000 + N);

    // The DB actually holds N distinct rows too (not just distinct in memory).
    const distinctInDb = await raw.patient.findMany({
      where: { labId },
      select: { registrationNo: true },
    });
    expect(new Set(distinctInDb.map((p) => p.registrationNo)).size).toBe(N);
  });

  it('continues sequentially on the next allocation (counter persisted)', async () => {
    const next = await labContext.run({ labId }, () =>
      service.create({ firstName: 'Next', lastName: 'One' } as any),
    );
    expect(Number(next.registrationNo)).toBe(10_000_001 + 25); // 26th overall
  });
});
