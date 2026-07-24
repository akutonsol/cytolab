import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../../../common/decorators/require-permissions.decorator';
import { SlideReviewController } from './slide-review.controller';
import { buildRoleDefs, SPECIAL_OBJECTS } from '../../../../prisma/seed';

/**
 * P5-6.2 — the authorization boundary for the P5-6.1 review surface. Exercises the REAL PermissionsGuard
 * against the REAL controller metadata (so the decorator wiring is what's tested, not a copy), plus the
 * no-default-grant invariant proven through the seed's own role-grant construction (`buildRoleDefs`).
 */
const HANDLERS = ['getReview', 'getEvidence', 'getPublications'] as const;

function contextFor(handler: string, user: unknown): ExecutionContext {
  const fn = (SlideReviewController.prototype as any)[handler];
  return {
    getHandler: () => fn,
    getClass: () => SlideReviewController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

const guard = new PermissionsGuard(new Reflector());
const run = (handler: string, user: unknown) => () => guard.canActivate(contextFor(handler, user));

describe('SlideReviewController authorization (real PermissionsGuard + real metadata)', () => {
  describe.each(HANDLERS)('handler %s', (handler) => {
    it('ALLOWS a principal holding wsi:review', () => {
      expect(guard.canActivate(contextFor(handler, { permissions: ['wsi:review'] }))).toBe(true);
    });

    it('DENIES record:view alone (the retired interim permission)', () => {
      expect(run(handler, { permissions: ['record:view'] })).toThrow(ForbiddenException);
    });

    it('DENIES an empty permission set', () => {
      expect(run(handler, { permissions: [] })).toThrow(ForbiddenException);
    });

    it('DENIES wsi:publish alone (publish is not review)', () => {
      expect(run(handler, { permissions: ['wsi:publish'] })).toThrow(ForbiddenException);
    });

    it('DENIES broad viewing privileges that do not include wsi:review (record:view + wsi:view)', () => {
      // Proves older/broader viewing grants cannot accidentally compose into clinical-review authority.
      expect(run(handler, { permissions: ['record:view', 'wsi:view'] })).toThrow(ForbiddenException);
    });

    it('ALLOWS a super-role via the guard bypass', () => {
      expect(guard.canActivate(contextFor(handler, { isSuperRole: true, permissions: [] }))).toBe(true);
    });

    it('requires EXACTLY [wsi:review] and never consumes wsi:publish', () => {
      const meta = Reflect.getMetadata(PERMISSIONS_KEY, (SlideReviewController.prototype as any)[handler]);
      expect(meta).toEqual(['wsi:review']);
      expect(meta).not.toContain('wsi:publish');
    });
  });
});

describe('P5-6.2 catalog + no-default-grant (seed construction)', () => {
  it('catalogs wsi view + review + publish', () => {
    expect(SPECIAL_OBJECTS.wsi).toEqual(expect.arrayContaining(['view', 'review', 'publish']));
  });

  it('grants NO wsi:* permission to any non-super default role', () => {
    // Feed the REAL role builder a catalog that INCLUDES every wsi permission; if any non-super role
    // selected one, it would appear in that role's grants. It does not (no roleDef prefix includes 'wsi').
    const catalog = [
      { id: 'p-view', code: 'wsi:view' },
      { id: 'p-review', code: 'wsi:review' },
      { id: 'p-publish', code: 'wsi:publish' },
      { id: 'p-rv', code: 'record:view' },
      { id: 'p-pv', code: 'patient:view' },
    ];
    const wsiIds = new Set(['p-view', 'p-review', 'p-publish']);
    for (const role of buildRoleDefs(catalog)) {
      if (role.isSuperRole) continue;
      expect(role.perms.filter((p) => wsiIds.has(p.id))).toEqual([]);
    }
  });

  it('defines exactly one super-role, carrying no explicit perms (relies on the isSuperRole bypass)', () => {
    const supers = buildRoleDefs([]).filter((r) => r.isSuperRole);
    expect(supers).toHaveLength(1);
    expect(supers[0].perms).toEqual([]);
  });
});
