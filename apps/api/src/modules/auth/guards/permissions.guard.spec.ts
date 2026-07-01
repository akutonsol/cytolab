import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';

/**
 * The permission bypass must key off the `isSuperRole` flag on the principal —
 * NOT a hardcoded 'Superuser' role name. So a role named anything (e.g. a
 * lab-defined "P. McCarthy") with isSuperRole=true bypasses, and an ordinary
 * role does not.
 */
describe('PermissionsGuard — super-role bypass', () => {
  const makeContext = (user: any, required?: string[]) =>
    ({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as any;

  function guardRequiring(required?: string[]) {
    const reflector = { getAllAndOverride: () => required } as unknown as Reflector;
    return new PermissionsGuard(reflector);
  }

  it('bypasses for a NON-"Superuser"-named role flagged isSuperRole=true', () => {
    const guard = guardRequiring(['patient:view']);
    const user = { roles: ['P. McCarthy'], permissions: [], isSuperRole: true };
    expect(guard.canActivate(makeContext(user))).toBe(true);
  });

  it('still bypasses the canonical Superuser (now via the flag)', () => {
    const guard = guardRequiring(['resultsheet:authorize']);
    const user = { roles: ['Superuser'], permissions: [], isSuperRole: true };
    expect(guard.canActivate(makeContext(user))).toBe(true);
  });

  it('does NOT bypass a normal role lacking the permission', () => {
    const guard = guardRequiring(['patient:view']);
    const user = { roles: ['Receptionist'], permissions: ['client:view'], isSuperRole: false };
    expect(() => guard.canActivate(makeContext(user))).toThrow(ForbiddenException);
  });

  it('a normal role WITH the permission passes (no bypass needed)', () => {
    const guard = guardRequiring(['patient:view']);
    const user = { roles: ['Receptionist'], permissions: ['patient:view'], isSuperRole: false };
    expect(guard.canActivate(makeContext(user))).toBe(true);
  });

  it('the old hardcoded name alone (no flag) no longer bypasses', () => {
    // Proves the bypass is flag-based, not name-based.
    const guard = guardRequiring(['patient:view']);
    const user = { roles: ['Superuser'], permissions: [] }; // isSuperRole undefined
    expect(() => guard.canActivate(makeContext(user))).toThrow(ForbiddenException);
  });

  it('open routes (no required permissions) always pass', () => {
    const guard = guardRequiring(undefined);
    expect(guard.canActivate(makeContext({ isSuperRole: false }))).toBe(true);
  });
});
