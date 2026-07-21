/**
 * Program 3 · C1 — Billing controller permission-metadata contract.
 *
 * Verifies the route→permission MAPPING only (design §2): each handler carries the expected
 * @RequirePermissions metadata, read through the Nest Reflector using the EXPORTED `PERMISSIONS_KEY`
 * — the same key the real guard reads — never a duplicated string literal.
 *
 * This does NOT prove runtime guard execution, JWT behavior, role resolution, permission lookup, or
 * 403 responses (design §2). Those belong to a controller/guard integration checkpoint, not C1.
 */
import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { BillStatus } from '@prisma/client';
import { PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import type { BillQueryDto } from './dto/bill.dto';
import { BillingController } from './billing.controller';
import type { BillingService } from './billing.service';

describe('BillingController permission metadata (C1)', () => {
  const reflector = new Reflector();

  // The complete, independently-enumerated route surface (design §2): nine handlers, all permissioned.
  const ROUTES: Array<{ handler: keyof BillingController; permission: string }> = [
    { handler: 'create', permission: 'bill:create' },
    { handler: 'findBilled', permission: 'bill:view' },
    { handler: 'findUnpaid', permission: 'bill:view' },
    { handler: 'findPaid', permission: 'bill:view' },
    { handler: 'summary', permission: 'bill:view' },
    { handler: 'findAll', permission: 'bill:view' },
    { handler: 'findOne', permission: 'bill:view' },
    { handler: 'issue', permission: 'bill:change' },
    { handler: 'markViewed', permission: 'bill:change' },
  ];

  it.each(ROUTES)('$handler requires [$permission]', ({ handler, permission }) => {
    const fn = BillingController.prototype[handler] as unknown as (...args: unknown[]) => unknown;
    const perms = reflector.get<string[]>(PERMISSIONS_KEY, fn);
    expect(perms).toEqual([permission]);
  });

  it('every controller handler carries a permission requirement (none is unprotected)', () => {
    const handlers = Object.getOwnPropertyNames(BillingController.prototype).filter(
      (name) => name !== 'constructor',
    );
    // The controller exposes exactly the nine enumerated routes.
    expect(handlers.sort()).toEqual(ROUTES.map((r) => r.handler).sort());
    for (const name of handlers) {
      const fn = (BillingController.prototype as unknown as Record<string, unknown>)[name] as (
        ...a: unknown[]
      ) => unknown;
      const perms = reflector.get<string[]>(PERMISSIONS_KEY, fn);
      expect(Array.isArray(perms) && perms.length > 0).toBe(true);
    }
  });
});

/**
 * Route status-filter mapping (design §2 / C1 required completion).
 *
 * The three filtered list routes invoke the same BillingService.findAll(query, statusFilter) branch,
 * but each supplies a DISTINCT domain status set — a separate route contract. A stubbed service captures
 * the exact array each route delegates, so an accidental controller change (e.g. /billed returning paid
 * bills) is caught even though every service-level test would stay green. Expected arrays are the actual
 * current controller contract; no production code is modified and no constants are relocated.
 */
describe('BillingController route status-filter mappings (C1)', () => {
  const query = {} as BillQueryDto;

  const CASES: Array<{ route: 'findBilled' | 'findUnpaid' | 'findPaid'; expected: BillStatus[] }> = [
    { route: 'findBilled', expected: [BillStatus.Issued, BillStatus.PartiallyPaid, BillStatus.Paid] },
    { route: 'findUnpaid', expected: [BillStatus.Issued, BillStatus.PartiallyPaid] },
    { route: 'findPaid', expected: [BillStatus.Paid] },
  ];

  it.each(CASES)('$route delegates findAll with $expected', ({ route, expected }) => {
    const findAll = jest.fn();
    const controller = new BillingController({ findAll } as unknown as BillingService);
    controller[route](query);
    expect(findAll).toHaveBeenCalledTimes(1);
    expect(findAll).toHaveBeenCalledWith(query, expected);
  });
});
