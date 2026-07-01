import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../../common/decorators/require-permissions.decorator';

/**
 * Enforces permission codes like 'patient:view', 'resultsheet:authorize'.
 *
 * A holder of ANY super role bypasses all checks. The bypass keys off the
 * `isSuperRole` flag carried on the principal (derived from Role.isSuperRole),
 * NOT a hardcoded role name — so a lab can define named super roles (e.g.
 * "P. McCarthy") that bypass, exactly like the legacy super_role flag.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException();
    if (user.isSuperRole === true) return true;

    const ok = required.every((p) => user.permissions?.includes(p));
    if (!ok) throw new ForbiddenException(`Missing permission: ${required.join(', ')}`);
    return true;
  }
}
