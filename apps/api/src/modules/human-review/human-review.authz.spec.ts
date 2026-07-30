import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import { HumanReviewController } from './human-review.controller';
import { buildRoleDefs, SPECIAL_OBJECTS } from '../../../prisma/seed';

/**
 * Program 6 · Phase 6E — the authorization boundary for human review. Exercises the REAL PermissionsGuard against
 * the REAL controller metadata and proves the no-default-grant invariant. `submit` (a human decision) is DISTINCT
 * from `view`/`request`/`assign`; `manage` (reopen/cancel) is administrative only and is not a decision-mutation path.
 */
const guard = new PermissionsGuard(new Reflector());
const H = HumanReviewController.prototype as any;
function ctx(handler: unknown, user: unknown): ExecutionContext {
  return { getHandler: () => handler, getClass: () => HumanReviewController, switchToHttp: () => ({ getRequest: () => ({ user }) }) } as unknown as ExecutionContext;
}
const allow = (h: unknown, perms: string[]) => guard.canActivate(ctx(h, { permissions: perms }));
const deny = (h: unknown, perms: string[]) => expect(() => guard.canActivate(ctx(h, { permissions: perms }))).toThrow(ForbiddenException);

describe('P6-6E HumanReviewController authorization', () => {
  it('read routes require review:view', () => {
    for (const h of [H.listRequests, H.getRequest]) {
      expect(allow(h, ['review:view'])).toBe(true);
      deny(h, []); deny(h, ['review:submit']); deny(h, ['review:manage']);
    }
  });

  it('submit requires review:submit (not view, request, assign, or manage)', () => {
    expect(allow(H.submitDecision, ['review:submit'])).toBe(true);
    for (const p of [[], ['review:view'], ['review:request'], ['review:assign'], ['review:manage']]) deny(H.submitDecision, p as string[]);
  });

  it('request/assign/manage each require their own distinct permission', () => {
    expect(allow(H.createRequest, ['review:request'])).toBe(true); deny(H.createRequest, ['review:submit']);
    expect(allow(H.assign, ['review:assign'])).toBe(true); deny(H.assign, ['review:request']);
    for (const h of [H.reopen, H.cancel]) { expect(allow(h, ['review:manage'])).toBe(true); deny(h, ['review:submit']); deny(h, ['review:assign']); }
  });

  it('declares exactly the intended permission on each handler', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, H.submitDecision)).toEqual(['review:submit']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, H.createRequest)).toEqual(['review:request']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, H.assign)).toEqual(['review:assign']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, H.reopen)).toEqual(['review:manage']);
  });

  it('has no decision-mutation route (decisions are immutable)', () => {
    const routes = Object.getOwnPropertyNames(H).filter((n) => n !== 'constructor');
    expect(routes.some((n) => /updateDecision|editDecision|deleteDecision|patchDecision|overwrite/i.test(n))).toBe(false);
  });

  it('catalogs review:view/request/assign/submit/manage and grants NONE of them to any default role', () => {
    expect(SPECIAL_OBJECTS.review).toEqual(['view', 'request', 'assign', 'submit', 'manage']);
    const catalog = [
      { id: 'p-rv', code: 'review:view' }, { id: 'p-rr', code: 'review:request' }, { id: 'p-ra', code: 'review:assign' },
      { id: 'p-rs', code: 'review:submit' }, { id: 'p-rm', code: 'review:manage' }, { id: 'p-x', code: 'record:view' },
    ];
    const forbidden = new Set(['p-rv', 'p-rr', 'p-ra', 'p-rs', 'p-rm']);
    for (const role of buildRoleDefs(catalog)) {
      if (role.isSuperRole) continue;
      expect(role.perms.filter((p) => forbidden.has(p.id))).toEqual([]);
    }
  });
});
