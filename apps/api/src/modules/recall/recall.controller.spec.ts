/**
 * Program 3 · C4 — Recall controller permission-metadata + delegation contract.
 *
 * Verifies route->permission MAPPING (design §6) via the Nest Reflector using the EXPORTED
 * `PERMISSIONS_KEY`, plus representative parameter-forwarding contracts. Does NOT prove runtime guard
 * execution, JWT, role resolution, or 403s. Recall reuses the `record:*` permission namespace.
 */
import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import { RecallController } from './recall.controller';
import type { RecallService } from './recall.service';

describe('RecallController permission metadata (C4)', () => {
  const reflector = new Reflector();

  const ROUTES: Array<{ handler: keyof RecallController; permission: string }> = [
    { handler: 'list', permission: 'record:view' },
    { handler: 'summary', permission: 'record:view' },
    { handler: 'generateList', permission: 'record:view' },
    { handler: 'byPatient', permission: 'record:view' },
    { handler: 'manual', permission: 'record:change' },
    { handler: 'detail', permission: 'record:view' },
    { handler: 'update', permission: 'record:change' },
    { handler: 'complete', permission: 'record:change' },
    { handler: 'cancel', permission: 'record:change' },
    { handler: 'decline', permission: 'record:change' },
    { handler: 'notifyClient', permission: 'record:change' },
  ];

  it.each(ROUTES)('$handler requires [$permission]', ({ handler, permission }) => {
    const fn = RecallController.prototype[handler] as unknown as (...args: unknown[]) => unknown;
    const perms = reflector.get<string[]>(PERMISSIONS_KEY, fn);
    expect(perms).toEqual([permission]);
  });

  it('every controller handler carries a permission requirement (none is unprotected)', () => {
    const handlers = Object.getOwnPropertyNames(RecallController.prototype).filter((n) => n !== 'constructor');
    expect(handlers.sort()).toEqual(ROUTES.map((r) => r.handler).sort());
    for (const name of handlers) {
      const fn = (RecallController.prototype as unknown as Record<string, unknown>)[name] as (...a: unknown[]) => unknown;
      const perms = reflector.get<string[]>(PERMISSIONS_KEY, fn);
      expect(Array.isArray(perms) && perms.length > 0).toBe(true);
    }
  });
});

describe('RecallController delegation / parameter forwarding (C4)', () => {
  it('byPatient forwards the patientId param', () => {
    const byPatient = jest.fn();
    const controller = new RecallController({ byPatient } as unknown as RecallService);
    controller.byPatient('pat-7');
    expect(byPatient).toHaveBeenCalledWith('pat-7');
  });

  it('update forwards (id, dto)', () => {
    const update = jest.fn();
    const controller = new RecallController({ update } as unknown as RecallService);
    const dto = { notes: 'n' };
    controller.update('rec-1', dto as never);
    expect(update).toHaveBeenCalledWith('rec-1', dto);
  });

  it('complete forwards (id, dto)', () => {
    const complete = jest.fn();
    const controller = new RecallController({ complete } as unknown as RecallService);
    const dto = { completedRecordId: 'r-2' };
    controller.complete('rec-1', dto as never);
    expect(complete).toHaveBeenCalledWith('rec-1', dto);
  });
});
