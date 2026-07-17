import {
  allRegistryEntries,
  exactKey,
  isRegisteredAuditEvent,
  resolveCurrent,
  resolveExact,
  UnknownAuditEventError,
  UnknownAuditEventVersionError,
} from './audit.registry';
import { canonicalize } from './audit-canonicalization';

describe('audit registry — current resolution', () => {
  it('resolves a seeded entry at its declared current version', () => {
    const entry = resolveCurrent('PHI_ACCESS', 'PATIENT_RECORD_VIEWED');
    expect(entry.eventVersion).toBe(1);
    expect(entry.attributionPolicy).toBe('HTTP_REQUEST');
    expect(entry.metadataContractId).toBe('phi.access.v2'); // P2-5B: v2 bounded-enum contract
  });

  it('throws for an unregistered (category, actionCode)', () => {
    expect(() => resolveCurrent('SECURITY', 'NOT_A_REAL_EVENT')).toThrow(
      UnknownAuditEventError,
    );
    expect(isRegisteredAuditEvent('SECURITY', 'NOT_A_REAL_EVENT')).toBe(false);
  });

  it('exact identity keys (category, actionCode, eventVersion) are unique', () => {
    const keys = allRegistryEntries().map((e) =>
      exactKey(e.category, e.actionCode, e.eventVersion),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  describe('P2-5B PHI-access taxonomy', () => {
    const phiEvents = ['PATIENT_RECORD_VIEWED', 'PATIENT_LIST_QUERIED', 'PHI_EXPORTED'];

    it('all three PHI-access events are registered, OPERATIONAL, PHI, PERMANENT, phi.access.v2', () => {
      for (const action of phiEvents) {
        const e = resolveCurrent('PHI_ACCESS', action);
        expect(e.durabilityClass).toBe('OPERATIONAL'); // truthful for non-transactional reads
        expect(e.phiIndicator).toBe(true);
        expect(e.dataClass).toBe('PHI');
        expect(e.retentionClass).toBe('PERMANENT');
        expect(e.metadataContractId).toBe('phi.access.v2');
        expect(e.attributionPolicy).toBe('HTTP_REQUEST');
      }
    });

    it('PATIENT_RECORD_VIEWED is no longer CRITICAL_TRANSACTIONAL', () => {
      expect(resolveCurrent('PHI_ACCESS', 'PATIENT_RECORD_VIEWED').durabilityClass).not.toBe(
        'CRITICAL_TRANSACTIONAL',
      );
    });

    it('PHI_EXPORTED carries a WARNING severity', () => {
      expect(resolveCurrent('PHI_ACCESS', 'PHI_EXPORTED').defaultSeverity).toBe('WARNING');
    });
  });

  it('the governed-maintenance event carries GOVERNED_MAINTENANCE attribution', () => {
    const entry = resolveCurrent('DATA_MAINTENANCE', 'GOVERNED_DELETION_EXECUTED');
    expect(entry.attributionPolicy).toBe('GOVERNED_MAINTENANCE');
    expect(entry.durabilityClass).toBe('CRITICAL_TRANSACTIONAL');
  });
});

describe('audit registry — version-aware resolution', () => {
  it('resolves version 1 exactly', () => {
    const v1 = resolveExact('DATA_EXPORT', 'EVIDENCE_EXPORTED', 1);
    expect(v1.eventVersion).toBe(1);
    expect(v1.defaultSeverity).toBe('WARNING');
  });

  it('declares version 2 as current while version 1 remains resolvable', () => {
    // Current is DECLARED as v2 (semantic evolution: severity raised to CRITICAL)...
    const current = resolveCurrent('DATA_EXPORT', 'EVIDENCE_EXPORTED');
    expect(current.eventVersion).toBe(2);
    expect(current.defaultSeverity).toBe('CRITICAL');
    // ...but the superseded v1 definition is NOT overwritten and still resolves.
    const v1 = resolveExact('DATA_EXPORT', 'EVIDENCE_EXPORTED', 1);
    expect(v1.eventVersion).toBe(1);
    expect(v1.defaultSeverity).toBe('WARNING');
  });

  it('fails closed on an unknown version', () => {
    expect(() => resolveExact('DATA_EXPORT', 'EVIDENCE_EXPORTED', 99)).toThrow(
      UnknownAuditEventVersionError,
    );
  });

  it('fails closed on an unknown event even at exact lookup', () => {
    expect(() => resolveExact('SECURITY', 'NOPE', 1)).toThrow(UnknownAuditEventError);
  });
});

describe('canonicalization foundation (P2-4 prep — no hashing here)', () => {
  it('is order-independent for the same scalar map', () => {
    const a = canonicalize({ b: 2, a: 1, c: null });
    const b = canonicalize({ c: null, a: 1, b: 2 });
    expect(a).toBe(b);
  });

  it('drops undefined and rejects nested structures', () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe('a=1');
    expect(() => canonicalize({ a: { nested: 1 } as any })).toThrow();
  });
});
