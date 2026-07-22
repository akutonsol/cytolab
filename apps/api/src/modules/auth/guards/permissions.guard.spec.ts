import { ForbiddenException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermissions, PERMISSIONS_KEY } from '../../../common/decorators/require-permissions.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { AuthorizationContract, AUTHZ_CONTRACT_KEY } from '../../../common/decorators/authorization-contract.decorator';
import { IS_PORTAL_KEY } from '../../portal/common/portal-principal';

/**
 * R-001b — fail-closed PermissionsGuard, exercised through the REAL guard + a REAL
 * Reflector reading REAL decorator metadata on representative controller methods.
 * A handler with no recognized authorization contract must be DENIED.
 */

const Portal = () => SetMetadata(IS_PORTAL_KEY, true);

class Fixtures {
  @RequirePermissions('a:view') perm() {}
  @RequirePermissions('a:view', 'b:edit') twoPerms() {}
  @Public() pub() {}
  @Portal() portal() {}
  @AuthorizationContract('authenticated') authed() {}
  @RequirePermissions() emptyPerm() {} // SetMetadata(PERMISSIONS_KEY, [])
  @SetMetadata(PERMISSIONS_KEY, [123]) nonStringPerm() {}
  @SetMetadata(AUTHZ_CONTRACT_KEY, 'bogus') unknownContract() {}
  noContract() {} // e.g. a FeatureGuard-only route with no recognized authz contract
}

@RequirePermissions('cls:view')
class ClassPermFixture {
  inherits() {}
  @RequirePermissions('own:view') overrides() {}
}

@AuthorizationContract('authenticated')
class ClassAuthedFixture {
  inheritsAuthed() {}
}

describe('PermissionsGuard (fail-closed) — R-001b', () => {
  const reflector = new Reflector();
  const guard = new PermissionsGuard(reflector);

  const ctx = (handler: any, cls: any, user: any) =>
    ({
      getHandler: () => handler,
      getClass: () => cls,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as any;
  const F = (m: keyof Fixtures) => ctx((Fixtures.prototype as any)[m], Fixtures, undefined);
  const Fu = (m: keyof Fixtures, user: any) => ctx((Fixtures.prototype as any)[m], Fixtures, user);

  const staff = (perms: string[] = []) => ({ permissions: perms, isSuperRole: false });

  it('1. explicit permission allows a holder', () => {
    expect(guard.canActivate(Fu('perm', staff(['a:view'])))).toBe(true);
  });
  it('2. explicit permission denies a non-holder', () => {
    expect(() => guard.canActivate(Fu('perm', staff([])))).toThrow(ForbiddenException);
  });
  it('3. missing authorization contract denies (no fail-open-by-omission)', () => {
    expect(() => guard.canActivate(Fu('noContract', staff([])))).toThrow(ForbiddenException);
  });
  it('4. @Public() is allowed (no principal needed)', () => {
    expect(guard.canActivate(F('pub'))).toBe(true);
  });
  it('5. @Portal() causes the guard to stand down', () => {
    expect(guard.canActivate(F('portal'))).toBe(true);
  });
  it('6. authenticated contract allows an authenticated principal', () => {
    expect(guard.canActivate(Fu('authed', staff([])))).toBe(true);
  });
  it('7. authenticated contract denies when no principal exists', () => {
    expect(() => guard.canActivate(F('authed'))).toThrow(ForbiddenException);
  });
  it('8. class-level permission metadata is inherited by a handler', () => {
    const c = (m: string, user: any) => ctx((ClassPermFixture.prototype as any)[m], ClassPermFixture, user);
    expect(guard.canActivate(c('inherits', staff(['cls:view'])))).toBe(true);
    expect(() => guard.canActivate(c('inherits', staff([])))).toThrow(ForbiddenException);
  });
  it('9. handler-level permission overrides the class (override semantics preserved)', () => {
    const c = (m: string, user: any) => ctx((ClassPermFixture.prototype as any)[m], ClassPermFixture, user);
    expect(guard.canActivate(c('overrides', staff(['own:view'])))).toBe(true);
    // only the overriding permission counts; the class permission is NOT sufficient
    expect(() => guard.canActivate(c('overrides', staff(['cls:view'])))).toThrow(ForbiddenException);
  });
  it('10. empty permission metadata denies', () => {
    expect(() => guard.canActivate(Fu('emptyPerm', staff(['anything'])))).toThrow(ForbiddenException);
  });
  it('11. malformed (non-string) permission metadata denies', () => {
    expect(() => guard.canActivate(Fu('nonStringPerm', staff(['anything'])))).toThrow(ForbiddenException);
  });
  it('12. unknown authorization-contract kind denies', () => {
    expect(() => guard.canActivate(Fu('unknownContract', staff([])))).toThrow(ForbiddenException);
  });
  it('13. super-role bypass remains intentional (flag-based)', () => {
    expect(guard.canActivate(Fu('perm', { permissions: [], isSuperRole: true }))).toBe(true);
    expect(guard.canActivate(Fu('noContract', { permissions: [], isSuperRole: true }))).toBe(true);
  });
  it('14. FeatureGuard-only route (no recognized contract) is denied by this guard', () => {
    // noContract() stands in for a route gated only by FeatureGuard — not recognized as authz.
    expect(() => guard.canActivate(Fu('noContract', staff([])))).toThrow(ForbiddenException);
  });
  it('15. WorkforceManagerGuard route carrying an authenticated contract stays compatible', () => {
    const c = ctx((ClassAuthedFixture.prototype as any).inheritsAuthed, ClassAuthedFixture, staff([]));
    expect(guard.canActivate(c)).toBe(true); // ManagerGuard enforces the manager check separately
  });
  it('16. a portal principal is NOT required to hold staff permissions', () => {
    const portalPrincipal = { kind: 'portal', clientId: 'c1', labId: 'l1' }; // no .permissions
    expect(guard.canActivate(ctx((Fixtures.prototype as any).portal, Fixtures, portalPrincipal))).toBe(true);
  });
  it('17. permission-protected routes enforce EVERY required permission', () => {
    expect(guard.canActivate(Fu('twoPerms', staff(['a:view', 'b:edit'])))).toBe(true);
    expect(() => guard.canActivate(Fu('twoPerms', staff(['a:view'])))).toThrow(ForbiddenException);
  });
  it('18. no principal on a non-public/non-portal route denies', () => {
    expect(() => guard.canActivate(F('perm'))).toThrow(ForbiddenException);
  });
});
