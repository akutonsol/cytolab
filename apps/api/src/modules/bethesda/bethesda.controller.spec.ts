/**
 * Program 3 · C7 — Bethesda controller permission-metadata + delegation contract.
 *
 * Verifies route->permission MAPPING (design §6) via the Nest Reflector using the EXPORTED
 * `PERMISSIONS_KEY`, plus representative parameter-forwarding contracts. Does NOT prove runtime guard
 * execution, JWT, role resolution, or 403s. Bethesda uses the `resultentry:*` permission namespace.
 */
import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { BethesdaController } from './bethesda.controller';
import type { BethesdaService } from './bethesda.service';
import type { BethesdaAnalyticsService } from './bethesda-analytics.service';

describe('BethesdaController permission metadata (C7)', () => {
  const reflector = new Reflector();

  const ROUTES: Array<{ handler: keyof BethesdaController; permission: string }> = [
    { handler: 'analyticsSummary', permission: 'resultentry:view' },
    { handler: 'analyticsTrend', permission: 'resultentry:view' },
    { handler: 'analyticsBenchmarks', permission: 'resultentry:view' },
    { handler: 'analyticsByTechnician', permission: 'resultentry:view' },
    { handler: 'getByRecord', permission: 'resultentry:view' },
    { handler: 'upsert', permission: 'resultentry:change' },
    { handler: 'remove', permission: 'resultentry:change' },
  ];

  it.each(ROUTES)('$handler requires [$permission]', ({ handler, permission }) => {
    const fn = BethesdaController.prototype[handler] as unknown as (...args: unknown[]) => unknown;
    const perms = reflector.get<string[]>(PERMISSIONS_KEY, fn);
    expect(perms).toEqual([permission]);
  });

  it('every controller handler carries a permission requirement (none is unprotected)', () => {
    const handlers = Object.getOwnPropertyNames(BethesdaController.prototype).filter((n) => n !== 'constructor');
    expect(handlers.sort()).toEqual(ROUTES.map((r) => r.handler).sort());
    for (const name of handlers) {
      const fn = (BethesdaController.prototype as unknown as Record<string, unknown>)[name] as (...a: unknown[]) => unknown;
      const perms = reflector.get<string[]>(PERMISSIONS_KEY, fn);
      expect(Array.isArray(perms) && perms.length > 0).toBe(true);
    }
  });
});

describe('BethesdaController delegation / parameter forwarding (C7)', () => {
  const user = { userId: 'user-1', labId: 'lab-1' } as AuthUser;
  const make = (svc: Partial<BethesdaService>, analytics: Partial<BethesdaAnalyticsService> = {}) =>
    new BethesdaController(svc as BethesdaService, analytics as BethesdaAnalyticsService);

  it('upsert forwards (recordId, dto, user.userId)', () => {
    const upsert = jest.fn();
    const controller = make({ upsert });
    const dto = { specimenAdequacy: 'Satisfactory' as const };
    controller.upsert(user, 'rec-9', dto as never);
    expect(upsert).toHaveBeenCalledWith('rec-9', dto, 'user-1');
  });

  it('getByRecord forwards the recordId param', () => {
    const getByRecord = jest.fn();
    const controller = make({ getByRecord });
    controller.getByRecord('rec-5');
    expect(getByRecord).toHaveBeenCalledWith('rec-5');
  });

  it('analyticsSummary forwards (period, year, month) from the query', () => {
    const summary = jest.fn();
    const controller = make({}, { summary });
    controller.analyticsSummary({ period: 'year', year: 2025, month: 3 } as never);
    expect(summary).toHaveBeenCalledWith('year', 2025, 3);
  });
});
