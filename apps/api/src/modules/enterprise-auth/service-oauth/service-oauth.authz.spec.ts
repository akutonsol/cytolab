import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../../../common/decorators/require-permissions.decorator';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { ServiceOAuthController } from './service-oauth.controller';

/**
 * Program 7 · Phase 7A.2b — the authorization boundary for the Service-Principal OAuth routes. The token endpoint is
 * `@Public` (it IS the machine authentication); credential/scope administration is staff-gated `identity:manage` /
 * `identity:view` (reusing the existing catalogue — no new permission object); there is no clinical/AI/diagnostic route.
 */
const guard = new PermissionsGuard(new Reflector());
const H = ServiceOAuthController.prototype as any;
const ctx = (h: unknown, user: unknown): ExecutionContext => ({ getHandler: () => h, getClass: () => ServiceOAuthController, switchToHttp: () => ({ getRequest: () => ({ user }) }) } as any);
const deny = (h: unknown, perms: string[]) => expect(() => guard.canActivate(ctx(h, { permissions: perms }))).toThrow(ForbiddenException);

describe('P7-7A.2b ServiceOAuthController authorization', () => {
  it('the token endpoint is @Public (machine authentication happens here)', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, H.token)).toBe(true);
  });

  it('credential + scope mutation require identity:manage; scope read requires identity:view', () => {
    for (const h of [H.issueCredential, H.revokeCredential, H.assignScope, H.revokeScope]) {
      expect(Reflect.getMetadata(PERMISSIONS_KEY, h)).toEqual(['identity:manage']);
      expect(guard.canActivate(ctx(h, { permissions: ['identity:manage'] }))).toBe(true);
      deny(h, []); deny(h, ['identity:view']);
    }
    expect(Reflect.getMetadata(PERMISSIONS_KEY, H.listScopes)).toEqual(['identity:view']);
    expect(guard.canActivate(ctx(H.listScopes, { permissions: ['identity:view'] }))).toBe(true);
  });

  it('has no clinical/AI/diagnostic/lifecycle route', () => {
    const routes = Object.getOwnPropertyNames(H).filter((n) => n !== 'constructor');
    expect(routes.some((n) => /diagnos|signout|resultsheet|record|aimodel|inference|clinical|promote/i.test(n))).toBe(false);
  });
});
