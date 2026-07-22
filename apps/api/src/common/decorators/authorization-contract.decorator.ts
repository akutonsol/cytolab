import { SetMetadata } from '@nestjs/common';

/** Metadata key for an explicit, non-permission authorization contract. */
export const AUTHZ_CONTRACT_KEY = 'authzContract';

/**
 * Authorization contracts that intentionally do NOT use a role permission.
 * Extensible — add 'webhook' | 'api-key' | 'service' as those flows earn an
 * explicit contract, without introducing another one-off decorator.
 */
export type AuthzContractKind = 'authenticated';

/**
 * Declares that a route's authorization is satisfied WITHOUT a role permission —
 * e.g. self-service on the caller's own data (`user.userId`), or governance by a
 * dedicated guard (portal, manager) rather than the role-permission matrix.
 *
 * Consumed by (a) the authorization-contract architecture test, which requires
 * every handler to declare exactly one recognized contract, and (b) the
 * fail-closed PermissionsGuard (R-001b). In R-001a this only attaches metadata —
 * nothing reads it yet, so there is ZERO runtime behavior change.
 */
export const AuthorizationContract = (kind: AuthzContractKind = 'authenticated') =>
  SetMetadata(AUTHZ_CONTRACT_KEY, kind);
