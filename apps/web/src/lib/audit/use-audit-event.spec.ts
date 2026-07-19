import { classifyAuditDetailError } from './use-audit-event';
import { auditEventQueryKey } from './audit-query-keys';

describe('P2-8C — detail error classification', () => {
  it('403 → unauthorized, 404 → concealed, else → error', () => {
    expect(classifyAuditDetailError({ response: { status: 403 } })).toBe('unauthorized');
    expect(classifyAuditDetailError({ response: { status: 404 } })).toBe('concealed');
    expect(classifyAuditDetailError({ response: { status: 500 } })).toBe('error');
    expect(classifyAuditDetailError(new Error('network'))).toBe('error');
    expect(classifyAuditDetailError(null)).toBe('error');
  });
});

describe('P2-8C — detail query key', () => {
  it('includes id and separates base vs PHI caches', () => {
    expect(auditEventQueryKey('e1', false)).toEqual(['audit-event', 'e1', 'base']);
    expect(auditEventQueryKey('e1', true)).toEqual(['audit-event', 'e1', 'phi']);
    expect(auditEventQueryKey('e1', false)).not.toEqual(auditEventQueryKey('e1', true));
    expect(auditEventQueryKey('e1', false)).not.toEqual(auditEventQueryKey('e2', false));
  });
});
