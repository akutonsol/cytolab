import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../../../common/decorators/require-permissions.decorator';
import { SlidePublishController } from './slide-publish.controller';

/**
 * P5-6.3 — the publication authorization boundary. Real PermissionsGuard × real controller metadata:
 * only wsi:publish authorizes publication; no review/view permission (nor their composition) may imply it.
 */
const HANDLER = 'publishGeneration';
const handlerFn = (SlidePublishController.prototype as any)[HANDLER];

function contextFor(user: unknown): ExecutionContext {
  return {
    getHandler: () => handlerFn,
    getClass: () => SlidePublishController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

const guard = new PermissionsGuard(new Reflector());
const run = (user: unknown) => () => guard.canActivate(contextFor(user));

describe('SlidePublishController authorization (real PermissionsGuard + real metadata)', () => {
  it('ALLOWS a principal holding wsi:publish', () => {
    expect(guard.canActivate(contextFor({ permissions: ['wsi:publish'] }))).toBe(true);
  });

  it('DENIES wsi:review alone (review is not publish)', () => {
    expect(run({ permissions: ['wsi:review'] })).toThrow(ForbiddenException);
  });

  it('DENIES wsi:view alone', () => {
    expect(run({ permissions: ['wsi:view'] })).toThrow(ForbiddenException);
  });

  it('DENIES the composition wsi:review + wsi:view (no viewing/review grant implies publication)', () => {
    expect(run({ permissions: ['wsi:review', 'wsi:view'] })).toThrow(ForbiddenException);
  });

  it('DENIES an empty permission set', () => {
    expect(run({ permissions: [] })).toThrow(ForbiddenException);
  });

  it('ALLOWS a super-role via the guard bypass', () => {
    expect(guard.canActivate(contextFor({ isSuperRole: true, permissions: [] }))).toBe(true);
  });

  it('declares EXACTLY [wsi:publish] and returns HTTP 200 (not 201)', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handlerFn)).toEqual(['wsi:publish']);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handlerFn)).toBe(200);
  });
});
