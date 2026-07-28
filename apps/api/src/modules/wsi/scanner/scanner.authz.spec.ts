import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../../../common/decorators/require-permissions.decorator';
import { ScannerController } from './scanner.controller';

/** Program 5C · C4 — scanner-adapter admin/run requires system:ingestion; ordinary perms never substitute. */
const HANDLERS = ['createSource', 'scan'] as const;
function ctx(handler: string, user: unknown): ExecutionContext {
  const fn = (ScannerController.prototype as any)[handler];
  return { getHandler: () => fn, getClass: () => ScannerController, switchToHttp: () => ({ getRequest: () => ({ user }) }) } as unknown as ExecutionContext;
}
const guard = new PermissionsGuard(new Reflector());

describe('ScannerController authorization (real guard + real metadata)', () => {
  describe.each(HANDLERS)('handler %s', (h) => {
    it('ALLOWS system:ingestion; DENIES record:change/wsi:view/wsi:reconcile/[]', () => {
      expect(guard.canActivate(ctx(h, { permissions: ['system:ingestion'] }))).toBe(true);
      for (const p of [[], ['record:change'], ['wsi:view'], ['wsi:reconcile']]) {
        expect(() => guard.canActivate(ctx(h, { permissions: p }))).toThrow(ForbiddenException);
      }
    });
    it('requires EXACTLY [system:ingestion]', () => {
      expect(Reflect.getMetadata(PERMISSIONS_KEY, (ScannerController.prototype as any)[h])).toEqual(['system:ingestion']);
    });
  });
});
