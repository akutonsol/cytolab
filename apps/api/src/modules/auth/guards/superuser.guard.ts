import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

/**
 * Restricts a route to superusers only (the `isSuperRole` flag on the principal,
 * not a hardcoded role name — same signal the PermissionsGuard bypasses on).
 * Used by admin surfaces (e.g. feature management) that no lab staff role holds.
 */
@Injectable()
export class SuperuserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    if (user?.isSuperRole === true) return true;
    throw new ForbiddenException('Superuser access required');
  }
}
