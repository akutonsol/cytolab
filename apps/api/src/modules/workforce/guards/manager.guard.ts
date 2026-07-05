import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

/**
 * Restricts workforce report endpoints to managers/admins.
 *
 * This codebase is permission-based with free-form, per-lab role names (there is
 * no fixed MANAGER/ADMIN role), so "manager or admin" is resolved to: a super
 * role, the `employee:change` capability that Phase 1 already uses to gate
 * approvals, or a role named like a manager/admin/supervisor. The JWT principal
 * (see AuthUser) carries roles/permissions/isSuperRole populated by the global
 * JwtAuthGuard.
 */
@Injectable()
export class WorkforceManagerGuard implements CanActivate {
  private static readonly MANAGER_NAME = /manager|admin|administrator|supervisor|lead/i;

  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException();
    if (user.isSuperRole === true) return true;

    const perms: string[] = user.permissions ?? [];
    if (perms.includes('employee:change')) return true;

    const roles: string[] = user.roles ?? [];
    if (roles.some((r) => WorkforceManagerGuard.MANAGER_NAME.test(r))) return true;

    throw new ForbiddenException('Requires a manager or admin role');
  }
}
