import { BadRequestException } from '@nestjs/common';
import { PayAdviceStatus } from '@prisma/client';
import { PayrollService, computePayrollIntegrityHash } from './payroll.service';

/**
 * Correctness follow-up (1): the payroll integrity hash must never go stale, and an APPROVED run is
 * frozen (its advices can no longer be edited). Pure-helper tests + mocked-Prisma service tests.
 */
describe('computePayrollIntegrityHash (tamper-evidence anchor)', () => {
  const base = {
    runNumber: 1,
    period: '2026-07',
    payrollDate: new Date('2026-07-31T00:00:00Z'),
    totalGross: 100,
    totalNet: 80,
    advices: [{ employeeId: 'b', netPay: 40 }, { employeeId: 'a', netPay: 40 }],
  };

  it('is deterministic for identical inputs', () => {
    expect(computePayrollIntegrityHash(base)).toBe(computePayrollIntegrityHash(base));
  });

  it('is independent of advice order (sorted by employeeId)', () => {
    const reordered = { ...base, advices: [{ employeeId: 'a', netPay: 40 }, { employeeId: 'b', netPay: 40 }] };
    expect(computePayrollIntegrityHash(reordered)).toBe(computePayrollIntegrityHash(base));
  });

  it('CHARACTERIZATION: a changed net pay yields a different hash — so a NON-recomputed hash would be stale/wrong', () => {
    const edited = { ...base, totalNet: 81, advices: [{ employeeId: 'a', netPay: 41 }, { employeeId: 'b', netPay: 40 }] };
    expect(computePayrollIntegrityHash(edited)).not.toBe(computePayrollIntegrityHash(base));
  });
});

describe('PayrollService.updateAdvice — freeze + truthful hash', () => {
  const make = (over: { status?: PayAdviceStatus; approvedAt?: Date | null; editedNet?: number } = {}) => {
    const advice = {
      id: 'a1', basicPay: 30_000_000, overtime: 0, allowances: 0, commission: 0, bonus: 0,
      pension: 0, reimbursement: 0, otherDeductions: 0, payrollRunId: 'r1',
      status: over.status ?? PayAdviceStatus.Issued,
    };
    const run = { runNumber: 1, period: '2026-07', payrollDate: new Date('2026-07-31T00:00:00Z'), approvedAt: over.approvedAt ?? null };
    const currentAdvices = [{ employeeId: 'e1', grossPay: 30_000_000, netPay: over.editedNet ?? 24_112_100 }];
    const prisma: any = {
      payAdvice: {
        findFirst: jest.fn().mockResolvedValue(advice),
        update: jest.fn().mockResolvedValue({ id: 'a1' }),
        findMany: jest.fn().mockResolvedValue(currentAdvices), // recomputeRunTotals reads these
      },
      payrollRun: {
        findUnique: jest.fn().mockResolvedValue(run), // both the approval check and the recompute read
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const svc = new PayrollService(prisma);
    return { svc, prisma, run, currentAdvices };
  };

  it('NEGATIVE: rejects an edit once the parent run is APPROVED (freeze)', async () => {
    const { svc, prisma } = make({ approvedAt: new Date() });
    await expect(svc.updateAdvice('a1', { bonus: 5_000_000 } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.payAdvice.update).not.toHaveBeenCalled(); // no mutation on a frozen run
  });

  it('NEGATIVE: preserves the existing rejection for a Paid advice', async () => {
    const { svc, prisma } = make({ status: PayAdviceStatus.Paid });
    await expect(svc.updateAdvice('a1', { bonus: 5_000_000 } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.payAdvice.update).not.toHaveBeenCalled();
  });

  it('a pre-approval edit proceeds AND recomputes the integrity hash to match the new data', async () => {
    const { svc, prisma, run, currentAdvices } = make({ approvedAt: null, editedNet: 23_000_000 });
    await svc.updateAdvice('a1', { bonus: 1_000_000 } as any);
    expect(prisma.payAdvice.update).toHaveBeenCalled();
    // The run update carries a FRESH hash equal to a recomputation over the current advices — not stale.
    const runUpdate = prisma.payrollRun.update.mock.calls.at(-1)![0];
    const expected = computePayrollIntegrityHash({
      runNumber: run.runNumber, period: run.period, payrollDate: run.payrollDate,
      totalGross: 30_000_000, totalNet: 23_000_000, advices: currentAdvices,
    });
    expect(runUpdate.data.integrityHash).toBe(expected);
    expect(runUpdate.data.totalNet).toBe(23_000_000);
  });
});
