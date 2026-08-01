import { normalizeVersion, resourceVersion, toScimListResponse, toScimUser, versionMatches } from './scim-serialization';
import { SCIM_LIST_RESPONSE_SCHEMA, SCIM_USER_SCHEMA } from './scim.constants';

/**
 * Program 7 · Phase 7B.3 — SCIM serialization + optimistic-concurrency version helpers (pure, no I/O). Proves the SCIM
 * User projection maps the canonical User.id as the durable id, carries externalId/userName as mutable attributes, and
 * that the weak ETag changes exactly with User.updatedAt (so a stale If-Match fails the precondition).
 */
describe('P7-7B.3 SCIM serialization', () => {
  const user = { id: 'u1', email: 'jane@corp.test', firstName: 'Jane', lastName: 'Doe', isActive: true, updatedAt: new Date('2026-07-31T10:00:00.000Z') };
  const mapping = { externalId: 'ext-123', createdAt: new Date('2026-07-30T09:00:00.000Z') };

  it('projects User + mapping into an RFC 7643 SCIM User (durable id = User.id)', () => {
    const r = toScimUser(user, mapping) as any;
    expect(r.schemas).toEqual([SCIM_USER_SCHEMA]);
    expect(r.id).toBe('u1'); // canonical User.id — never externalId
    expect(r.externalId).toBe('ext-123');
    expect(r.userName).toBe('jane@corp.test');
    expect(r.name).toEqual({ givenName: 'Jane', familyName: 'Doe', formatted: 'Jane Doe' });
    expect(r.emails).toEqual([{ value: 'jane@corp.test', primary: true }]);
    expect(r.active).toBe(true);
    expect(r.meta.resourceType).toBe('User');
    expect(r.meta.location).toBe('/scim/v2/Users/u1');
    expect(r.meta.version).toBe(resourceVersion(user.updatedAt));
  });

  it('version is a weak ETag that changes with updatedAt', () => {
    const v1 = resourceVersion(new Date('2026-07-31T10:00:00.000Z'));
    const v2 = resourceVersion(new Date('2026-07-31T10:00:01.000Z'));
    expect(v1.startsWith('W/"')).toBe(true);
    expect(v1).not.toBe(v2);
  });

  it('versionMatches accepts the current version (weak + quoted forms) and rejects a stale one', () => {
    const now = new Date('2026-07-31T10:00:00.000Z');
    const current = resourceVersion(now);
    expect(versionMatches(current, now)).toBe(true);
    expect(versionMatches(normalizeVersion(current), now)).toBe(true); // bare form
    expect(versionMatches('W/"deadbeef"', now)).toBe(false);
    expect(versionMatches(undefined, now)).toBe(false);
  });

  it('wraps resources in an RFC 7644 ListResponse (1-based startIndex)', () => {
    const list = toScimListResponse([toScimUser(user, mapping)], 1, 1, 1) as any;
    expect(list.schemas).toEqual([SCIM_LIST_RESPONSE_SCHEMA]);
    expect(list.totalResults).toBe(1);
    expect(list.startIndex).toBe(1);
    expect(list.itemsPerPage).toBe(1);
    expect(list.Resources).toHaveLength(1);
  });
});
