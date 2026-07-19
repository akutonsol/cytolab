import { resolveCurrent, resolveExact } from '../audit.registry';
import { validateMetadata, InvalidAuditMetadataError, AuditMetadataValue } from '../audit-metadata';

/**
 * P2-9A — the governed export action + its closed metadata contract. The action records the FACT of
 * export (non-PHI); PHI is expressed by the `projection` value, never a separate action or a `phi` key.
 */
describe('P2-9A registry — DATA_EXPORT:AUDIT_EXPORTED', () => {
  it('resolves at current version 1 with the frozen classification', () => {
    const e = resolveCurrent('DATA_EXPORT', 'AUDIT_EXPORTED');
    expect(e.eventVersion).toBe(1);
    expect(e.defaultSeverity).toBe('WARNING');
    expect(e.phiIndicator).toBe(false);
    expect(e.dataClass).toBe('CONFIDENTIAL');
    expect(e.retentionClass).toBe('PERMANENT');
    expect(e.durabilityClass).toBe('CRITICAL_TRANSACTIONAL');
    expect(e.attributionPolicy).toBe('HTTP_REQUEST');
    expect(e.metadataContractId).toBe('data_export.audit_export.v1');
  });

  it('does not disturb the pre-existing DATA_EXPORT:EVIDENCE_EXPORTED (still current v2)', () => {
    expect(resolveCurrent('DATA_EXPORT', 'EVIDENCE_EXPORTED').eventVersion).toBe(2);
    expect(resolveExact('DATA_EXPORT', 'EVIDENCE_EXPORTED', 1).eventVersion).toBe(1); // history intact
  });
});

describe('P2-9A metadata — data_export.audit_export.v1', () => {
  const base = (): AuditMetadataValue => ({
    projection: 'base',
    format: 'csv',
    queryScope: 'LAB',
    exportedCount: 3,
    truncated: false,
    cap: 10000,
    filterClass: 'none',
  });

  it('accepts a valid base payload', () => {
    expect(validateMetadata('data_export.audit_export.v1', base())).toEqual(base());
  });

  it('accepts a valid PHI + CROSS_LAB payload with selectedLabCount', () => {
    const v: AuditMetadataValue = { ...base(), projection: 'phi', format: 'ndjson', queryScope: 'CROSS_LAB', selectedLabCount: 4, truncated: true, filterClass: 'multi_dimension' };
    expect(validateMetadata('data_export.audit_export.v1', v)).toEqual(v);
  });

  it.each([
    ['undeclared key phi (single source of truth is projection)', { ...base(), phi: true }],
    ['undeclared key rawFilters', { ...base(), rawFilters: 'category=SECURITY' }],
    ['undeclared key labIds', { ...base(), labIds: 'lab-1' }],
    ['invalid projection enum', { ...base(), projection: 'full' }],
    ['invalid format enum', { ...base(), format: 'xlsx' }],
    ['invalid queryScope enum', { ...base(), queryScope: 'ALL' }],
    ['invalid filterClass enum', { ...base(), filterClass: 'everything' }],
    ['negative exportedCount', { ...base(), exportedCount: -1 }],
    ['cap below 1', { ...base(), cap: 0 }],
    ['non-integer cap', { ...base(), cap: 1.5 }],
    ['non-scalar (array smuggling)', { ...base(), filterClass: ['none'] as unknown as string }],
  ])('rejects %s', (_label, payload) => {
    expect(() => validateMetadata('data_export.audit_export.v1', payload as AuditMetadataValue)).toThrow(InvalidAuditMetadataError);
  });

  it.each(['projection', 'format', 'queryScope', 'exportedCount', 'truncated', 'cap', 'filterClass'])(
    'rejects a payload missing required key %s',
    (key) => {
      const v = base() as Record<string, unknown>;
      delete v[key];
      expect(() => validateMetadata('data_export.audit_export.v1', v as AuditMetadataValue)).toThrow(InvalidAuditMetadataError);
    },
  );
});
