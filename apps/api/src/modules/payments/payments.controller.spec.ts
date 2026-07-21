/**
 * Program 3 · C2 — Payments controller permission-metadata + delegation contract.
 *
 * Verifies the route->permission MAPPING (design §2) via the Nest Reflector using the EXPORTED
 * `PERMISSIONS_KEY` — the same key the real guard reads — and the paymentsForBill delegation contract.
 * Does NOT prove runtime guard execution, JWT, role resolution, or 403s (those are a guard-integration
 * concern, not C2).
 */
import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import type { PaymentQueryDto } from './dto/payment.dto';
import { PaymentsController } from './payments.controller';
import type { PaymentsService } from './payments.service';

describe('PaymentsController permission metadata (C2)', () => {
  const reflector = new Reflector();

  const ROUTES: Array<{ handler: keyof PaymentsController; permission: string }> = [
    { handler: 'create', permission: 'payment:create' },
    { handler: 'summary', permission: 'payment:view' },
    { handler: 'findAll', permission: 'payment:view' },
    { handler: 'paymentsForBill', permission: 'payment:view' },
    { handler: 'verify', permission: 'payment:change' },
  ];

  it.each(ROUTES)('$handler requires [$permission]', ({ handler, permission }) => {
    const fn = PaymentsController.prototype[handler] as unknown as (...args: unknown[]) => unknown;
    const perms = reflector.get<string[]>(PERMISSIONS_KEY, fn);
    expect(perms).toEqual([permission]);
  });

  it('every controller handler carries a permission requirement (none is unprotected)', () => {
    const handlers = Object.getOwnPropertyNames(PaymentsController.prototype).filter(
      (name) => name !== 'constructor',
    );
    expect(handlers.sort()).toEqual(ROUTES.map((r) => r.handler).sort());
    for (const name of handlers) {
      const fn = (PaymentsController.prototype as unknown as Record<string, unknown>)[name] as (
        ...a: unknown[]
      ) => unknown;
      const perms = reflector.get<string[]>(PERMISSIONS_KEY, fn);
      expect(Array.isArray(perms) && perms.length > 0).toBe(true);
    }
  });
});

describe('PaymentsController delegation (C2)', () => {
  it('paymentsForBill delegates to the service with (id, query)', () => {
    const paymentsForBill = jest.fn();
    const controller = new PaymentsController({ paymentsForBill } as unknown as PaymentsService);
    const query = { page: 1 } as PaymentQueryDto;
    controller.paymentsForBill('bill-123', query);
    expect(paymentsForBill).toHaveBeenCalledTimes(1);
    expect(paymentsForBill).toHaveBeenCalledWith('bill-123', query);
  });
});
