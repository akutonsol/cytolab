import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../../../common/decorators/require-permissions.decorator';
import { SourceHealthController } from './source-health.controller';

/** Program 5C · C5 — manual health check requires system:ingestion (not wsi:view/record/reconcile). */
function ctx(user: unknown): ExecutionContext {
  const fn = (SourceHealthController.prototype as any).check;
  return { getHandler: () => fn, getClass: () => SourceHealthController, switchToHttp: () => ({ getRequest: () => ({ user }) }) } as unknown as ExecutionContext;
}
const guard = new PermissionsGuard(new Reflector());

describe('SourceHealthController authorization', () => {
  it('ALLOWS system:ingestion; DENIES wsi:view/wsi:reconcile/record:change/[]', () => {
    expect(guard.canActivate(ctx({ permissions: ['system:ingestion'] }))).toBe(true);
    for (const p of [[], ['wsi:view'], ['wsi:reconcile'], ['record:change']]) {
      expect(() => guard.canActivate(ctx({ permissions: p }))).toThrow(ForbiddenException);
    }
  });
  it('requires EXACTLY [system:ingestion]', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, (SourceHealthController.prototype as any).check)).toEqual(['system:ingestion']);
  });
});
