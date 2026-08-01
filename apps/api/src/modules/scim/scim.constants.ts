/**
 * Program 7 · Phase 7B.3 — SCIM 2.0 protocol constants (RFC 7643 schemas / RFC 7644 API messages). Value-free protocol
 * identifiers only. The baseline scopes to the **User** resource (+ read-only discovery); Groups are deferred to 7B.4
 * and are advertised honestly (unsupported) in `/ServiceProviderConfig` — never silently partial.
 */

export const SCIM_USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User';
export const SCIM_LIST_RESPONSE_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:ListResponse';
export const SCIM_ERROR_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:Error';
export const SCIM_PATCH_OP_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:PatchOp';
export const SCIM_SERVICE_PROVIDER_CONFIG_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig';
export const SCIM_RESOURCE_TYPE_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:ResourceType';

/** RFC 7644 §3.12 `scimType` detail codes used by the deterministic conflict responses (no heuristic resolution). */
export const SCIM_ERROR_TYPES = {
  uniqueness: 'uniqueness',
  mutability: 'mutability',
  invalidValue: 'invalidValue',
  invalidSyntax: 'invalidSyntax',
  noTarget: 'noTarget',
} as const;

/** The SCIM content type (RFC 7644 §3.1). */
export const SCIM_CONTENT_TYPE = 'application/scim+json';

/** The base path all SCIM Users routes hang off. */
export const SCIM_USERS_LOCATION = '/scim/v2/Users';

/** The single permission a SCIM connector ServicePrincipal must hold (no default grant). */
export const SCIM_PERMISSION = 'identityprovisioning:manage';
