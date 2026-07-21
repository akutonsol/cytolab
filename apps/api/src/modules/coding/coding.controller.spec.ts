/**
 * Program 3 · C8 — Coding controller permission-metadata + delegation contract.
 *
 * Verifies route->permission MAPPING (design §7) via the Nest Reflector using the EXPORTED
 * `PERMISSIONS_KEY`, plus representative parameter-forwarding contracts. Does NOT prove runtime guard
 * execution, JWT, role resolution, or 403s. Coding uses the `record:*` permission namespace.
 */
import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { CodingController } from './coding.controller';
import type { CodingService } from './coding.service';

describe('CodingController permission metadata (C8)', () => {
  const reflector = new Reflector();

  const ROUTES: Array<{ handler: keyof CodingController; permission: string }> = [
    { handler: 'listCodes', permission: 'record:view' },
    { handler: 'createCode', permission: 'record:change' },
    { handler: 'updateCode', permission: 'record:change' },
    { handler: 'deactivateCode', permission: 'record:change' },
    { handler: 'records', permission: 'record:view' },
    { handler: 'stats', permission: 'record:view' },
    { handler: 'suggest', permission: 'record:view' },
    { handler: 'export', permission: 'record:view' },
    { handler: 'getRecordCodings', permission: 'record:view' },
    { handler: 'assign', permission: 'record:change' },
    { handler: 'remove', permission: 'record:change' },
  ];

  it.each(ROUTES)('$handler requires [$permission]', ({ handler, permission }) => {
    const fn = CodingController.prototype[handler] as unknown as (...args: unknown[]) => unknown;
    const perms = reflector.get<string[]>(PERMISSIONS_KEY, fn);
    expect(perms).toEqual([permission]);
  });

  it('every controller handler carries a permission requirement (none is unprotected)', () => {
    const handlers = Object.getOwnPropertyNames(CodingController.prototype).filter((n) => n !== 'constructor');
    expect(handlers.sort()).toEqual(ROUTES.map((r) => r.handler).sort());
    for (const name of handlers) {
      const fn = (CodingController.prototype as unknown as Record<string, unknown>)[name] as (...a: unknown[]) => unknown;
      const perms = reflector.get<string[]>(PERMISSIONS_KEY, fn);
      expect(Array.isArray(perms) && perms.length > 0).toBe(true);
    }
  });
});

describe('CodingController delegation / parameter forwarding (C8)', () => {
  const user = { userId: 'user-1', labId: 'lab-1' } as AuthUser;

  it('assign forwards (recordId, dto, user.userId)', () => {
    const assignCode = jest.fn();
    const controller = new CodingController({ assignCode } as unknown as CodingService);
    const dto = { codeId: 'code-9', codeType: 'Diagnosis' as const };
    controller.assign(user, 'rec-9', dto as never);
    expect(assignCode).toHaveBeenCalledWith('rec-9', dto, 'user-1');
  });

  it('remove forwards (recordId, codeId)', () => {
    const removeCoding = jest.fn();
    const controller = new CodingController({ removeCoding } as unknown as CodingService);
    controller.remove('rec-9', 'code-3');
    expect(removeCoding).toHaveBeenCalledWith('rec-9', 'code-3');
  });

  it('suggest forwards the recordId param', () => {
    const suggest = jest.fn();
    const controller = new CodingController({ suggest } as unknown as CodingService);
    controller.suggest('rec-7');
    expect(suggest).toHaveBeenCalledWith('rec-7');
  });
});
