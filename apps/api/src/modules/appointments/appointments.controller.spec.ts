import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import { AppointmentsController } from './appointments.controller';

/**
 * R-002 regression: the appointment READ routes must be gated on 'appointment:view'.
 *
 * Before the fix these six GET routes carried no @RequirePermissions decorator, so
 * PermissionsGuard fell open (permissions.guard.ts: `if (!required) return true`) and
 * ANY authenticated staff role could read the lab's patient-linked schedule.
 *
 * These tests drive the REAL PermissionsGuard with a REAL Reflector reading the REAL
 * decorator metadata off each handler — so deleting a decorator (which would re-open
 * the hole) makes the guard return true and fails the enforcement tests below.
 */
describe('AppointmentsController — R-002 authorization contract', () => {
  const reflector = new Reflector();
  const guard = new PermissionsGuard(reflector);

  const READ_ROUTES = ['list', 'calendar', 'today', 'upcoming', 'stats', 'findOne'] as const;
  // Writes were already gated pre-R-002; asserted so a future edit can't silently drop them.
  const WRITE_ROUTES = [
    'create', 'update', 'cancel', 'confirm', 'checkIn',
    'complete', 'noShow', 'reschedule', 'sendReminder',
  ] as const;

  const handlerFor = (method: string) => (AppointmentsController.prototype as any)[method];

  const contextFor = (method: string, user: any) =>
    ({
      getHandler: () => handlerFor(method),
      getClass: () => AppointmentsController,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as any;

  describe('metadata', () => {
    it.each(READ_ROUTES)('read route %s requires appointment:view', (method) => {
      const required = reflector.get<string[]>(PERMISSIONS_KEY, handlerFor(method));
      expect(required).toEqual(['appointment:view']);
    });

    // R-008-follow-up: appointment writes gate on appointment:manage (the catalog's write-gate),
    // NOT record:change — locks the fix against future permission drift.
    it.each(WRITE_ROUTES)('write route %s requires appointment:manage (not record:change)', (method) => {
      const required = reflector.get<string[]>(PERMISSIONS_KEY, handlerFor(method));
      expect(required).toEqual(['appointment:manage']);
      expect(required).not.toContain('record:change');
    });
  });

  describe('route-level enforcement (real guard)', () => {
    it.each(READ_ROUTES)('%s DENIES a staff role lacking appointment:view', (method) => {
      const user = { roles: ['Pathologist'], permissions: ['record:view'], isSuperRole: false };
      expect(() => guard.canActivate(contextFor(method, user))).toThrow(ForbiddenException);
    });

    it.each(READ_ROUTES)('%s ALLOWS a role holding appointment:view', (method) => {
      const user = { roles: ['Receptionist'], permissions: ['appointment:view'], isSuperRole: false };
      expect(guard.canActivate(contextFor(method, user))).toBe(true);
    });

    it.each(READ_ROUTES)('%s ALLOWS a super role (guard bypass)', (method) => {
      const user = { roles: ['Superuser'], permissions: [], isSuperRole: true };
      expect(guard.canActivate(contextFor(method, user))).toBe(true);
    });
  });

  describe('write-route enforcement (real guard) — appointment:manage', () => {
    it.each(WRITE_ROUTES)('%s ALLOWS a front-desk role holding appointment:manage', (method) => {
      const user = { roles: ['Receptionist'], permissions: ['appointment:view', 'appointment:manage'], isSuperRole: false };
      expect(guard.canActivate(contextFor(method, user))).toBe(true);
    });

    it.each(WRITE_ROUTES)('%s ALLOWS a Lab Technician holding appointment:manage', (method) => {
      const user = { roles: ['Lab Technician'], permissions: ['appointment:view', 'appointment:create', 'appointment:change', 'appointment:manage'], isSuperRole: false };
      expect(guard.canActivate(contextFor(method, user))).toBe(true);
    });

    it.each(WRITE_ROUTES)('%s DENIES a sign-off role holding record:change but not appointment:manage', (method) => {
      const user = { roles: ['Pathologist'], permissions: ['record:change', 'record:view'], isSuperRole: false };
      expect(() => guard.canActivate(contextFor(method, user))).toThrow(ForbiddenException);
    });

    it.each(WRITE_ROUTES)('%s DENIES a principal with only appointment:view', (method) => {
      const user = { roles: ['viewer'], permissions: ['appointment:view'], isSuperRole: false };
      expect(() => guard.canActivate(contextFor(method, user))).toThrow(ForbiddenException);
    });

    it.each(WRITE_ROUTES)('%s ALLOWS a super role (guard bypass)', (method) => {
      const user = { roles: ['Superuser'], permissions: [], isSuperRole: true };
      expect(guard.canActivate(contextFor(method, user))).toBe(true);
    });
  });
});
