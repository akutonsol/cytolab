import { validateAuditEventPage, AuditQueryResponseError, AuditQueryClient } from './audit-query-client';
import { AuditFilterState } from './audit-filters';

jest.mock('../api', () => ({ api: { get: jest.fn() } }));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { api } = require('../api');

const goodItem = { id: 'e1', category: 'SECURITY', actor: { type: 'STAFF', id: 'u1' } };

describe('P2-8B — validateAuditEventPage', () => {
  it('accepts a well-formed page', () => {
    const page = validateAuditEventPage({ items: [goodItem], nextCursor: 'c1', effective: {} });
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBe('c1');
  });

  it('accepts a null cursor and empty items', () => {
    expect(validateAuditEventPage({ items: [], nextCursor: null }).items).toEqual([]);
  });

  it('rejects malformed shapes (fail visibly, never guess)', () => {
    expect(() => validateAuditEventPage(null)).toThrow(AuditQueryResponseError);
    expect(() => validateAuditEventPage({ items: 'x' })).toThrow(AuditQueryResponseError);
    expect(() => validateAuditEventPage({ items: [], nextCursor: 5 })).toThrow(AuditQueryResponseError);
    expect(() => validateAuditEventPage({ items: [{ id: 1 }], nextCursor: null })).toThrow(AuditQueryResponseError);
  });
});

describe('P2-8B — AuditQueryClient.list', () => {
  beforeEach(() => (api.get as jest.Mock).mockReset());

  it('calls GET /audit/events with allow-listed params + cursor and validates the response', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: { items: [goodItem], nextCursor: null } });
    const state: AuditFilterState = { scope: 'SYSTEM', pageSize: 25, phi: true };
    const page = await AuditQueryClient.list(state, 'cur1');
    expect(api.get).toHaveBeenCalledWith('/audit/events', {
      params: { pageSize: '25', scope: 'system', includePhi: 'true', cursor: 'cur1' },
    });
    expect(page.items).toHaveLength(1);
  });

  it('omits the cursor param on the first page', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: { items: [], nextCursor: null } });
    await AuditQueryClient.list({ pageSize: 50, phi: false }, null);
    expect((api.get as jest.Mock).mock.calls[0][1].params.cursor).toBeUndefined();
  });
});
