/**
 * Program 2 · P2-2 — Trusted actor & organization resolution.
 *
 * Identity is derived ONLY from authenticated state (request.user populated by the JWT
 * strategies) or explicit system execution — NEVER from request body, query, or arbitrary
 * headers. Resolution is attribution, not authorization.
 */
import {
  ExecutionActor,
  ExecutionOrganization,
  PrincipalLike,
} from './execution-context.types';

/**
 * Actor resolution order: staff → portal → service → system → anonymous. An unauthenticated
 * request (no principal) resolves to ANONYMOUS with no id. A principal never contributes a
 * labId here (that is organization resolution's job).
 */
export function resolveActor(principal: PrincipalLike | undefined): ExecutionActor {
  if (!principal) return { actorType: 'ANONYMOUS' };

  switch (principal.kind) {
    case 'staff':
      return principal.userId
        ? { actorType: 'STAFF', actorId: principal.userId }
        : { actorType: 'ANONYMOUS' };
    case 'portal':
      return principal.portalUserId
        ? { actorType: 'PORTAL', actorId: principal.portalUserId }
        : { actorType: 'ANONYMOUS' };
    case 'service':
      return {
        actorType: 'SERVICE',
        servicePrincipal: principal.servicePrincipal,
      };
    case 'system':
      return { actorType: 'SYSTEM' };
    default:
      // An object with no recognized kind is untrusted for identity purposes.
      return { actorType: 'ANONYMOUS' };
  }
}

/**
 * Organization resolution from authenticated state:
 *   - an authenticated labId (staff or portal) → LAB scope with that labId;
 *   - no authenticated lab (unauthenticated request, or explicit system execution) → SYSTEM
 *     scope with NO labId (never a fabricated/sentinel tenant);
 *   - CROSS_LAB is only produced by explicit system execution that opts into it.
 *
 * `explicitScope` lets a system/job execution declare SYSTEM or CROSS_LAB deliberately.
 */
export function resolveOrganization(
  principal: PrincipalLike | undefined,
  explicitScope?: 'SYSTEM' | 'CROSS_LAB',
): ExecutionOrganization {
  if (explicitScope) return { scope: explicitScope };
  if (principal?.labId) return { scope: 'LAB', labId: principal.labId };
  return { scope: 'SYSTEM' };
}
