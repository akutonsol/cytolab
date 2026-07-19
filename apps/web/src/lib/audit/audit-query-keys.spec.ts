import { auditEventsQueryKey } from './audit-query-keys';
import { AuditFilterState } from './audit-filters';

const base: AuditFilterState = { pageSize: 50, phi: false };

describe('P2-8B — query keys', () => {
  it('includes the predicate and the cursor', () => {
    expect(auditEventsQueryKey(base, null)).toEqual(['audit-events', expect.any(String), 'first']);
    expect(auditEventsQueryKey(base, 'c1')).toEqual(['audit-events', expect.any(String), 'c1']);
  });

  it('separates PHI from base caches (phi is inside the predicate segment)', () => {
    const baseKey = auditEventsQueryKey(base, null)[1];
    const phiKey = auditEventsQueryKey({ ...base, phi: true }, null)[1];
    expect(phiKey).not.toBe(baseKey);
  });

  it('distinguishes cursors within the same predicate', () => {
    expect(auditEventsQueryKey(base, 'c1')).not.toEqual(auditEventsQueryKey(base, 'c2'));
  });
});
