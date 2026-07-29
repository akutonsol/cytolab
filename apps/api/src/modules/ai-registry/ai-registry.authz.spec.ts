import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import { AiRegistryController } from './ai-registry.controller';
import { buildRoleDefs, SPECIAL_OBJECTS } from '../../../prisma/seed';

/**
 * Program 6 · Phase 6A — the authorization boundary for the AI registry. Exercises the REAL PermissionsGuard
 * against the REAL controller metadata, and proves the no-default-grant invariant through the seed's own role
 * construction (`buildRoleDefs`). Crucially, `promote` (lifecycle transition, incl. → APPROVED) is DISTINCT
 * from `manage` — holding `manage` alone must not permit a transition.
 */
const guard = new PermissionsGuard(new Reflector());
const H = AiRegistryController.prototype as any;
function ctx(handler: unknown, user: unknown): ExecutionContext {
  return { getHandler: () => handler, getClass: () => AiRegistryController, switchToHttp: () => ({ getRequest: () => ({ user }) }) } as unknown as ExecutionContext;
}
const allow = (h: unknown, perms: string[]) => guard.canActivate(ctx(h, { permissions: perms }));
const deny = (h: unknown, perms: string[]) => expect(() => guard.canActivate(ctx(h, { permissions: perms }))).toThrow(ForbiddenException);

describe('P6-6A AiRegistryController authorization', () => {
  it('read routes require aimodel:view', () => {
    for (const h of [H.listModels, H.getModel, H.getVersion]) {
      expect(allow(h, ['aimodel:view'])).toBe(true);
      deny(h, []); deny(h, ['aimodel:manage']); deny(h, ['aimodel:promote']);
    }
  });

  it('write routes require aimodel:manage (not view, not promote)', () => {
    for (const h of [H.createModel, H.updateModel, H.createVersion]) {
      expect(allow(h, ['aimodel:manage'])).toBe(true);
      deny(h, []); deny(h, ['aimodel:view']); deny(h, ['aimodel:promote']);
    }
  });

  it('lifecycle transition requires aimodel:promote — manage alone is DENIED', () => {
    expect(allow(H.transition, ['aimodel:promote'])).toBe(true);
    deny(H.transition, []); deny(H.transition, ['aimodel:manage']); deny(H.transition, ['aimodel:view']);
    deny(H.transition, ['aimodel:view', 'aimodel:manage']); // still no promote → denied
  });

  it('declares exactly the intended permission on each handler', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, H.transition)).toEqual(['aimodel:promote']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, H.createModel)).toEqual(['aimodel:manage']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, H.listModels)).toEqual(['aimodel:view']);
  });

  it('catalogs aimodel:view/manage/promote and grants NONE of them to any default role', () => {
    expect(SPECIAL_OBJECTS.aimodel).toEqual(['view', 'manage', 'promote']);
    const catalog = [
      { id: 'p-av', code: 'aimodel:view' },
      { id: 'p-am', code: 'aimodel:manage' },
      { id: 'p-ap', code: 'aimodel:promote' },
      { id: 'p-rv', code: 'record:view' },
    ];
    const forbidden = new Set(['p-av', 'p-am', 'p-ap']);
    for (const role of buildRoleDefs(catalog)) {
      if (role.isSuperRole) continue; // super roles reach it via the isSuperRole bypass, not an explicit grant
      expect(role.perms.filter((p) => forbidden.has(p.id))).toEqual([]);
    }
  });
});
