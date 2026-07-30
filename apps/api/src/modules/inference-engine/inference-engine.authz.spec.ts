import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import { InferenceEngineController } from './inference-engine.controller';
import { buildRoleDefs, SPECIAL_OBJECTS } from '../../../prisma/seed';

/**
 * Program 6 · Phase 6C — the authorization boundary for the inference engine. Exercises the REAL PermissionsGuard
 * against the REAL controller metadata, and proves the no-default-grant invariant via the seed's own role
 * construction. `run` (dispatch — the manual trigger) is DISTINCT from `view` and from `manage` (drain/reclaim).
 */
const guard = new PermissionsGuard(new Reflector());
const H = InferenceEngineController.prototype as any;
function ctx(handler: unknown, user: unknown): ExecutionContext {
  return { getHandler: () => handler, getClass: () => InferenceEngineController, switchToHttp: () => ({ getRequest: () => ({ user }) }) } as unknown as ExecutionContext;
}
const allow = (h: unknown, perms: string[]) => guard.canActivate(ctx(h, { permissions: perms }));
const deny = (h: unknown, perms: string[]) => expect(() => guard.canActivate(ctx(h, { permissions: perms }))).toThrow(ForbiddenException);

describe('P6-6C InferenceEngineController authorization', () => {
  it('read routes require inference:view', () => {
    for (const h of [H.listJobs, H.getJob]) {
      expect(allow(h, ['inference:view'])).toBe(true);
      deny(h, []); deny(h, ['inference:run']); deny(h, ['inference:manage']);
    }
  });

  it('dispatch requires inference:run (not view, not manage)', () => {
    expect(allow(H.dispatch, ['inference:run'])).toBe(true);
    deny(H.dispatch, []); deny(H.dispatch, ['inference:view']); deny(H.dispatch, ['inference:manage']);
    deny(H.dispatch, ['inference:view', 'inference:manage']); // still no run → denied
  });

  it('administrative drain/reclaim require inference:manage', () => {
    for (const h of [H.drain, H.reclaim]) {
      expect(allow(h, ['inference:manage'])).toBe(true);
      deny(h, []); deny(h, ['inference:view']); deny(h, ['inference:run']);
    }
  });

  it('declares exactly the intended permission on each handler', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, H.dispatch)).toEqual(['inference:run']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, H.listJobs)).toEqual(['inference:view']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, H.drain)).toEqual(['inference:manage']);
  });

  it('catalogs inference:view/run/manage and grants NONE of them to any default role', () => {
    expect(SPECIAL_OBJECTS.inference).toEqual(['view', 'run', 'manage']);
    const catalog = [
      { id: 'p-iv', code: 'inference:view' },
      { id: 'p-ir', code: 'inference:run' },
      { id: 'p-im', code: 'inference:manage' },
      { id: 'p-rv', code: 'record:view' },
    ];
    const forbidden = new Set(['p-iv', 'p-ir', 'p-im']);
    for (const role of buildRoleDefs(catalog)) {
      if (role.isSuperRole) continue; // super roles reach it via the isSuperRole bypass, not an explicit grant
      expect(role.perms.filter((p) => forbidden.has(p.id))).toEqual([]);
    }
  });
});
