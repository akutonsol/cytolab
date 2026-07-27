import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../../../common/decorators/require-permissions.decorator';
import { ReconciliationController } from './reconciliation.controller';
import { buildRoleDefs, SPECIAL_OBJECTS } from '../../../../prisma/seed';

/**
 * Program 5B · B4 — the authorization boundary for the exception & reconciliation surface. Exercises the REAL
 * PermissionsGuard against the REAL controller metadata (so the decorator wiring is what's tested, not a copy),
 * plus the no-default-grant invariant proven through the seed's own role-grant construction (`buildRoleDefs`).
 * Reconciliation authority is `wsi:reconcile` and NOTHING else composes into it.
 */
const HANDLERS = ['queue', 'resolve', 'acknowledgeDuplicate', 'retry', 'dismiss'] as const;

function contextFor(handler: string, user: unknown): ExecutionContext {
  const fn = (ReconciliationController.prototype as any)[handler];
  return {
    getHandler: () => fn,
    getClass: () => ReconciliationController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

const guard = new PermissionsGuard(new Reflector());
const run = (handler: string, user: unknown) => () => guard.canActivate(contextFor(handler, user));

describe('ReconciliationController authorization (real PermissionsGuard + real metadata)', () => {
  describe.each(HANDLERS)('handler %s', (handler) => {
    it('ALLOWS a principal holding wsi:reconcile', () => {
      expect(guard.canActivate(contextFor(handler, { permissions: ['wsi:reconcile'] }))).toBe(true);
    });

    it('DENIES an empty permission set (genuine 403)', () => {
      expect(run(handler, { permissions: [] })).toThrow(ForbiddenException);
    });

    it('DENIES record:change (never reconciliation authority)', () => {
      expect(run(handler, { permissions: ['record:change'] })).toThrow(ForbiddenException);
    });

    it('DENIES wsi:view / wsi:review / wsi:publish (delivery/review/publish are not reconcile)', () => {
      expect(run(handler, { permissions: ['wsi:view', 'wsi:review', 'wsi:publish'] })).toThrow(ForbiddenException);
    });

    it('DENIES system:ingestion (reserved for B5 source administration, not reconciliation)', () => {
      expect(run(handler, { permissions: ['system:ingestion'] })).toThrow(ForbiddenException);
    });

    it('ALLOWS a super-role via the guard bypass', () => {
      expect(guard.canActivate(contextFor(handler, { isSuperRole: true, permissions: [] }))).toBe(true);
    });

    it('requires EXACTLY [wsi:reconcile]', () => {
      const meta = Reflect.getMetadata(PERMISSIONS_KEY, (ReconciliationController.prototype as any)[handler]);
      expect(meta).toEqual(['wsi:reconcile']);
    });
  });

  it('registers wsi:reconcile in the WSI permission catalog', () => {
    expect(SPECIAL_OBJECTS.wsi).toContain('reconcile');
  });

  it('grants wsi:reconcile to NO default role (explicit assignment only; super roles bypass)', () => {
    const all = [...SPECIAL_OBJECTS.wsi.map((a) => ({ id: `wsi:${a}`, code: `wsi:${a}` }))];
    // Include a couple of broad bundles to prove reconcile never rides along with them.
    all.push({ id: 'record:change', code: 'record:change' }, { id: 'record:view', code: 'record:view' });
    const defs = buildRoleDefs(all);
    for (const role of defs) {
      expect(role.perms.map((p) => p.id)).not.toContain('wsi:reconcile');
    }
  });
});
