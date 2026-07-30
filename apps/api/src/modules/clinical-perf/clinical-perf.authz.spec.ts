import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import { ClinicalPerfController } from './clinical-perf.controller';
import { buildRoleDefs, SPECIAL_OBJECTS } from '../../../prisma/seed';

/**
 * Program 6 · Phase 6H — the authorization boundary for clinical performance. Exercises the REAL PermissionsGuard
 * against the REAL controller metadata and proves the no-default-grant invariant. `run` (initiate a measurement) is
 * DISTINCT from `view`; there is no evidence-mutation, lifecycle, or diagnostic route (no permission grants clinical
 * or diagnostic authority).
 */
const guard = new PermissionsGuard(new Reflector());
const H = ClinicalPerfController.prototype as any;
function ctx(handler: unknown, user: unknown): ExecutionContext {
  return { getHandler: () => handler, getClass: () => ClinicalPerfController, switchToHttp: () => ({ getRequest: () => ({ user }) }) } as unknown as ExecutionContext;
}
const allow = (h: unknown, perms: string[]) => guard.canActivate(ctx(h, { permissions: perms }));
const deny = (h: unknown, perms: string[]) => expect(() => guard.canActivate(ctx(h, { permissions: perms }))).toThrow(ForbiddenException);

describe('P6-6H ClinicalPerfController authorization', () => {
  it('read routes require clinicalperf:view', () => {
    for (const h of [H.listWindows, H.getWindow]) {
      expect(allow(h, ['clinicalperf:view'])).toBe(true);
      deny(h, []); deny(h, ['clinicalperf:run']); deny(h, ['clinicalperf:manage']);
    }
  });

  it('run requires clinicalperf:run (not view, not manage)', () => {
    expect(allow(H.runMeasurement, ['clinicalperf:run'])).toBe(true);
    deny(H.runMeasurement, []); deny(H.runMeasurement, ['clinicalperf:view']); deny(H.runMeasurement, ['clinicalperf:manage']);
    deny(H.runMeasurement, ['clinicalperf:view', 'clinicalperf:manage']);
  });

  it('declares exactly the intended permission on each handler', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, H.runMeasurement)).toEqual(['clinicalperf:run']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, H.listWindows)).toEqual(['clinicalperf:view']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, H.getWindow)).toEqual(['clinicalperf:view']);
  });

  it('has no evidence-mutation, lifecycle, diagnostic, or recommendation route', () => {
    const routes = Object.getOwnPropertyNames(H).filter((n) => n !== 'constructor');
    expect(routes.some((n) => /update|edit|delete|patch|retire|promote|approve|certify|recommend|diagnos|overwrite/i.test(n))).toBe(false);
  });

  it('catalogs clinicalperf:view/run/manage and grants NONE of them to any default role', () => {
    expect(SPECIAL_OBJECTS.clinicalperf).toEqual(['view', 'run', 'manage']);
    const catalog = [
      { id: 'p-cv', code: 'clinicalperf:view' }, { id: 'p-cr', code: 'clinicalperf:run' }, { id: 'p-cm', code: 'clinicalperf:manage' }, { id: 'p-x', code: 'record:view' },
    ];
    const forbidden = new Set(['p-cv', 'p-cr', 'p-cm']);
    for (const role of buildRoleDefs(catalog)) {
      if (role.isSuperRole) continue;
      expect(role.perms.filter((p) => forbidden.has(p.id))).toEqual([]);
    }
  });
});
