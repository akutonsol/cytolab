import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import { ExplainabilityController } from './explainability.controller';
import { buildRoleDefs, SPECIAL_OBJECTS } from '../../../prisma/seed';

/**
 * Program 6 · Phase 6D — the authorization boundary for explainability. Exercises the REAL PermissionsGuard against
 * the REAL controller metadata, and proves the no-default-grant invariant via the seed's own role construction.
 * `generate` (manual trigger) is DISTINCT from `view`; `manage` is a separate administrative authority and is NOT a
 * write path to any handler here (artifacts are immutable — there is no mutation route).
 */
const guard = new PermissionsGuard(new Reflector());
const H = ExplainabilityController.prototype as any;
function ctx(handler: unknown, user: unknown): ExecutionContext {
  return { getHandler: () => handler, getClass: () => ExplainabilityController, switchToHttp: () => ({ getRequest: () => ({ user }) }) } as unknown as ExecutionContext;
}
const allow = (h: unknown, perms: string[]) => guard.canActivate(ctx(h, { permissions: perms }));
const deny = (h: unknown, perms: string[]) => expect(() => guard.canActivate(ctx(h, { permissions: perms }))).toThrow(ForbiddenException);

describe('P6-6D ExplainabilityController authorization', () => {
  it('read routes require explainability:view', () => {
    for (const h of [H.listGenerations, H.getGeneration]) {
      expect(allow(h, ['explainability:view'])).toBe(true);
      deny(h, []); deny(h, ['explainability:generate']); deny(h, ['explainability:manage']);
    }
  });

  it('generate requires explainability:generate (not view, not manage)', () => {
    expect(allow(H.generate, ['explainability:generate'])).toBe(true);
    deny(H.generate, []); deny(H.generate, ['explainability:view']); deny(H.generate, ['explainability:manage']);
    deny(H.generate, ['explainability:view', 'explainability:manage']); // still no generate → denied
  });

  it('declares exactly the intended permission on each handler', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, H.generate)).toEqual(['explainability:generate']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, H.listGenerations)).toEqual(['explainability:view']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, H.getGeneration)).toEqual(['explainability:view']);
  });

  it('there is NO artifact-mutation route (artifacts are immutable)', () => {
    const routes = Object.getOwnPropertyNames(H).filter((n) => n !== 'constructor');
    expect(routes.some((n) => /update|edit|delete|patch|overwrite|regenerateInPlace/i.test(n))).toBe(false);
  });

  it('catalogs explainability:view/generate/manage and grants NONE of them to any default role', () => {
    expect(SPECIAL_OBJECTS.explainability).toEqual(['view', 'generate', 'manage']);
    const catalog = [
      { id: 'p-ev', code: 'explainability:view' },
      { id: 'p-eg', code: 'explainability:generate' },
      { id: 'p-em', code: 'explainability:manage' },
      { id: 'p-rv', code: 'record:view' },
    ];
    const forbidden = new Set(['p-ev', 'p-eg', 'p-em']);
    for (const role of buildRoleDefs(catalog)) {
      if (role.isSuperRole) continue; // super roles reach it via the isSuperRole bypass, not an explicit grant
      expect(role.perms.filter((p) => forbidden.has(p.id))).toEqual([]);
    }
  });
});
