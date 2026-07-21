/**
 * Program 3 · C6 — Request Tracking controller permission-metadata + delegation contract.
 *
 * Verifies route->permission MAPPING (design §6) via the Nest Reflector using the EXPORTED
 * `PERMISSIONS_KEY`, plus representative parameter-forwarding contracts. Does NOT prove runtime guard
 * execution, JWT, role resolution, or 403s. req-tracking uses the `requisition:*` permission namespace.
 */
import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { ReqTrackingController } from './req-tracking.controller';
import type { ReqTrackingService } from './req-tracking.service';

describe('ReqTrackingController permission metadata (C6)', () => {
  const reflector = new Reflector();

  const ROUTES: Array<{ handler: keyof ReqTrackingController; permission: string }> = [
    { handler: 'list', permission: 'requisition:view' },
    { handler: 'stats', permission: 'requisition:view' },
    { handler: 'scan', permission: 'requisition:view' },
    { handler: 'get', permission: 'requisition:view' },
    { handler: 'receiveForm', permission: 'requisition:change' },
    { handler: 'receiveBench', permission: 'requisition:change' },
    { handler: 'verify', permission: 'requisition:change' },
    { handler: 'file', permission: 'requisition:change' },
    { handler: 'reject', permission: 'requisition:change' },
  ];

  it.each(ROUTES)('$handler requires [$permission]', ({ handler, permission }) => {
    const fn = ReqTrackingController.prototype[handler] as unknown as (...args: unknown[]) => unknown;
    const perms = reflector.get<string[]>(PERMISSIONS_KEY, fn);
    expect(perms).toEqual([permission]);
  });

  it('every controller handler carries a permission requirement (none is unprotected)', () => {
    const handlers = Object.getOwnPropertyNames(ReqTrackingController.prototype).filter((n) => n !== 'constructor');
    expect(handlers.sort()).toEqual(ROUTES.map((r) => r.handler).sort());
    for (const name of handlers) {
      const fn = (ReqTrackingController.prototype as unknown as Record<string, unknown>)[name] as (...a: unknown[]) => unknown;
      const perms = reflector.get<string[]>(PERMISSIONS_KEY, fn);
      expect(Array.isArray(perms) && perms.length > 0).toBe(true);
    }
  });
});

describe('ReqTrackingController delegation / parameter forwarding (C6)', () => {
  const user = { userId: 'user-1', labId: 'lab-1' } as AuthUser;

  it('receiveForm forwards (id, user.userId, dto)', () => {
    const receiveForm = jest.fn();
    const controller = new ReqTrackingController({ receiveForm } as unknown as ReqTrackingService);
    const dto = { formConditionNotes: 'ok' };
    controller.receiveForm(user, 'req-9', dto as never);
    expect(receiveForm).toHaveBeenCalledWith('req-9', 'user-1', dto);
  });

  it('verify forwards (id, user.userId, dto)', () => {
    const verify = jest.fn();
    const controller = new ReqTrackingController({ verify } as unknown as ReqTrackingService);
    const dto = { verificationNotes: 'ok' };
    controller.verify(user, 'req-9', dto as never);
    expect(verify).toHaveBeenCalledWith('req-9', 'user-1', dto);
  });

  it('scan forwards dto.barcodeValue', () => {
    const scan = jest.fn();
    const controller = new ReqTrackingController({ scan } as unknown as ReqTrackingService);
    controller.scan({ barcodeValue: 'BC-77' } as never);
    expect(scan).toHaveBeenCalledWith('BC-77');
  });

  it('get forwards the requisitionId param', () => {
    const getByRequisition = jest.fn();
    const controller = new ReqTrackingController({ getByRequisition } as unknown as ReqTrackingService);
    controller.get('req-5');
    expect(getByRequisition).toHaveBeenCalledWith('req-5');
  });
});
