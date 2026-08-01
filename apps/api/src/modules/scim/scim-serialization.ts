import { SCIM_LIST_RESPONSE_SCHEMA, SCIM_USER_SCHEMA, SCIM_USERS_LOCATION } from './scim.constants';

/**
 * Program 7 · Phase 7B.3 — SCIM 2.0 (RFC 7643) resource serialization + optimistic-concurrency version helpers. Pure,
 * no I/O. The SCIM resource is a PROJECTION of the canonical `User` + its immutable `ScimUserMapping`; the durable key
 * is always `User.id` (GG7). `externalId`/`userName` are mutable external attributes, never the identity key.
 */

/** The minimal shape this projection reads (kept structural so callers pass a Prisma select result directly). */
export interface ScimUserSource {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  updatedAt: Date;
}
export interface ScimMappingSource {
  externalId: string;
  createdAt: Date;
}

/**
 * A weak ETag derived from `User.updatedAt` (RFC 7644 §3.14). Every governed attribute write bumps `updatedAt`, so the
 * version changes exactly when the resource changes; a stale `If-Match` therefore fails the precondition (412).
 */
export function resourceVersion(updatedAt: Date): string {
  return `W/"${updatedAt.getTime().toString(36)}"`;
}

/** Normalize an `If-Match` header / `meta.version` for comparison (strip the weak `W/` marker + surrounding quotes). */
export function normalizeVersion(v: string | undefined): string | undefined {
  if (!v) return undefined;
  return v.trim().replace(/^W\//i, '').replace(/^"|"$/g, '').replace(/^"|"$/g, '');
}

/** True when the client-supplied `If-Match` matches the resource's current version. */
export function versionMatches(ifMatch: string | undefined, updatedAt: Date): boolean {
  const want = normalizeVersion(ifMatch);
  const have = normalizeVersion(resourceVersion(updatedAt));
  return want === have;
}

/** Project a canonical `User` + its SCIM mapping into an RFC 7643 SCIM User resource. */
export function toScimUser(user: ScimUserSource, mapping: ScimMappingSource): Record<string, unknown> {
  return {
    schemas: [SCIM_USER_SCHEMA],
    id: user.id,
    externalId: mapping.externalId,
    userName: user.email,
    name: {
      givenName: user.firstName,
      familyName: user.lastName,
      formatted: `${user.firstName} ${user.lastName}`.trim(),
    },
    emails: [{ value: user.email, primary: true }],
    active: user.isActive,
    meta: {
      resourceType: 'User',
      created: mapping.createdAt.toISOString(),
      lastModified: user.updatedAt.toISOString(),
      location: `${SCIM_USERS_LOCATION}/${user.id}`,
      version: resourceVersion(user.updatedAt),
    },
  };
}

/** Wrap resources in an RFC 7644 §3.4.2 ListResponse (1-based `startIndex`). */
export function toScimListResponse(
  resources: Array<Record<string, unknown>>,
  totalResults: number,
  startIndex: number,
  itemsPerPage: number,
): Record<string, unknown> {
  return {
    schemas: [SCIM_LIST_RESPONSE_SCHEMA],
    totalResults,
    startIndex,
    itemsPerPage,
    Resources: resources,
  };
}
