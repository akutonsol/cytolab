/**
 * Program 3 · C9 — Taxes controller permission-metadata + delegation contract.
 *
 * Implements ONLY the tests defined by the frozen C9 design
 * (docs/PROGRAM_3_C9_TAXES_TEST_DESIGN.md, commit 8d9aa26). Verifies route→permission MAPPING via the
 * Nest Reflector using the EXPORTED `PERMISSIONS_KEY`, controller-surface completeness, and
 * representative parameter forwarding. Does NOT prove runtime guard execution, JWT, role resolution,
 * or 403s. Taxes uses four DISTINCT `tax:*` permissions (view/create/change/delete).
 */
import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import { TaxesController } from './taxes.controller';
import type { TaxesService } from './taxes.service';

describe('TaxesController permission metadata (C9)', () => {
  const reflector = new Reflector();

  const ROUTES: Array<{ handler: keyof TaxesController; permission: string }> = [
    { handler: 'findAll', permission: 'tax:view' },
    { handler: 'create', permission: 'tax:create' },
    { handler: 'update', permission: 'tax:change' },
    { handler: 'remove', permission: 'tax:delete' },
  ];

  it.each(ROUTES)('$handler requires [$permission]', ({ handler, permission }) => {
    const fn = TaxesController.prototype[handler] as unknown as (...args: unknown[]) => unknown;
    const perms = reflector.get<string[]>(PERMISSIONS_KEY, fn);
    expect(perms).toEqual([permission]);
  });

  it('every controller handler carries a permission requirement (none is unprotected)', () => {
    const handlers = Object.getOwnPropertyNames(TaxesController.prototype).filter((n) => n !== 'constructor');
    expect(handlers.sort()).toEqual(ROUTES.map((r) => r.handler).sort());
    for (const name of handlers) {
      const fn = (TaxesController.prototype as unknown as Record<string, unknown>)[name] as (...a: unknown[]) => unknown;
      const perms = reflector.get<string[]>(PERMISSIONS_KEY, fn);
      expect(Array.isArray(perms) && perms.length > 0).toBe(true);
    }
  });
});

describe('TaxesController delegation / parameter forwarding (C9)', () => {
  it('findAll delegates to the service', () => {
    const findAll = jest.fn();
    const controller = new TaxesController({ findAll } as unknown as TaxesService);
    controller.findAll();
    expect(findAll).toHaveBeenCalledWith();
  });

  it('create forwards the dto', () => {
    const create = jest.fn();
    const controller = new TaxesController({ create } as unknown as TaxesService);
    const dto = { name: 'GCT', rateBasisPoints: 1500 };
    controller.create(dto as never);
    expect(create).toHaveBeenCalledWith(dto);
  });

  it('update forwards (id, dto)', () => {
    const update = jest.fn();
    const controller = new TaxesController({ update } as unknown as TaxesService);
    const dto = { rateBasisPoints: 200 };
    controller.update('tax-9', dto as never);
    expect(update).toHaveBeenCalledWith('tax-9', dto);
  });

  it('remove forwards the id param', () => {
    const remove = jest.fn();
    const controller = new TaxesController({ remove } as unknown as TaxesService);
    controller.remove('tax-3');
    expect(remove).toHaveBeenCalledWith('tax-3');
  });
});
