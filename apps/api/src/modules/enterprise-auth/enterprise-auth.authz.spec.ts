import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import { EnterpriseAuthController } from './enterprise-auth.controller';
import { buildRoleDefs, SPECIAL_OBJECTS } from '../../../prisma/seed';

/**
 * Program 7 · Phase 7A.1 — the authorization boundary for enterprise-auth administration. Exercises the REAL
 * PermissionsGuard against the REAL controller metadata and proves: `view` (read) is distinct from `manage` (mutate
 * config / service principals); `identity:*` is granted to NO default role; and there is NO clinical/lifecycle/
 * diagnostic/AI route (no permission grants clinical or AI authority — ET5).
 */
const guard = new PermissionsGuard(new Reflector());
const H = EnterpriseAuthController.prototype as any;
function ctx(handler: unknown, user: unknown): ExecutionContext {
  return { getHandler: () => handler, getClass: () => EnterpriseAuthController, switchToHttp: () => ({ getRequest: () => ({ user }) }) } as unknown as ExecutionContext;
}
const allow = (h: unknown, perms: string[]) => guard.canActivate(ctx(h, { permissions: perms }));
const deny = (h: unknown, perms: string[]) => expect(() => guard.canActivate(ctx(h, { permissions: perms }))).toThrow(ForbiddenException);

describe('P7-7A.1 EnterpriseAuthController authorization', () => {
  it('read routes require identity:view', () => {
    for (const h of [H.listProviders, H.listServicePrincipals]) {
      expect(allow(h, ['identity:view'])).toBe(true);
      deny(h, []); deny(h, ['identity:manage']);
    }
  });

  it('mutating routes require identity:manage (not view)', () => {
    for (const h of [H.registerProvider, H.createServicePrincipal, H.deactivateServicePrincipal]) {
      expect(allow(h, ['identity:manage'])).toBe(true);
      deny(h, []); deny(h, ['identity:view']);
    }
  });

  it('declares exactly the intended permission on each handler', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, H.listProviders)).toEqual(['identity:view']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, H.listServicePrincipals)).toEqual(['identity:view']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, H.registerProvider)).toEqual(['identity:manage']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, H.createServicePrincipal)).toEqual(['identity:manage']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, H.deactivateServicePrincipal)).toEqual(['identity:manage']);
  });

  it('has no clinical, AI, lifecycle, or diagnostic route', () => {
    const routes = Object.getOwnPropertyNames(H).filter((n) => n !== 'constructor');
    expect(routes.some((n) => /diagnos|signout|sign_out|authorize|promote|retire|resultsheet|record|aimodel|inference|clinical/i.test(n))).toBe(false);
  });

  it('catalogs identity:view/manage and grants NEITHER to any default role (no default grant)', () => {
    expect(SPECIAL_OBJECTS.identity).toEqual(['view', 'manage']);
    const catalog = [
      { id: 'p-iv', code: 'identity:view' }, { id: 'p-im', code: 'identity:manage' }, { id: 'p-x', code: 'record:view' },
    ];
    const forbidden = new Set(['p-iv', 'p-im']);
    for (const role of buildRoleDefs(catalog)) {
      if (role.isSuperRole) continue;
      expect(role.perms.filter((p) => forbidden.has(p.id))).toEqual([]);
    }
  });
});
