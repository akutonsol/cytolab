import { projectAuditEvent, projectAuditEventPhi, RawAuditEventRow } from './audit-query.projection';

const base = (over: Partial<RawAuditEventRow> = {}): RawAuditEventRow => ({
  id: 'evt1',
  occurredAt: new Date('2026-07-01T00:00:00Z'),
  recordedAt: new Date('2026-07-01T00:00:01Z'),
  sequence: 42n,
  schemaVersion: 1,
  eventVersion: 1,
  category: 'CONFIGURATION',
  severity: 'WARNING',
  phiIndicator: false,
  dataClass: 'INTERNAL',
  actorType: 'STAFF',
  actorId: 'u1',
  organizationScope: 'LAB',
  scopeLabId: 'lab1',
  requestId: 'req1',
  correlationId: 'corr1',
  ipAddress: '198.51.100.9',
  userAgent: 'Mozilla/5.0 secret-ua',
  deviceId: 'device-fp-abc',
  sessionId: 'sess1',
  resourceType: 'Lab',
  resourceId: 'lab1',
  patientRef: 'PSEUDOREFXYZ',
  actionCode: 'SETTING_CHANGED',
  outcome: 'SUCCESS',
  beforeHash: 'BEFOREHASHSENTINEL',
  afterHash: 'AFTERHASHSENTINEL',
  chainId: 'CHAINIDSENTINEL',
  prevHash: 'PREVHASHSENTINEL',
  selfHash: 'SELFHASHSENTINEL',
  hashAlgorithm: 'HASHALGOSENTINEL',
  producerModule: 'lab',
  metadata: { settingKey: 'company_profile', scope: 'lab' },
  ...over,
});

describe('P2-7A — audit-event projection (no leakage, PHI-safe, version-tolerant)', () => {
  it('base view never exposes hashes, chain internals, sequence, PII, or patientRef', () => {
    const v = projectAuditEvent(base({ userAgent: 'SECRETUASENTINEL', deviceId: 'DEVICEFPSENTINEL' }));
    const s = JSON.stringify(v);
    for (const forbidden of [
      'SELFHASHSENTINEL', 'PREVHASHSENTINEL', 'BEFOREHASHSENTINEL', 'AFTERHASHSENTINEL',
      'CHAINIDSENTINEL', 'HASHALGOSENTINEL', '198.51.100.9', 'SECRETUASENTINEL', 'DEVICEFPSENTINEL', 'PSEUDOREFXYZ',
    ]) {
      expect(s).not.toContain(forbidden);
    }
    for (const prop of ['selfHash', 'prevHash', 'chainId', 'sequence', 'hashAlgorithm', 'beforeHash', 'afterHash', 'ipAddress', 'userAgent', 'deviceId', 'patientRef']) {
      expect(v).not.toHaveProperty(prop);
    }
  });

  it('base view carries the allow-listed envelope', () => {
    const v = projectAuditEvent(base());
    expect(v).toMatchObject({
      id: 'evt1',
      category: 'CONFIGURATION',
      actionCode: 'SETTING_CHANGED',
      actor: { type: 'STAFF', id: 'u1' },
      organization: { scope: 'LAB', labId: 'lab1', organizationId: null },
      resource: { type: 'Lab', id: 'lab1' },
      request: { requestId: 'req1' },
      session: { sessionId: 'sess1' },
      producerModule: 'lab',
    });
  });

  it('a known non-PHI event includes its typed metadata', () => {
    const v = projectAuditEvent(base());
    expect(v.metadataStatus).toBe('included');
    expect(v.metadata).toEqual({ settingKey: 'company_profile', scope: 'lab' });
  });

  it('a known PHI-bearing event redacts metadata + patientRef in the base view', () => {
    const phiRow = base({
      category: 'PHI_ACCESS',
      actionCode: 'PATIENT_RECORD_VIEWED',
      phiIndicator: true,
      dataClass: 'PHI',
      metadata: { accessSurface: 'record_detail', accessMode: 'view', producerModule: 'records' },
    });
    const v = projectAuditEvent(phiRow);
    expect(v.metadataStatus).toBe('redacted_phi');
    expect(v.metadata).toBeNull();
    expect(v).not.toHaveProperty('patientRef');
  });

  it('the PHI projection exposes patientRef + PHI metadata (for an authorized caller)', () => {
    const phiRow = base({
      category: 'PHI_ACCESS',
      actionCode: 'PATIENT_RECORD_VIEWED',
      phiIndicator: true,
      metadata: { accessSurface: 'record_detail', accessMode: 'view', producerModule: 'records' },
    });
    const v = projectAuditEventPhi(phiRow);
    expect(v.patientRef).toBe('PSEUDOREFXYZ');
    expect(v.metadataStatus).toBe('included');
    expect(v.metadata).toMatchObject({ accessSurface: 'record_detail' });
  });

  it('an unknown event version redacts metadata and does NOT throw (page survives)', () => {
    const v = projectAuditEvent(base({ eventVersion: 999 }));
    expect(v.metadataStatus).toBe('redacted_unknown_version');
    expect(v.metadata).toBeNull();
    expect(v.eventVersion).toBe(999); // stored version preserved, not normalized
  });
});
