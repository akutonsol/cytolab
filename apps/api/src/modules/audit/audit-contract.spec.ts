import {
  AuditPersistenceService,
  AuditPlatformFieldError,
} from './audit-persistence.service';
import { AuditRecordInput } from './audit.contract';
import { AuditScopeError, AuditChangeEvidenceError } from './audit-validation';
import { InvalidAuditMetadataError } from './audit-metadata';
import { UnknownAuditEventError } from './audit.registry';

/**
 * Program 2 · P2-1 — contract & validation boundary tests. `buildCreateData` is pure
 * (no DB), so the service is constructed with a null Prisma client.
 */
// buildCreateData is pure (no DB, no chain) — both deps are unused here.
const svc = new AuditPersistenceService(null as any, null as any);

const base: AuditRecordInput = {
  category: 'AUTHENTICATION',
  action: { code: 'LOGIN_SUCCEEDED' },
  actor: { type: 'STAFF', id: 'user-1' },
  organization: { scope: 'LAB', labId: 'lab-1' },
  resource: { type: 'Session' },
  outcome: { status: 'SUCCESS' },
  producerModule: 'auth',
};

describe('AuditRecordInput → persistence mapping', () => {
  it('resolves platform-owned classification from the registry, not the producer', () => {
    const data = svc.buildCreateData({
      ...base,
      category: 'PHI_ACCESS',
      action: { code: 'PATIENT_RECORD_VIEWED' },
      resource: { type: 'Record', id: 'rec-1', patientRef: 'pt_opaque_123' },
      metadata: { accessSurface: 'record_detail', accessMode: 'view', producerModule: 'records' },
    });
    // registry-resolved fields
    expect(data.eventVersion).toBe(1);
    expect(data.severity).toBe('NOTICE');
    expect(data.phiIndicator).toBe(true);
    expect(data.dataClass).toBe('PHI');
    expect(data.retentionClass).toBe('PERMANENT');
    expect(data.durabilityClass).toBe('OPERATIONAL'); // P2-5B: reclassified from CRITICAL_TRANSACTIONAL
    // schema version is owner-owned
    expect(data.schemaVersion).toBe(1);
    // producer never sets sequence / integrity — they are absent (null-at-DB)
    expect((data as any).sequence).toBeUndefined();
    expect((data as any).selfHash).toBeUndefined();
  });

  it('defaults occurredAt to now when omitted and honors an earlier fact time', () => {
    const withoutTime = svc.buildCreateData(base);
    expect(withoutTime.occurredAt).toBeInstanceOf(Date);
    const earlier = new Date('2020-01-01T00:00:00Z');
    const withTime = svc.buildCreateData({ ...base, occurredAt: earlier });
    expect(withTime.occurredAt).toBe(earlier);
  });

  it('resolves the CURRENT event version rather than any producer-supplied version', () => {
    // EVIDENCE_EXPORTED is declared current at v2; append must stamp v2, never v1, and the
    // producer has no field to request a version.
    const data = svc.buildCreateData({
      ...base,
      category: 'DATA_EXPORT',
      action: { code: 'EVIDENCE_EXPORTED' },
      organization: { scope: 'LAB', labId: 'lab-1' },
    });
    expect(data.eventVersion).toBe(2);
    expect(data.severity).toBe('CRITICAL');
  });

  it('rejects an unregistered event (no inventing strings)', () => {
    expect(() =>
      svc.buildCreateData({ ...base, action: { code: 'NOT_REGISTERED' } }),
    ).toThrow(UnknownAuditEventError);
  });

  it('rejects a producer attempt to supply a platform-owned field', () => {
    for (const field of ['eventId', 'sequence', 'schemaVersion', 'selfHash']) {
      expect(() =>
        svc.buildCreateData({ ...base, [field]: 'x' } as any),
      ).toThrow(AuditPlatformFieldError);
    }
  });

  it('treats request and session as optional', () => {
    const data = svc.buildCreateData(base);
    expect(data.requestId).toBeNull();
    expect(data.sessionId).toBeNull();
    const enriched = svc.buildCreateData({
      ...base,
      request: { requestId: 'req-9', ipAddress: '10.0.0.1' },
      session: { sessionId: 'sess-9', sessionKind: 'staff' },
    });
    expect(enriched.requestId).toBe('req-9');
    expect(enriched.sessionId).toBe('sess-9');
  });
});

describe('organization scope invariants', () => {
  it('LAB requires a labId', () => {
    expect(() =>
      svc.buildCreateData({ ...base, organization: { scope: 'LAB' } }),
    ).toThrow(AuditScopeError);
  });

  it('SYSTEM rejects a labId (no sentinel tenant)', () => {
    // A registered event (scope is orthogonal to category) driven with a SYSTEM scope that
    // wrongly carries a labId. Registry resolves first, then scope validation rejects it.
    expect(() =>
      svc.buildCreateData({
        ...base,
        category: 'DATA_MAINTENANCE',
        action: { code: 'GOVERNED_DELETION_EXECUTED' },
        organization: { scope: 'SYSTEM', labId: 'lab-1' },
      }),
    ).toThrow(AuditScopeError);
  });

  it('CROSS_LAB rejects a labId and maps with a null scopeLabId', () => {
    expect(() =>
      svc.buildCreateData({
        ...base,
        category: 'CONFIGURATION',
        action: { code: 'LAB_FEATURE_TOGGLED' },
        organization: { scope: 'CROSS_LAB', labId: 'lab-1' },
      }),
    ).toThrow(AuditScopeError);

    const ok = svc.buildCreateData({
      ...base,
      category: 'CONFIGURATION',
      action: { code: 'LAB_FEATURE_TOGGLED' },
      organization: { scope: 'CROSS_LAB' },
    });
    expect(ok.organizationScope).toBe('CROSS_LAB');
    expect(ok.scopeLabId).toBeNull();
  });
});

describe('change evidence is names + hashes only', () => {
  it('accepts bare field names and SHA-256 hashes', () => {
    const data = svc.buildCreateData({
      ...base,
      category: 'RECORD_LIFECYCLE',
      action: { code: 'RECORD_STATUS_CHANGED' },
      metadata: { fromStatus: 'Pending', toStatus: 'Completed' },
      change: {
        changedFields: ['status', 'resultSheet.state'],
        beforeHash: 'a'.repeat(64),
        afterHash: 'b'.repeat(64),
      },
    });
    expect(data.changedFields).toEqual(['status', 'resultSheet.state']);
  });

  it('rejects value-bearing changed fields', () => {
    expect(() =>
      svc.buildCreateData({
        ...base,
        change: { changedFields: ['diagnosis: cancer'] },
      }),
    ).toThrow(AuditChangeEvidenceError);
  });

  it('rejects a non-hash before/after value', () => {
    expect(() =>
      svc.buildCreateData({
        ...base,
        change: { changedFields: ['status'], beforeHash: 'Pending' },
      }),
    ).toThrow(AuditChangeEvidenceError);
  });
});

describe('typed, bounded metadata', () => {
  it('rejects metadata on an event that declares none', () => {
    expect(() =>
      svc.buildCreateData({ ...base, metadata: { foo: 'bar' } }),
    ).toThrow(InvalidAuditMetadataError);
  });

  it('rejects an undeclared key', () => {
    expect(() =>
      svc.buildCreateData({
        ...base,
        category: 'PHI_ACCESS',
        action: { code: 'PATIENT_RECORD_VIEWED' },
        resource: { type: 'Record', id: 'r1' },
        metadata: { accessSurface: 'record_detail', accessMode: 'view', producerModule: 'records', notes: 'freeform' },
      }),
    ).toThrow(InvalidAuditMetadataError);
  });

  it('rejects a value outside the bounded enum (e.g. a raw search term)', () => {
    expect(() =>
      svc.buildCreateData({
        ...base,
        category: 'PHI_ACCESS',
        action: { code: 'PATIENT_RECORD_VIEWED' },
        resource: { type: 'Record', id: 'r1' },
        metadata: { accessSurface: 'contact patient at jane.doe@example.com', accessMode: 'view', producerModule: 'records' },
      }),
    ).toThrow(InvalidAuditMetadataError);
  });

  it('rejects a missing required key', () => {
    expect(() =>
      svc.buildCreateData({
        ...base,
        category: 'RECORD_LIFECYCLE',
        action: { code: 'RECORD_STATUS_CHANGED' },
        metadata: { fromStatus: 'Pending' }, // toStatus missing
      }),
    ).toThrow(InvalidAuditMetadataError);
  });
});
