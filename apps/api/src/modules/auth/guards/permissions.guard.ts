import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../../common/decorators/require-permissions.decorator';

/**
 * Enforces permission codes like 'patient:view', 'resultsheet:authorize'.
 * Superuser role bypasses (legacy parity).
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
    if (user.roles?.includes('Superuser')) return true;

    const ok = required.every((p) => user.permissions?.includes(p));
    if (!ok) throw new ForbiddenException(`Missing permission: ${required.join(', ')}`);
    return true;
  }
}
