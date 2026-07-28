import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../../../common/decorators/require-permissions.decorator';
import { DicomWebController } from './dicomweb.controller';
import { buildRoleDefs, SPECIAL_OBJECTS } from '../../../../prisma/seed';

/**
 * Program 5C · C3 — the DICOMweb administration/import authority. Real PermissionsGuard × real controller
 * metadata: EVERY route requires `system:ingestion`; ordinary WSI/record/reconcile permissions never
 * substitute; and `system:ingestion` is granted to NO default role (super roles bypass).
 */
const HANDLERS = ['createSource', 'listSources', 'setEnabled', 'discover', 'import'] as const;

function contextFor(handler: string, user: unknown): ExecutionContext {
  const fn = (DicomWebController.prototype as any)[handler];
  return { getHandler: () => fn, getClass: () => DicomWebController, switchToHttp: () => ({ getRequest: () => ({ user }) }) } as unknown as ExecutionContext;
}
const guard = new PermissionsGuard(new Reflector());
const run = (h: string, u: unknown) => () => guard.canActivate(contextFor(h, u));

describe('DicomWebController authorization (real PermissionsGuard + real metadata)', () => {
  describe.each(HANDLERS)('handler %s', (handler) => {
    it('ALLOWS system:ingestion', () => {
      expect(guard.canActivate(contextFor(handler, { permissions: ['system:ingestion'] }))).toBe(true);
    });
    it('DENIES empty / record:change / wsi:view / wsi:reconcile / wsi:publish', () => {
      for (const perms of [[], ['record:change'], ['wsi:view'], ['wsi:reconcile'], ['wsi:publish']]) {
        expect(run(handler, { permissions: perms })).toThrow(ForbiddenException);
      }
    });
    it('ALLOWS a super-role via bypass', () => {
      expect(guard.canActivate(contextFor(handler, { isSuperRole: true, permissions: [] }))).toBe(true);
    });
    it('requires EXACTLY [system:ingestion]', () => {
      expect(Reflect.getMetadata(PERMISSIONS_KEY, (DicomWebController.prototype as any)[handler])).toEqual(['system:ingestion']);
    });
  });

  it('registers system:ingestion in the catalog', () => {
    expect(SPECIAL_OBJECTS.system).toContain('ingestion');
  });

  it('grants system:ingestion to NO default role', () => {
    const all = [
      ...SPECIAL_OBJECTS.system.map((a) => ({ id: `system:${a}`, code: `system:${a}` })),
      { id: 'record:view', code: 'record:view' }, { id: 'record:change', code: 'record:change' },
      { id: 'wsi:view', code: 'wsi:view' }, { id: 'wsi:reconcile', code: 'wsi:reconcile' },
    ];
    for (const role of buildRoleDefs(all)) {
      expect(role.perms.map((p) => p.id)).not.toContain('system:ingestion');
    }
  });
});
