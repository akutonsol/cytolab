/**
 * Program 3 · C5 — Reagent controller permission-metadata + delegation contract.
 *
 * Verifies route->permission MAPPING (design §6) via the Nest Reflector using the EXPORTED
 * `PERMISSIONS_KEY`, plus representative parameter-forwarding contracts. Does NOT prove runtime guard
 * execution, JWT, role resolution, or 403s. Reagent reuses the `record:*` permission namespace.
 */
import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { ReagentController } from './reagent.controller';
import type { ReagentService } from './reagent.service';

describe('ReagentController permission metadata (C5)', () => {
  const reflector = new Reflector();

  const ROUTES: Array<{ handler: keyof ReagentController; permission: string }> = [
    { handler: 'list', permission: 'record:view' },
    { handler: 'expiring', permission: 'record:view' },
    { handler: 'stats', permission: 'record:view' },
    { handler: 'usedOnRecord', permission: 'record:view' },
    { handler: 'create', permission: 'record:change' },
    { handler: 'detail', permission: 'record:view' },
    { handler: 'update', permission: 'record:change' },
    { handler: 'remove', permission: 'record:change' },
    { handler: 'use', permission: 'record:change' },
    { handler: 'quarantine', permission: 'record:change' },
    { handler: 'affectedRecords', permission: 'record:view' },
  ];

  it.each(ROUTES)('$handler requires [$permission]', ({ handler, permission }) => {
    const fn = ReagentController.prototype[handler] as unknown as (...args: unknown[]) => unknown;
    const perms = reflector.get<string[]>(PERMISSIONS_KEY, fn);
    expect(perms).toEqual([permission]);
  });

  it('every controller handler carries a permission requirement (none is unprotected)', () => {
    const handlers = Object.getOwnPropertyNames(ReagentController.prototype).filter((n) => n !== 'constructor');
    expect(handlers.sort()).toEqual(ROUTES.map((r) => r.handler).sort());
    for (const name of handlers) {
      const fn = (ReagentController.prototype as unknown as Record<string, unknown>)[name] as (...a: unknown[]) => unknown;
      const perms = reflector.get<string[]>(PERMISSIONS_KEY, fn);
      expect(Array.isArray(perms) && perms.length > 0).toBe(true);
    }
  });
});

describe('ReagentController delegation / parameter forwarding (C5)', () => {
  const user = { userId: 'user-1', labId: 'lab-1' } as AuthUser;

  it('create forwards (dto, user.userId)', () => {
    const create = jest.fn();
    const controller = new ReagentController({ create } as unknown as ReagentService);
    const dto = { name: 'r', lotNumber: 'l' };
    controller.create(user, dto as never);
    expect(create).toHaveBeenCalledWith(dto, 'user-1');
  });

  it('use forwards (id, user.userId, dto)', () => {
    const use = jest.fn();
    const controller = new ReagentController({ use } as unknown as ReagentService);
    const dto = { quantityUsed: 3 };
    controller.use(user, 'lot-9', dto as never);
    expect(use).toHaveBeenCalledWith('lot-9', 'user-1', dto);
  });

  it('usedOnRecord forwards the recordId param', () => {
    const usedOnRecord = jest.fn();
    const controller = new ReagentController({ usedOnRecord } as unknown as ReagentService);
    controller.usedOnRecord('rec-5');
    expect(usedOnRecord).toHaveBeenCalledWith('rec-5');
  });
});
