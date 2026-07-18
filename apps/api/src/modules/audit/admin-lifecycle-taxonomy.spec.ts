import { validateMetadata, InvalidAuditMetadataError, ADMIN_STATE_KEYS } from './audit-metadata';
import { resolveCurrent } from './audit.registry';

/**
 * Program 2 · P2-6C — conformance for the administrative-lifecycle taxonomy (registry + metadata),
 * proving the frozen P2-6B classification is registered exactly and the admin.state_change.v1
 * contract admits only bounded, value-free payloads.
 */
describe('P2-6C — admin.state_change.v1 metadata contract', () => {
  it('accepts a bounded state transition (stateKey + before/after booleans)', () => {
    expect(
      validateMetadata('admin.state_change.v1', { stateKey: 'account_active', previousValue: true, newValue: false }),
    ).toEqual({ stateKey: 'account_active', previousValue: true, newValue: false });
  });

  it('accepts every approved state key', () => {
    for (const stateKey of ADMIN_STATE_KEYS) {
      expect(validateMetadata('admin.state_change.v1', { stateKey, newValue: true })).toBeTruthy();
    }
  });

  it('requires newValue and stateKey', () => {
    expect(() => validateMetadata('admin.state_change.v1', { stateKey: 'client_active' } as any)).toThrow(InvalidAuditMetadataError);
    expect(() => validateMetadata('admin.state_change.v1', { newValue: true } as any)).toThrow(InvalidAuditMetadataError);
  });

  it('rejects an unapproved state key and any undeclared/free-text key', () => {
    expect(() => validateMetadata('admin.state_change.v1', { stateKey: 'superuser', newValue: true } as any)).toThrow(InvalidAuditMetadataError);
    expect(() => validateMetadata('admin.state_change.v1', { stateKey: 'account_active', newValue: true, note: 'why' } as any)).toThrow(InvalidAuditMetadataError);
  });

  it('rejects non-boolean transition values (no smuggling names/values)', () => {
    expect(() => validateMetadata('admin.state_change.v1', { stateKey: 'account_active', newValue: 'Jane Doe' } as any)).toThrow(InvalidAuditMetadataError);
  });
});

describe('P2-6C — registry classification matches frozen P2-6B taxonomy', () => {
  const expected = {
    ENTITY_CREATED: { defaultSeverity: 'NOTICE', dataClass: 'CONFIDENTIAL', retentionClass: 'EXTENDED', metadataContractId: null },
    ENTITY_UPDATED: { defaultSeverity: 'INFO', dataClass: 'CONFIDENTIAL', retentionClass: 'EXTENDED', metadataContractId: null },
    ENTITY_STATE_CHANGED: { defaultSeverity: 'NOTICE', dataClass: 'CONFIDENTIAL', retentionClass: 'EXTENDED', metadataContractId: 'admin.state_change.v1' },
    ENTITY_DELETED: { defaultSeverity: 'WARNING', dataClass: 'CONFIDENTIAL', retentionClass: 'PERMANENT', metadataContractId: null },
  } as const;

  for (const [actionCode, exp] of Object.entries(expected)) {
    it(`ADMINISTRATIVE:${actionCode} is OPERATIONAL, non-PHI, HTTP_REQUEST, v1`, () => {
      const entry = resolveCurrent('ADMINISTRATIVE', actionCode);
      expect(entry.eventVersion).toBe(1);
      expect(entry.durabilityClass).toBe('OPERATIONAL');
      expect(entry.phiIndicator).toBe(false);
      expect(entry.attributionPolicy).toBe('HTTP_REQUEST');
      expect(entry.defaultSeverity).toBe(exp.defaultSeverity);
      expect(entry.dataClass).toBe(exp.dataClass);
      expect(entry.retentionClass).toBe(exp.retentionClass);
      expect(entry.metadataContractId).toBe(exp.metadataContractId);
    });
  }
});
