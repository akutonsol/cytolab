import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../../../common/decorators/require-permissions.decorator';
import { IngestionMonitoringController } from './ingestion-monitoring.controller';
import { SPECIAL_OBJECTS } from '../../../../prisma/seed';

/**
 * Program 5B · B5-a — the authorization boundary for the read-only monitoring surface. Real PermissionsGuard ×
 * real controller metadata: monitoring requires exactly `wsi:reconcile` (the existing reconciliation authority;
 * NO new permission, NO system:ingestion), and ordinary WSI/record permissions never substitute for it.
 */
function contextFor(user: unknown): ExecutionContext {
  const fn = (IngestionMonitoringController.prototype as any).overview;
  return {
    getHandler: () => fn,
    getClass: () => IngestionMonitoringController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}
const guard = new PermissionsGuard(new Reflector());
const run = (user: unknown) => () => guard.canActivate(contextFor(user));

describe('IngestionMonitoringController authorization (real PermissionsGuard + real metadata)', () => {
  it('ALLOWS a principal holding wsi:reconcile', () => {
    expect(guard.canActivate(contextFor({ permissions: ['wsi:reconcile'] }))).toBe(true);
  });
  it('DENIES an empty permission set (genuine 403)', () => {
    expect(run({ permissions: [] })).toThrow(ForbiddenException);
  });
  it('DENIES record:view / record:change (ordinary record perms do not substitute)', () => {
    expect(run({ permissions: ['record:view', 'record:change'] })).toThrow(ForbiddenException);
  });
  it('DENIES wsi:view / wsi:review / wsi:publish (delivery/review/publish are not monitoring)', () => {
    expect(run({ permissions: ['wsi:view', 'wsi:review', 'wsi:publish'] })).toThrow(ForbiddenException);
  });
  it('DENIES system:ingestion (not introduced; not the monitoring authority)', () => {
    expect(run({ permissions: ['system:ingestion'] })).toThrow(ForbiddenException);
  });
  it('ALLOWS a super-role via the guard bypass', () => {
    expect(guard.canActivate(contextFor({ isSuperRole: true, permissions: [] }))).toBe(true);
  });
  it('requires EXACTLY [wsi:reconcile]', () => {
    const meta = Reflect.getMetadata(PERMISSIONS_KEY, (IngestionMonitoringController.prototype as any).overview);
    expect(meta).toEqual(['wsi:reconcile']);
  });
  it('does NOT gate monitoring on system:ingestion (that authority — introduced in P5C-C3 — is for endpoint admin/import, not read-only monitoring)', () => {
    const meta = Reflect.getMetadata(PERMISSIONS_KEY, (IngestionMonitoringController.prototype as any).overview);
    expect(meta).not.toContain('system:ingestion');
    expect(meta).toEqual(['wsi:reconcile']);
  });
});
