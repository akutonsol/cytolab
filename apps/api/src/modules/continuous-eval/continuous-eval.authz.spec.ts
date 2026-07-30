import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import { ContinuousEvalController } from './continuous-eval.controller';
import { buildRoleDefs, SPECIAL_OBJECTS } from '../../../prisma/seed';

/**
 * Program 6 · Phase 6G — the authorization boundary for continuous evaluation. Exercises the REAL PermissionsGuard
 * against the REAL controller metadata and proves the no-default-grant invariant. `run` (initiate a window) is
 * DISTINCT from `view`; there is no evidence-mutation route and no lifecycle route (evidence is immutable; no support
 * lifecycle mutation).
 */
const guard = new PermissionsGuard(new Reflector());
const H = ContinuousEvalController.prototype as any;
function ctx(handler: unknown, user: unknown): ExecutionContext {
  return { getHandler: () => handler, getClass: () => ContinuousEvalController, switchToHttp: () => ({ getRequest: () => ({ user }) }) } as unknown as ExecutionContext;
}
const allow = (h: unknown, perms: string[]) => guard.canActivate(ctx(h, { permissions: perms }));
const deny = (h: unknown, perms: string[]) => expect(() => guard.canActivate(ctx(h, { permissions: perms }))).toThrow(ForbiddenException);

describe('P6-6G ContinuousEvalController authorization', () => {
  it('read routes require evaluation:view', () => {
    for (const h of [H.listWindows, H.getWindow]) {
      expect(allow(h, ['evaluation:view'])).toBe(true);
      deny(h, []); deny(h, ['evaluation:run']); deny(h, ['evaluation:manage']);
    }
  });

  it('run requires evaluation:run (not view, not manage)', () => {
    expect(allow(H.runEvaluation, ['evaluation:run'])).toBe(true);
    deny(H.runEvaluation, []); deny(H.runEvaluation, ['evaluation:view']); deny(H.runEvaluation, ['evaluation:manage']);
    deny(H.runEvaluation, ['evaluation:view', 'evaluation:manage']);
  });

  it('declares exactly the intended permission on each handler', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, H.runEvaluation)).toEqual(['evaluation:run']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, H.listWindows)).toEqual(['evaluation:view']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, H.getWindow)).toEqual(['evaluation:view']);
  });

  it('has no evidence-mutation or lifecycle route (immutable evidence; no support lifecycle mutation)', () => {
    const routes = Object.getOwnPropertyNames(H).filter((n) => n !== 'constructor');
    expect(routes.some((n) => /update|edit|delete|patch|retire|deprecate|promote|retrain|disable|overwrite/i.test(n))).toBe(false);
  });

  it('catalogs evaluation:view/run/manage and grants NONE of them to any default role', () => {
    expect(SPECIAL_OBJECTS.evaluation).toEqual(['view', 'run', 'manage']);
    const catalog = [
      { id: 'p-ev', code: 'evaluation:view' }, { id: 'p-er', code: 'evaluation:run' }, { id: 'p-em', code: 'evaluation:manage' }, { id: 'p-x', code: 'record:view' },
    ];
    const forbidden = new Set(['p-ev', 'p-er', 'p-em']);
    for (const role of buildRoleDefs(catalog)) {
      if (role.isSuperRole) continue;
      expect(role.perms.filter((p) => forbidden.has(p.id))).toEqual([]);
    }
  });
});
