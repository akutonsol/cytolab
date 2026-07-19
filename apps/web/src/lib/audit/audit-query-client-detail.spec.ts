import { validateAuditEvent, AuditQueryResponseError, AuditQueryClient } from './audit-query-client';

jest.mock('../api', () => ({ api: { get: jest.fn() } }));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { api } = require('../api');

const valid = () => ({
  id: 'e1', occurredAt: '2026-07-18T11:00:00Z', recordedAt: '2026-07-18T11:00:01Z',
  schemaVersion: 1, eventVersion: 1, category: 'SECURITY', actionCode: 'X', severity: 'WARNING',
  dataClass: 'CONFIDENTIAL', phiIndicator: false, outcome: 'SUCCESS',
  actor: { type: 'STAFF', id: 'u1' }, organization: { scope: 'LAB', labId: 'lab1', organizationId: null },
  resource: { type: 'User', id: 'r1' }, request: { requestId: 'req1' }, session: { sessionId: null },
  correlationId: 'c1', producerModule: 'security', metadataStatus: 'included', metadata: { a: 1 },
});

describe('P2-8C — validateAuditEvent (symmetric with validateAuditEventPage)', () => {
  it('accepts a well-formed event', () => {
    expect(validateAuditEvent(valid()).id).toBe('e1');
  });

  it('accepts optional patientRef only when present', () => {
    expect(validateAuditEvent({ ...valid(), patientRef: 'PSEUDO1' }).patientRef).toBe('PSEUDO1');
    expect('patientRef' in validateAuditEvent(valid())).toBe(false);
    expect(() => validateAuditEvent({ ...valid(), patientRef: 5 })).toThrow(AuditQueryResponseError);
  });

  it('rejects malformed envelope fields', () => {
    expect(() => validateAuditEvent(null)).toThrow(AuditQueryResponseError);
    expect(() => validateAuditEvent({ ...valid(), id: 1 })).toThrow(AuditQueryResponseError);
    expect(() => validateAuditEvent({ ...valid(), schemaVersion: 'x' })).toThrow(AuditQueryResponseError);
    expect(() => validateAuditEvent({ ...valid(), phiIndicator: 'no' })).toThrow(AuditQueryResponseError);
    expect(() => validateAuditEvent({ ...valid(), metadataStatus: 'bogus' })).toThrow(AuditQueryResponseError);
    expect(() => validateAuditEvent({ ...valid(), metadata: 'x' })).toThrow(AuditQueryResponseError);
  });

  it('rejects malformed nested actor/org/resource/context', () => {
    expect(() => validateAuditEvent({ ...valid(), actor: { type: 'STAFF', id: 5 } })).toThrow(AuditQueryResponseError);
    expect(() => validateAuditEvent({ ...valid(), organization: { scope: 'LAB', labId: 1, organizationId: null } })).toThrow(AuditQueryResponseError);
    expect(() => validateAuditEvent({ ...valid(), resource: { type: 1, id: null } })).toThrow(AuditQueryResponseError);
    expect(() => validateAuditEvent({ ...valid(), request: { requestId: 5 } })).toThrow(AuditQueryResponseError);
    expect(() => validateAuditEvent({ ...valid(), correlationId: 5 })).toThrow(AuditQueryResponseError);
  });
});

describe('P2-8C — AuditQueryClient.getById', () => {
  beforeEach(() => (api.get as jest.Mock).mockReset());

  it('encodes the id and omits includePhi in base mode', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: valid() });
    await AuditQueryClient.getById('a/b?c', false);
    expect(api.get).toHaveBeenCalledWith('/audit/events/a%2Fb%3Fc', { params: {} });
  });

  it('sets includePhi=true in PHI mode (base and PHI calls are distinct)', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: { ...valid(), patientRef: 'p' } });
    await AuditQueryClient.getById('e1', true);
    expect(api.get).toHaveBeenCalledWith('/audit/events/e1', { params: { includePhi: 'true' } });
  });
});
