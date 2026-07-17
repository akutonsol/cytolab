import { AuditCanonicalFields, buildCanonicalObject, computeSelfHash } from './audit-hash';
import { AUDIT_HASH_ALGORITHM, GENESIS_PREV_HASH, GENESIS_SEQUENCE } from './audit-chain';

function sampleFields(over: Partial<AuditCanonicalFields> = {}): AuditCanonicalFields {
  return {
    id: 'evt-1',
    occurredAt: new Date('2026-07-18T10:00:00.000Z'),
    recordedAt: new Date('2026-07-18T10:00:00.500Z'),
    schemaVersion: 1,
    eventVersion: 1,
    category: 'RECORD_LIFECYCLE',
    actionCode: 'RECORD_CREATED',
    detailCode: null,
    severity: 'NOTICE',
    phiIndicator: false,
    dataClass: 'CONFIDENTIAL',
    retentionClass: 'EXTENDED',
    durabilityClass: 'OPERATIONAL',
    actorType: 'STAFF',
    actorId: 'u1',
    onBehalfOfActorId: null,
    servicePrincipal: null,
    organizationScope: 'LAB',
    scopeLabId: 'lab-1',
    organizationId: null,
    resourceType: 'Record',
    resourceId: 'rec-1',
    resourceLabId: null,
    parentResourceType: null,
    parentResourceId: null,
    patientRef: null,
    outcome: 'SUCCESS',
    statusCode: null,
    errorCode: null,
    reasonCode: null,
    changedFields: [],
    beforeHash: null,
    afterHash: null,
    producerModule: 'records',
    executionId: null,
    hashAlgorithm: AUDIT_HASH_ALGORITHM,
    metadata: null,
    sequence: GENESIS_SEQUENCE,
    chainId: 'lab:lab-1',
    prevHash: GENESIS_PREV_HASH,
    ...over,
  };
}

describe('computeSelfHash (P2-4B) — SHA-256 output', () => {
  it('returns lowercase hex, 64 chars', () => {
    expect(computeSelfHash(sampleFields())).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is stable across repeated calls with identical input', () => {
    expect(computeSelfHash(sampleFields())).toBe(computeSelfHash(sampleFields()));
  });

  it('changes when any participating field changes', () => {
    const base = computeSelfHash(sampleFields());
    expect(computeSelfHash(sampleFields({ actionCode: 'RECORD_UPDATED' }))).not.toBe(base);
    expect(computeSelfHash(sampleFields({ sequence: 2n }))).not.toBe(base);
    expect(computeSelfHash(sampleFields({ prevHash: 'a'.repeat(64) }))).not.toBe(base);
    expect(computeSelfHash(sampleFields({ chainId: 'lab:other' }))).not.toBe(base);
  });

  it('distinguishes null from empty string (null is preserved, not coerced)', () => {
    expect(computeSelfHash(sampleFields({ detailCode: null }))).not.toBe(
      computeSelfHash(sampleFields({ detailCode: '' })),
    );
  });
});

describe('computeSelfHash — determinism guarantees', () => {
  it('is invariant to metadata key insertion order', () => {
    const a = computeSelfHash(sampleFields({ metadata: { settingKey: 'X', scope: 'lab' } }));
    const b = computeSelfHash(sampleFields({ metadata: { scope: 'lab', settingKey: 'X' } }));
    expect(a).toBe(b);
  });

  it('metadata content still affects the hash', () => {
    const a = computeSelfHash(sampleFields({ metadata: { settingKey: 'X' } }));
    const b = computeSelfHash(sampleFields({ metadata: { settingKey: 'Y' } }));
    expect(a).not.toBe(b);
  });

  it('is invariant to changedFields ordering (deterministically ordered)', () => {
    const a = computeSelfHash(sampleFields({ changedFields: ['status', 'urgent'] }));
    const b = computeSelfHash(sampleFields({ changedFields: ['urgent', 'status'] }));
    expect(a).toBe(b);
  });

  it('serializes timestamps deterministically (equal instants → equal hash)', () => {
    const a = computeSelfHash(sampleFields({ occurredAt: new Date('2026-07-18T10:00:00.000Z') }));
    const b = computeSelfHash(sampleFields({ occurredAt: new Date(Date.parse('2026-07-18T10:00:00.000Z')) }));
    expect(a).toBe(b);
    // a different millisecond changes the hash
    expect(computeSelfHash(sampleFields({ occurredAt: new Date('2026-07-18T10:00:00.001Z') }))).not.toBe(a);
  });
});

describe('buildCanonicalObject — field serialization', () => {
  it('serializes BigInt sequence as a decimal string', () => {
    expect(buildCanonicalObject(sampleFields({ sequence: 42n })).sequence).toBe('42');
  });

  it('serializes timestamps as UTC ISO-8601 with milliseconds', () => {
    const obj = buildCanonicalObject(sampleFields());
    expect(obj.occurredAt).toBe('2026-07-18T10:00:00.000Z');
    expect(obj.recordedAt).toBe('2026-07-18T10:00:00.500Z');
  });

  it('flattens metadata into namespaced scalar keys and excludes selfHash', () => {
    const obj = buildCanonicalObject(sampleFields({ metadata: { settingKey: 'X', scope: 'lab' } }));
    expect(obj['meta.settingKey']).toBe('X');
    expect(obj['meta.scope']).toBe('lab');
    expect('selfHash' in obj).toBe(false);
    // sequence, chainId, prevHash participate as ordinary fields
    expect(obj.chainId).toBe('lab:lab-1');
    expect(obj.prevHash).toBe(GENESIS_PREV_HASH);
  });

  it('deterministically orders changedFields', () => {
    expect(buildCanonicalObject(sampleFields({ changedFields: ['b', 'a'] })).changedFields).toBe(
      JSON.stringify(['a', 'b']),
    );
  });
});
