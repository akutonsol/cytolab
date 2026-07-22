import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../../common/decorators/require-permissions.decorator';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { IS_PORTAL_KEY } from '../../portal/common/portal-principal';
import { AUTHZ_CONTRACT_KEY, AuthzContractKind } from '../../../common/decorators/authorization-contract.decorator';

/** Authorization-contract kinds this guard recognizes (R-001a). */
const KNOWN_AUTHZ_CONTRACTS: ReadonlySet<string> = new Set<AuthzContractKind>(['authenticated']);

/**
 * Fail-closed authorization guard (R-001b).
 *
 * A route is allowed ONLY when it declares a recognized authorization contract.
 * A handler with NO recognized contract is DENIED — there is no fail-open-by-
 * omission path (the R-001a architecture test guarantees every production handler
 * declares one, so this denial is unreachable for real routes and catches only
 * regressions / adversarial calls).
 *
 * Effective order:
 *   1. @Public()            → allow (no principal required here)
 *   2. @Portal()            → stand down (PortalAuthGuard + client-scoped tenancy
 *                             + service-level ownership govern portal access)
 *   3. no principal         → deny
 *   4. super-role           → allow (intentional bypass, unchanged)
 *   5. @RequirePermissions  → allow iff the principal holds every permission
 *   6. @AuthorizationContract('authenticated') → allow (authenticated principal)
 *   7. empty/malformed permission metadata     → deny
 *   8. unknown contract kind                    → deny
 *   9. no recognized contract                   → deny
 *
 * Super-role bypass keys off the `isSuperRole` flag on the principal (from
 * Role.isSuperRole), NOT a hardcoded role name.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];

    // 1. Public — intentionally unauthenticated; no authorization applied.
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    // 2. Portal — this guard stands down; portal auth + client-scoped tenancy own it.
    if (this.reflector.getAllAndOverride<boolean>(IS_PORTAL_KEY, targets)) return true;

    const { user } = context.switchToHttp().getRequest();

    // 3. Every non-public, non-portal route requires an authenticated principal.
    if (!user) throw new ForbiddenException();

    // 4. Super-role bypass (unchanged, intentional).
    if (user.isSuperRole === true) return true;

    // 5 / 7. Explicit role-permission contract.
    const required = this.reflector.getAllAndOverride<unknown>(PERMISSIONS_KEY, targets);
    if (required !== undefined) {
      // 7. Empty or malformed metadata fails closed — never treated as "no gate".
      if (
        !Array.isArray(required) ||
        required.length === 0 ||
        required.some((p) => typeof p !== 'string' || p.length === 0)
      ) {
        throw new ForbiddenException('Invalid permission policy');
      }
      const ok = (required as string[]).every((p) => user.permissions?.includes(p));
      if (!ok) throw new ForbiddenException(`Missing permission: ${(required as string[]).join(', ')}`);
      return true;
    }

    // 6 / 8. Explicit authenticated (non-permission) contract.
    const contract = this.reflector.getAllAndOverride<string>(AUTHZ_CONTRACT_KEY, targets);
    if (contract !== undefined) {
      // 8. Unknown contract kind fails closed.
      if (!KNOWN_AUTHZ_CONTRACTS.has(contract)) {
        throw new ForbiddenException('Unknown authorization contract');
      }
      // 6. Authenticated principal already verified above.
      return true;
    }

    // 9. No recognized contract → deny (no fail-open-by-omission).
    throw new ForbiddenException('No authorization contract declared');
  }
}
