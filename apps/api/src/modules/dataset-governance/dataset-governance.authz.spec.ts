import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import { DatasetGovernanceController } from './dataset-governance.controller';
import { buildRoleDefs, SPECIAL_OBJECTS } from '../../../prisma/seed';

/**
 * Program 6 · Phase 6B — authorization boundary for dataset governance. Real PermissionsGuard × real controller
 * metadata; no-default-grant proven through the seed's own role construction. `freeze` (the immutability commit)
 * is DISTINCT from `manage`.
 */
const guard = new PermissionsGuard(new Reflector());
const H = DatasetGovernanceController.prototype as any;
const ctx = (h: unknown, user: unknown): ExecutionContext => ({ getHandler: () => h, getClass: () => DatasetGovernanceController, switchToHttp: () => ({ getRequest: () => ({ user }) }) } as unknown as ExecutionContext);
const allow = (h: unknown, p: string[]) => guard.canActivate(ctx(h, { permissions: p }));
const deny = (h: unknown, p: string[]) => expect(() => guard.canActivate(ctx(h, { permissions: p }))).toThrow(ForbiddenException);

describe('P6-6B DatasetGovernanceController authorization', () => {
  it('read routes require dataset:view', () => {
    for (const h of [H.listDatasets, H.getDataset, H.getVersion]) {
      expect(allow(h, ['dataset:view'])).toBe(true);
      deny(h, []); deny(h, ['dataset:manage']); deny(h, ['dataset:freeze']);
    }
  });

  it('write routes require dataset:manage (not view, not freeze)', () => {
    for (const h of [H.createDataset, H.updateDataset, H.createVersion, H.addSlide, H.setLabel, H.addTrainingReference]) {
      expect(allow(h, ['dataset:manage'])).toBe(true);
      deny(h, []); deny(h, ['dataset:view']); deny(h, ['dataset:freeze']);
    }
  });

  it('freeze requires dataset:freeze — manage alone is DENIED', () => {
    expect(allow(H.freezeVersion, ['dataset:freeze'])).toBe(true);
    deny(H.freezeVersion, []); deny(H.freezeVersion, ['dataset:manage']); deny(H.freezeVersion, ['dataset:view', 'dataset:manage']);
  });

  it('declares the intended permission on each governance-critical handler', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, H.freezeVersion)).toEqual(['dataset:freeze']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, H.createDataset)).toEqual(['dataset:manage']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, H.listDatasets)).toEqual(['dataset:view']);
  });

  it('catalogs dataset:view/manage/freeze and grants NONE to any default role', () => {
    expect(SPECIAL_OBJECTS.dataset).toEqual(['view', 'manage', 'freeze']);
    const catalog = [
      { id: 'p-dv', code: 'dataset:view' },
      { id: 'p-dm', code: 'dataset:manage' },
      { id: 'p-df', code: 'dataset:freeze' },
      { id: 'p-rv', code: 'record:view' },
    ];
    const forbidden = new Set(['p-dv', 'p-dm', 'p-df']);
    for (const role of buildRoleDefs(catalog)) {
      if (role.isSuperRole) continue;
      expect(role.perms.filter((p) => forbidden.has(p.id))).toEqual([]);
    }
  });
});
