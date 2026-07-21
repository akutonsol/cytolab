/**
 * Program 3 · C3 — Payroll service integration + tenancy suite.
 *
 * Implements ONLY the tests defined by the frozen C3 design (docs/PROGRAM_3_C3_PAYROLL_TEST_DESIGN.md,
 * commit ccdc930), scoped to engine 1 (the `payroll` module). Reuses the C1/C2 production-parity `_test`
 * harness. PayrollService injects only Prisma — there are NO collaborators to stub.
 *
 * SD-2..SD-7 (design §8) are NOT converted into expected behavior: no test asserts integrityHash
 * recomputation on edit, YTD recompute on edit, unguarded-approved-run deletion, payAdvice prior-state,
 * negative-net acceptance, or runNumber-race outcomes. removeRun is exercised only on an UNAPPROVED run.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PayAdviceStatus, PayrollRunStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { createTestPrisma, resolveTestDatabaseUrl } from '@test/test-database';
import { tenancyExtension } from '../../common/tenancy/tenancy.extension';
import { phiEncryptionExtension } from '../../common/crypto/phi-encryption.extension';
import { LabContext } from '../../common/tenancy/lab-context';
import { PayrollService } from './payroll.service';
import type { PrismaService } from '../../database/prisma.service';

const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('PayrollService (C3 integration)', () => {
  const raw = createTestPrisma();
  const labContext = new LabContext();
  const scoped = raw.$extends(tenancyExtension(labContext)).$extends(phiEncryptionExtension());
  const payroll = new PayrollService(scoped as unknown as PrismaService);

  const createdLabIds: string[] = [];
  const uid = () => randomUUID().slice(0, 8);

  async function makeLab(): Promise<string> {
    const u = uid();
    const lab = await raw.lab.create({ data: { name: `C3 Lab ${u}`, slug: `c3-lab-${u}` } });
    createdLabIds.push(lab.id);
    return lab.id;
  }
  /** A user in the lab (usable as an Employee's user or as a processing/approving actor). */
  async function makeUser(labId: string): Promise<string> {
    const account = await raw.account.create({ data: { labId, name: `Acct ${uid()}` } });
    const user = await raw.user.create({
      data: { labId, accountId: account.id, email: `${uid()}@ex.test`, passwordHash: 'x', firstName: 'Emp', lastName: uid().slice(0, 4) },
    });
    return user.id;
  }
  async function makeEmployee(labId: string, opts: { salary?: number; isActive?: boolean } = {}) {
    const userId = await makeUser(labId);
    return raw.employee.create({
      data: {
        labId,
        userId,
        employeeNo: `E-${uid()}`,
        jobTitle: 'Technologist',
        startDate: new Date('2024-01-01'),
        salary: opts.salary ?? 1_000_000,
        isActive: opts.isActive ?? true,
      },
    });
  }

  const runAs = <T>(labId: string, fn: () => Promise<T>): Promise<T> =>
    labContext.run({ labId }, async () => await fn());

  afterAll(async () => {
    if (createdLabIds.length) {
      const where = { labId: { in: createdLabIds } };
      await raw.payAdvice.deleteMany({ where });
      await raw.payrollRun.deleteMany({ where }); // references users via processed/approvedBy — before users
      await raw.employee.deleteMany({ where });
      await raw.user.deleteMany({ where });
      await raw.account.deleteMany({ where });
      await raw.lab.deleteMany({ where: { id: { in: createdLabIds } } });
    }
    await raw.$disconnect();
  });

  it('runs against the isolated _test database', () => {
    expect(resolveTestDatabaseUrl()).toMatch(/test/);
  });

  // ================================ processRun ================================

  it('processRun: one Issued advice per active employee, run Completed, totals + runNumber + integrityHash set', async () => {
    const labId = await makeLab();
    await makeEmployee(labId, { salary: 1_000_000 });
    await makeEmployee(labId, { salary: 1_000_000 });
    const actor = await makeUser(labId);

    const run = await runAs(labId, () => payroll.processRun({ period: '2025-01' }, actor));

    expect(run.status).toBe(PayrollRunStatus.Completed);
    expect(run.employeeCount).toBe(2);
    expect(run.payAdvices).toHaveLength(2);
    expect(run.payAdvices.every((a) => a.status === PayAdviceStatus.Issued)).toBe(true);
    expect(run.totalGross).toBe(2_000_000); // 2 × salary
    expect(run.totalNet).toBe(1_856_350); // 2 × 928,175
    expect(run.totalDeductions).toBe(143_650); // totalGross − totalNet
    expect(run.runNumber).toBe(1);
    expect(run.integrityHash).toBeTruthy();
  });

  it('processRun: applies per-employee line overrides (overtime raises that advice’s gross)', async () => {
    const labId = await makeLab();
    const emp = await makeEmployee(labId, { salary: 1_000_000 });
    const actor = await makeUser(labId);

    const run = await runAs(labId, () =>
      payroll.processRun({ period: '2025-01', lines: [{ employeeId: emp.id, overtime: 200_000 }] }, actor),
    );

    expect(run.payAdvices[0].grossPay).toBe(1_200_000); // salary + overtime
  });

  it('processRun: rejects a duplicate period', async () => {
    const labId = await makeLab();
    await makeEmployee(labId);
    const actor = await makeUser(labId);
    await runAs(labId, () => payroll.processRun({ period: '2025-02' }, actor));
    await expect(runAs(labId, () => payroll.processRun({ period: '2025-02' }, actor))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('processRun: rejects when there are no active employees', async () => {
    const labId = await makeLab();
    await makeEmployee(labId, { isActive: false });
    const actor = await makeUser(labId);
    await expect(runAs(labId, () => payroll.processRun({ period: '2025-01' }, actor))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('processRun: assigns sequential per-lab run numbers', async () => {
    const labId = await makeLab();
    await makeEmployee(labId);
    const actor = await makeUser(labId);
    const first = await runAs(labId, () => payroll.processRun({ period: '2025-01' }, actor));
    const second = await runAs(labId, () => payroll.processRun({ period: '2025-02' }, actor));
    expect(second.runNumber).toBe(first.runNumber + 1);
  });

  it('processRun: rolls up YTD from prior same-year periods', async () => {
    const labId = await makeLab();
    const emp = await makeEmployee(labId, { salary: 1_000_000 });
    const actor = await makeUser(labId);
    await runAs(labId, () => payroll.processRun({ period: '2025-01' }, actor));
    const feb = await runAs(labId, () => payroll.processRun({ period: '2025-02' }, actor));
    const advice = feb.payAdvices.find((a) => a.employeeId === emp.id)!;
    expect(advice.grossPay).toBe(1_000_000);
    expect(advice.ytdGross).toBe(2_000_000); // Jan + Feb
  });

  // ================================ approveRun ================================

  it('approveRun: a Completed run becomes approved with notes', async () => {
    const labId = await makeLab();
    await makeEmployee(labId);
    const actor = await makeUser(labId);
    const run = await runAs(labId, () => payroll.processRun({ period: '2025-01' }, actor));

    const approved = await runAs(labId, () => payroll.approveRun(run.id, actor, { notes: '  looks good  ' }));
    expect(approved.approvedAt).toBeTruthy();
    expect(approved.approvalNotes).toBe('looks good'); // trimmed
  });

  it('approveRun: rejects a run that is not Completed', async () => {
    const labId = await makeLab();
    const actor = await makeUser(labId);
    // Seed a Draft run directly (processRun only ever produces Completed).
    const draft = await raw.payrollRun.create({ data: { labId, period: '2025-03', status: PayrollRunStatus.Draft } });
    await expect(runAs(labId, () => payroll.approveRun(draft.id, actor, {}))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('approveRun: rejects an already-approved run', async () => {
    const labId = await makeLab();
    await makeEmployee(labId);
    const actor = await makeUser(labId);
    const run = await runAs(labId, () => payroll.processRun({ period: '2025-01' }, actor));
    await runAs(labId, () => payroll.approveRun(run.id, actor, {}));
    await expect(runAs(labId, () => payroll.approveRun(run.id, actor, {}))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('approveRun: rejects an unknown run', async () => {
    const labId = await makeLab();
    const actor = await makeUser(labId);
    await expect(runAs(labId, () => payroll.approveRun(randomUUID(), actor, {}))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  // ================================ removeRun ================================

  it('removeRun: deletes an unapproved run and cascades its advices', async () => {
    const labId = await makeLab();
    await makeEmployee(labId);
    const actor = await makeUser(labId);
    const run = await runAs(labId, () => payroll.processRun({ period: '2025-01' }, actor));

    const result = await runAs(labId, () => payroll.removeRun(run.id));
    expect(result).toEqual({ deleted: true });
    await expect(runAs(labId, () => payroll.getRun(run.id))).rejects.toBeInstanceOf(NotFoundException);
    expect(await raw.payAdvice.count({ where: { payrollRunId: run.id } })).toBe(0);
  });

  it('removeRun: rejects an unknown run', async () => {
    const labId = await makeLab();
    await expect(runAs(labId, () => payroll.removeRun(randomUUID()))).rejects.toBeInstanceOf(NotFoundException);
  });

  // ================================ runs queries ================================

  it('listRuns: paginates', async () => {
    const labId = await makeLab();
    await makeEmployee(labId);
    const actor = await makeUser(labId);
    await runAs(labId, () => payroll.processRun({ period: '2025-01' }, actor));
    await runAs(labId, () => payroll.processRun({ period: '2025-02' }, actor));
    await runAs(labId, () => payroll.processRun({ period: '2025-03' }, actor));

    const page = await runAs(labId, () => payroll.listRuns({ page: 1, pageSize: 2 }));
    expect(page.total).toBe(3);
    expect(page.data).toHaveLength(2);
  });

  it('getRun: returns the run with advices; unknown → NotFound', async () => {
    const labId = await makeLab();
    await makeEmployee(labId);
    const actor = await makeUser(labId);
    const run = await runAs(labId, () => payroll.processRun({ period: '2025-01' }, actor));
    const fetched = await runAs(labId, () => payroll.getRun(run.id));
    expect(fetched.payAdvices).toHaveLength(1);
    await expect(runAs(labId, () => payroll.getRun(randomUUID()))).rejects.toBeInstanceOf(NotFoundException);
  });

  // ================================ updateAdvice / payAdvice ================================

  it('updateAdvice: recomputes the advice and the run totals', async () => {
    const labId = await makeLab();
    await makeEmployee(labId, { salary: 1_000_000 });
    const actor = await makeUser(labId);
    const run = await runAs(labId, () => payroll.processRun({ period: '2025-01' }, actor));
    const adviceId = run.payAdvices[0].id;

    const updated = await runAs(labId, () => payroll.updateAdvice(adviceId, { overtime: 200_000 }));
    expect(updated.grossPay).toBe(1_200_000);
    expect(updated.netPay).toBe(1_113_810); // hand-computed for gross 1,200,000

    const rerun = await runAs(labId, () => payroll.getRun(run.id));
    expect(rerun.totalGross).toBe(1_200_000);
    expect(rerun.totalNet).toBe(1_113_810);
  });

  it('updateAdvice: rejects editing a Paid advice', async () => {
    const labId = await makeLab();
    await makeEmployee(labId);
    const actor = await makeUser(labId);
    const run = await runAs(labId, () => payroll.processRun({ period: '2025-01' }, actor));
    const adviceId = run.payAdvices[0].id;
    await runAs(labId, () => payroll.payAdvice(adviceId));
    await expect(runAs(labId, () => payroll.updateAdvice(adviceId, { overtime: 1 }))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('updateAdvice: unknown → NotFound', async () => {
    const labId = await makeLab();
    await expect(runAs(labId, () => payroll.updateAdvice(randomUUID(), { overtime: 1 }))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('payAdvice: marks an advice Paid; unknown → NotFound', async () => {
    const labId = await makeLab();
    await makeEmployee(labId);
    const actor = await makeUser(labId);
    const run = await runAs(labId, () => payroll.processRun({ period: '2025-01' }, actor));
    const paid = await runAs(labId, () => payroll.payAdvice(run.payAdvices[0].id));
    expect(paid.status).toBe(PayAdviceStatus.Paid);
    await expect(runAs(labId, () => payroll.payAdvice(randomUUID()))).rejects.toBeInstanceOf(NotFoundException);
  });

  // ================================ advice queries + slip ================================

  it('listAdvices: filters by period and employeeId', async () => {
    const labId = await makeLab();
    const emp = await makeEmployee(labId);
    await makeEmployee(labId);
    const actor = await makeUser(labId);
    await runAs(labId, () => payroll.processRun({ period: '2025-01' }, actor));

    const byPeriod = await runAs(labId, () => payroll.listAdvices({ period: '2025-01' }));
    expect(byPeriod.total).toBe(2);
    const byEmp = await runAs(labId, () => payroll.listAdvices({ employeeId: emp.id }));
    expect(byEmp.total).toBe(1);
    expect(byEmp.data[0].employeeId).toBe(emp.id);
  });

  it('getAdvice: unknown → NotFound', async () => {
    const labId = await makeLab();
    await expect(runAs(labId, () => payroll.getAdvice(randomUUID()))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getSlip: returns the advice plus the lab; unknown → NotFound', async () => {
    const labId = await makeLab();
    await makeEmployee(labId);
    const actor = await makeUser(labId);
    const run = await runAs(labId, () => payroll.processRun({ period: '2025-01' }, actor));
    const slip = await runAs(labId, () => payroll.getSlip(run.payAdvices[0].id, labId));
    expect(slip.lab).toBeTruthy();
    expect((slip as any).payrollRun.period).toBe('2025-01');
    await expect(runAs(labId, () => payroll.getSlip(randomUUID(), labId))).rejects.toBeInstanceOf(NotFoundException);
  });

  // ================================ stats / analytics ================================

  it('getStats: reports total runs and the latest run', async () => {
    const labId = await makeLab();
    await makeEmployee(labId);
    const actor = await makeUser(labId);
    await runAs(labId, () => payroll.processRun({ period: '2025-01' }, actor));
    const stats = await runAs(labId, () => payroll.getStats());
    expect(stats.totalRuns).toBe(1);
    expect(stats.latest?.period).toBe('2025-01');
  });

  it('getAnalytics: returns 12 month buckets with the run’s totals reflected', async () => {
    const labId = await makeLab();
    await makeEmployee(labId, { salary: 1_000_000 });
    const actor = await makeUser(labId);
    await runAs(labId, () => payroll.processRun({ period: '2025-01' }, actor));
    const analytics = await runAs(labId, () => payroll.getAnalytics(2025));
    expect(analytics.byPeriod).toHaveLength(12);
    const jan = analytics.byPeriod.find((p) => p.period === '2025-01')!;
    expect(jan.totalGross).toBe(1_000_000);
    expect(analytics.yearlyTotals.totalGross).toBe(1_000_000);
  });

  it('getAnalytics: an empty year reports zero totals', async () => {
    const labId = await makeLab();
    const analytics = await runAs(labId, () => payroll.getAnalytics(2030));
    expect(analytics.yearlyTotals.totalGross).toBe(0);
    expect(analytics.byPeriod).toHaveLength(12);
  });

  // ================================ tenancy ================================

  it('tenancy: getRun cannot read another lab’s run', async () => {
    const labA = await makeLab();
    const labB = await makeLab();
    await makeEmployee(labA);
    const actor = await makeUser(labA);
    const run = await runAs(labA, () => payroll.processRun({ period: '2025-01' }, actor));
    await expect(runAs(labB, () => payroll.getRun(run.id))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('tenancy: getAdvice / updateAdvice / payAdvice cannot reach another lab’s advice', async () => {
    const labA = await makeLab();
    const labB = await makeLab();
    await makeEmployee(labA);
    const actor = await makeUser(labA);
    const run = await runAs(labA, () => payroll.processRun({ period: '2025-01' }, actor));
    const adviceId = run.payAdvices[0].id;
    await expect(runAs(labB, () => payroll.getAdvice(adviceId))).rejects.toBeInstanceOf(NotFoundException);
    await expect(runAs(labB, () => payroll.updateAdvice(adviceId, { overtime: 1 }))).rejects.toBeInstanceOf(NotFoundException);
    await expect(runAs(labB, () => payroll.payAdvice(adviceId))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('tenancy: approveRun / removeRun cannot reach another lab’s run', async () => {
    const labA = await makeLab();
    const labB = await makeLab();
    await makeEmployee(labA);
    const actor = await makeUser(labA);
    const run = await runAs(labA, () => payroll.processRun({ period: '2025-01' }, actor));
    const actorB = await makeUser(labB);
    await expect(runAs(labB, () => payroll.approveRun(run.id, actorB, {}))).rejects.toBeInstanceOf(NotFoundException);
    await expect(runAs(labB, () => payroll.removeRun(run.id))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('tenancy: listRuns from lab B excludes lab A runs', async () => {
    const labA = await makeLab();
    const labB = await makeLab();
    await makeEmployee(labA);
    const actorA = await makeUser(labA);
    const runA = await runAs(labA, () => payroll.processRun({ period: '2025-01' }, actorA));
    const fromB = await runAs(labB, () => payroll.listRuns({}));
    expect(fromB.data.some((r) => r.id === runA.id)).toBe(false);
  });

  it('tenancy: processRun counts only the acting lab’s active employees', async () => {
    const labA = await makeLab();
    const labB = await makeLab();
    await makeEmployee(labA);
    await makeEmployee(labA);
    await makeEmployee(labB); // one employee in lab B
    const actorB = await makeUser(labB);
    const run = await runAs(labB, () => payroll.processRun({ period: '2025-01' }, actorB));
    expect(run.employeeCount).toBe(1); // lab A's two employees are not included
  });

  it('tenancy: a Payroll read with no lab context fails closed (guard throws)', async () => {
    await expect(payroll.listRuns({})).rejects.toThrow(/no lab context/i);
  });
});
