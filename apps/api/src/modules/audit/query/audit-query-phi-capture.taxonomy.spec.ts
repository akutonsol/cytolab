import { validateMetadata, InvalidAuditMetadataError } from '../audit-metadata';
import { resolveCurrent } from '../audit.registry';

/**
 * Program 2 · P2-7C — taxonomy + metadata conformance for the PHI audit-query read-capture event.
 */
describe('P2-7C — SECURITY:AUDIT_EVENT_PHI_ACCESSED registry entry', () => {
  it('is registered once, v1, non-PHI, CONFIDENTIAL, PERMANENT, CRITICAL_TRANSACTIONAL, HTTP_REQUEST', () => {
    const e = resolveCurrent('SECURITY', 'AUDIT_EVENT_PHI_ACCESSED');
    expect(e.eventVersion).toBe(1);
    expect(e.phiIndicator).toBe(false); // records the FACT of access — carries no PHI itself
    expect(e.dataClass).toBe('CONFIDENTIAL');
    expect(e.retentionClass).toBe('PERMANENT');
    expect(e.durabilityClass).toBe('CRITICAL_TRANSACTIONAL'); // fail-closed
    expect(e.attributionPolicy).toBe('HTTP_REQUEST');
    expect(e.metadataContractId).toBe('security.audit_event_phi_access.v1');
  });
});

describe('P2-7C — security.audit_event_phi_access.v1 metadata contract', () => {
  const C = 'security.audit_event_phi_access.v1';

  it('accepts a list payload (incl. resultCount 0) and a detail payload', () => {
    expect(validateMetadata(C, { accessMode: 'list', queryScope: 'LAB', resultCount: 0 })).toBeTruthy();
    expect(validateMetadata(C, { accessMode: 'list', queryScope: 'CROSS_LAB', resultCount: 3, selectedLabCount: 2, pageSize: 50, hasMore: true })).toBeTruthy();
    expect(validateMetadata(C, { accessMode: 'detail', queryScope: 'SYSTEM', resultCount: 1 })).toBeTruthy();
  });

  it('requires accessMode/queryScope/resultCount and enforces enums + non-negative integer count', () => {
    expect(() => validateMetadata(C, { queryScope: 'LAB', resultCount: 1 } as any)).toThrow(InvalidAuditMetadataError);
    expect(() => validateMetadata(C, { accessMode: 'list', resultCount: 1 } as any)).toThrow(InvalidAuditMetadataError);
    expect(() => validateMetadata(C, { accessMode: 'list', queryScope: 'LAB' } as any)).toThrow(InvalidAuditMetadataError);
    expect(() => validateMetadata(C, { accessMode: 'export', queryScope: 'LAB', resultCount: 1 } as any)).toThrow(InvalidAuditMetadataError);
    expect(() => validateMetadata(C, { accessMode: 'list', queryScope: 'ALL', resultCount: 1 } as any)).toThrow(InvalidAuditMetadataError);
    expect(() => validateMetadata(C, { accessMode: 'list', queryScope: 'LAB', resultCount: -1 })).toThrow(InvalidAuditMetadataError);
    expect(() => validateMetadata(C, { accessMode: 'list', queryScope: 'LAB', resultCount: 1.5 })).toThrow(InvalidAuditMetadataError);
  });

  it('rejects any PHI / raw-value / undeclared key', () => {
    const bads = [
      { patientRef: 'x' },
      { labIds: 'lab1,lab2' },
      { cursor: 'abc' },
      { ipAddress: '1.2.3.4' },
      { email: 'a@b.co' },
      { token: 't' },
      { filterValues: 'status=DONE' },
      { eventMetadata: 'x' },
      { anything: 'else' },
    ];
    for (const bad of bads) {
      expect(() => validateMetadata(C, { accessMode: 'list', queryScope: 'LAB', resultCount: 1, ...bad } as any)).toThrow(InvalidAuditMetadataError);
    }
  });
});
