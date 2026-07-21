/**
 * Program 3 · C3 — Payroll controller permission-metadata + delegation contract.
 *
 * Verifies route->permission MAPPING (design §5) via the Nest Reflector using the EXPORTED
 * `PERMISSIONS_KEY`, and the parameter-forwarding contracts for the handlers that thread request context
 * (userId / labId / parsed year) into the service. Does NOT prove runtime guard execution, JWT, role
 * resolution, or 403s.
 */
import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { PayrollController } from './payroll.controller';
import type { PayrollService } from './payroll.service';

describe('PayrollController permission metadata (C3)', () => {
  const reflector = new Reflector();

  const ROUTES: Array<{ handler: keyof PayrollController; permission: string }> = [
    { handler: 'getStats', permission: 'payroll:view' },
    { handler: 'getAnalytics', permission: 'payroll:view' },
    { handler: 'listRuns', permission: 'payroll:view' },
    { handler: 'processRun', permission: 'payroll:create' },
    { handler: 'approveRun', permission: 'payroll:change' },
    { handler: 'getRun', permission: 'payroll:view' },
    { handler: 'removeRun', permission: 'payroll:delete' },
    { handler: 'listAdvices', permission: 'payadvice:view' },
    { handler: 'getSlip', permission: 'payadvice:view' },
    { handler: 'getAdvice', permission: 'payadvice:view' },
    { handler: 'updateAdvice', permission: 'payadvice:change' },
    { handler: 'payAdvice', permission: 'payadvice:change' },
  ];

  it.each(ROUTES)('$handler requires [$permission]', ({ handler, permission }) => {
    const fn = PayrollController.prototype[handler] as unknown as (...args: unknown[]) => unknown;
    const perms = reflector.get<string[]>(PERMISSIONS_KEY, fn);
    expect(perms).toEqual([permission]);
  });

  it('every controller handler carries a permission requirement (none is unprotected)', () => {
    const handlers = Object.getOwnPropertyNames(PayrollController.prototype).filter((n) => n !== 'constructor');
    expect(handlers.sort()).toEqual(ROUTES.map((r) => r.handler).sort());
    for (const name of handlers) {
      const fn = (PayrollController.prototype as unknown as Record<string, unknown>)[name] as (
        ...a: unknown[]
      ) => unknown;
      const perms = reflector.get<string[]>(PERMISSIONS_KEY, fn);
      expect(Array.isArray(perms) && perms.length > 0).toBe(true);
    }
  });
});

describe('PayrollController delegation / parameter forwarding (C3)', () => {
  const user = { userId: 'user-1', labId: 'lab-1' } as AuthUser;

  it('processRun forwards (dto, user.userId)', () => {
    const processRun = jest.fn();
    const controller = new PayrollController({ processRun } as unknown as PayrollService);
    const dto = { period: '2025-01' };
    controller.processRun(user, dto as never);
    expect(processRun).toHaveBeenCalledWith(dto, 'user-1');
  });

  it('approveRun forwards (id, user.userId, dto)', () => {
    const approveRun = jest.fn();
    const controller = new PayrollController({ approveRun } as unknown as PayrollService);
    const dto = { notes: 'ok' };
    controller.approveRun(user, 'run-9', dto as never);
    expect(approveRun).toHaveBeenCalledWith('run-9', 'user-1', dto);
  });

  it('getSlip forwards (id, user.labId)', () => {
    const getSlip = jest.fn();
    const controller = new PayrollController({ getSlip } as unknown as PayrollService);
    controller.getSlip(user, 'advice-3');
    expect(getSlip).toHaveBeenCalledWith('advice-3', 'lab-1');
  });

  it('getAnalytics parses the year query and forwards a number', () => {
    const getAnalytics = jest.fn();
    const controller = new PayrollController({ getAnalytics } as unknown as PayrollService);
    controller.getAnalytics('2025');
    expect(getAnalytics).toHaveBeenCalledWith(2025);
    // Omitted year → defaults to a number (current year).
    controller.getAnalytics(undefined);
    expect(getAnalytics).toHaveBeenLastCalledWith(expect.any(Number));
  });
});
