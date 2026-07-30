import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import { ValidationController } from './validation.controller';
import { buildRoleDefs, SPECIAL_OBJECTS } from '../../../prisma/seed';

/**
 * Program 6 · Phase 6F — the authorization boundary for validation. Exercises the REAL PermissionsGuard against the
 * REAL controller metadata and proves the no-default-grant invariant. `run` (create a validation run) is DISTINCT
 * from `view`; there is no evidence-mutation route (runs are immutable) and no lifecycle-promotion route.
 */
const guard = new PermissionsGuard(new Reflector());
const H = ValidationController.prototype as any;
function ctx(handler: unknown, user: unknown): ExecutionContext {
  return { getHandler: () => handler, getClass: () => ValidationController, switchToHttp: () => ({ getRequest: () => ({ user }) }) } as unknown as ExecutionContext;
}
const allow = (h: unknown, perms: string[]) => guard.canActivate(ctx(h, { permissions: perms }));
const deny = (h: unknown, perms: string[]) => expect(() => guard.canActivate(ctx(h, { permissions: perms }))).toThrow(ForbiddenException);

describe('P6-6F ValidationController authorization', () => {
  it('read routes require validation:view', () => {
    for (const h of [H.listRuns, H.getRun]) {
      expect(allow(h, ['validation:view'])).toBe(true);
      deny(h, []); deny(h, ['validation:run']); deny(h, ['validation:manage']);
    }
  });

  it('run requires validation:run (not view, not manage)', () => {
    expect(allow(H.runValidation, ['validation:run'])).toBe(true);
    deny(H.runValidation, []); deny(H.runValidation, ['validation:view']); deny(H.runValidation, ['validation:manage']);
    deny(H.runValidation, ['validation:view', 'validation:manage']); // still no run → denied
  });

  it('declares exactly the intended permission on each handler', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, H.runValidation)).toEqual(['validation:run']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, H.listRuns)).toEqual(['validation:view']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, H.getRun)).toEqual(['validation:view']);
  });

  it('has no evidence-mutation or lifecycle-promotion route (runs immutable; no support lifecycle promotion)', () => {
    const routes = Object.getOwnPropertyNames(H).filter((n) => n !== 'constructor');
    expect(routes.some((n) => /update|edit|delete|patch|promote|approve|certify|overwrite/i.test(n))).toBe(false);
  });

  it('catalogs validation:view/run/manage and grants NONE of them to any default role', () => {
    expect(SPECIAL_OBJECTS.validation).toEqual(['view', 'run', 'manage']);
    const catalog = [
      { id: 'p-vv', code: 'validation:view' }, { id: 'p-vr', code: 'validation:run' }, { id: 'p-vm', code: 'validation:manage' }, { id: 'p-x', code: 'record:view' },
    ];
    const forbidden = new Set(['p-vv', 'p-vr', 'p-vm']);
    for (const role of buildRoleDefs(catalog)) {
      if (role.isSuperRole) continue;
      expect(role.perms.filter((p) => forbidden.has(p.id))).toEqual([]);
    }
  });
});
