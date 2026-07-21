/**
 * Program 3 · C7 — Bethesda analytics integration suite.
 *
 * Tests BethesdaAnalyticsService (in-process Prisma statistics — NOT an external AI path) per the frozen
 * C7 design (490c862). Deterministic fixtures; `period: 'all'` (no date range) or seeded reportedAt so
 * assertions never depend on the uncontrolled wall clock. No external services.
 */
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { createTestPrisma, resolveTestDatabaseUrl } from '@test/test-database';
import { tenancyExtension } from '../../common/tenancy/tenancy.extension';
import { phiEncryptionExtension } from '../../common/crypto/phi-encryption.extension';
import { LabContext } from '../../common/tenancy/lab-context';
import { BethesdaAnalyticsService } from './bethesda-analytics.service';
import type { PrismaService } from '../../database/prisma.service';

const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('BethesdaAnalyticsService (C7 integration)', () => {
  const raw = createTestPrisma();
  const labContext = new LabContext();
  const scoped = raw.$extends(tenancyExtension(labContext)).$extends(phiEncryptionExtension());
  const analytics = new BethesdaAnalyticsService(scoped as unknown as PrismaService);

  const createdLabIds: string[] = [];
  const uid = () => randomUUID().slice(0, 8);

  async function makeLab(): Promise<string> {
    const u = uid();
    const lab = await raw.lab.create({ data: { name: `C7A Lab ${u}`, slug: `c7a-lab-${u}` } });
    createdLabIds.push(lab.id);
    return lab.id;
  }
  async function makeUser(labId: string): Promise<string> {
    const account = await raw.account.create({ data: { labId, name: `Acct ${uid()}` } });
    const user = await raw.user.create({
      data: { labId, accountId: account.id, email: `${uid()}@ex.test`, passwordHash: 'x', firstName: 'Cyto', lastName: uid().slice(0, 4) },
    });
    return user.id;
  }
  async function seedResult(labId: string, fields: Partial<Prisma.BethesdaResultUncheckedCreateInput> = {}) {
    const patient = await raw.patient.create({ data: { labId, registrationNo: `REG-${uid()}`, firstName: 'T', lastName: 'P' } });
    const record = await raw.record.create({ data: { labId, identifier: `ID-${uid()}`, patientId: patient.id } });
    return raw.bethesdaResult.create({
      data: { labId, recordId: record.id, specimenAdequacy: 'Satisfactory', ...fields } as Prisma.BethesdaResultUncheckedCreateInput,
    });
  }

  const runAs = <T>(labId: string, fn: () => Promise<T>): Promise<T> =>
    labContext.run({ labId }, async () => await fn());

  afterAll(async () => {
    if (createdLabIds.length) {
      const where = { labId: { in: createdLabIds } };
      await raw.bethesdaResult.deleteMany({ where });
      await raw.record.deleteMany({ where });
      await raw.patient.deleteMany({ where });
      await raw.user.deleteMany({ where });
      await raw.account.deleteMany({ where });
      await raw.lab.deleteMany({ where: { id: { in: createdLabIds } } });
    }
    await raw.$disconnect();
  });

  it('runs against the isolated _test database', () => {
    expect(resolveTestDatabaseUrl()).toMatch(/test/);
  });

  it('summary (period: all): aggregates counts and rates deterministically', async () => {
    const labId = await makeLab();
    await seedResult(labId, { generalCategory: 'NILM' });
    await seedResult(labId, { generalCategory: 'NILM' });
    await seedResult(labId, { generalCategory: 'EpithelialAbnormality', squamousCategory: 'LSIL' });
    await seedResult(labId, { specimenAdequacy: 'Unsatisfactory' });

    const s = await runAs(labId, () => analytics.summary('all'));
    expect(s.totalClassified).toBe(4);
    expect(s.generalCategory.nilm).toBe(2);
    expect(s.squamous.lsil).toBe(1);
    expect(s.specimenAdequacy.unsatisfactory).toBe(1);
    expect(s.specimenAdequacy.unsatisfactoryRate).toBe(25); // pct(1,4)
  });

  it('benchmarks: computes the unsatisfactory-rate status from seeded data', async () => {
    const labId = await makeLab();
    await seedResult(labId, { generalCategory: 'NILM' });
    await seedResult(labId, { generalCategory: 'NILM' });
    await seedResult(labId, { generalCategory: 'NILM' });
    await seedResult(labId, { specimenAdequacy: 'Unsatisfactory' }); // 1/4 = 25% > 3.0 → fail

    const b = await runAs(labId, () => analytics.benchmarks());
    expect(b.unsatisfactoryRate.value).toBe(25);
    expect(b.unsatisfactoryRate.status).toBe('fail');
  });

  it('byTechnician: groups results by reporting user', async () => {
    const labId = await makeLab();
    const tech = await makeUser(labId);
    await seedResult(labId, { generalCategory: 'NILM', reportedById: tech });
    await seedResult(labId, { generalCategory: 'NILM', reportedById: tech });

    const rows = await runAs(labId, () => analytics.byTechnician());
    const mine = rows.find((r) => r.userId === tech);
    expect(mine?.total).toBe(2);
    expect(mine?.nilmCount).toBe(2);
  });

  it('trend: buckets recent results into the current month window', async () => {
    const labId = await makeLab();
    await seedResult(labId, { generalCategory: 'NILM' }); // reportedAt defaults to now → current month
    await seedResult(labId, { generalCategory: 'NILM' });
    const t = await runAs(labId, () => analytics.trend(1));
    expect(t).toHaveLength(1);
    expect(t[0].total).toBe(2);
  });

  it('tenancy: analytics from lab B excludes lab A results', async () => {
    const labA = await makeLab();
    const labB = await makeLab();
    await seedResult(labA, { generalCategory: 'NILM' });
    const fromB = await runAs(labB, () => analytics.summary('all'));
    expect(fromB.totalClassified).toBe(0);
  });
});
