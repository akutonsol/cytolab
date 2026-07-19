import {
  parseAuditFilters,
  serializeAuditFilters,
  filtersToApiParams,
  auditPredicateKey,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_MULTI_VALUES,
  AuditFilterState,
} from './audit-filters';

const sp = (q: string) => new URLSearchParams(q);

describe('P2-8B — audit filter parsing', () => {
  it('defaults page size and phi; ignores unknown params', () => {
    const f = parseAuditFilters(sp('foo=bar'));
    expect(f.pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(f.phi).toBe(false);
    expect(f.scope).toBeUndefined();
  });

  it('splits CSV multi-value filters, trims, drops empties, caps at 25', () => {
    const many = Array.from({ length: 40 }, (_, i) => `A${i}`).join(',');
    const f = parseAuditFilters(sp(`category=SECURITY, CONFIGURATION&action=${many}`));
    expect(f.category).toEqual(['SECURITY', 'CONFIGURATION']);
    expect(f.actionCode).toHaveLength(MAX_MULTI_VALUES);
  });

  it('maps scope from URL and reads phi=1', () => {
    expect(parseAuditFilters(sp('scope=system')).scope).toBe('SYSTEM');
    expect(parseAuditFilters(sp('scope=cross_lab')).scope).toBe('CROSS_LAB');
    expect(parseAuditFilters(sp('phi=1')).phi).toBe(true);
  });

  it('clamps page size to [1,100], defaulting invalid values', () => {
    expect(parseAuditFilters(sp('pageSize=1000')).pageSize).toBe(MAX_PAGE_SIZE);
    expect(parseAuditFilters(sp('pageSize=0')).pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(parseAuditFilters(sp('pageSize=x')).pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(parseAuditFilters(sp('pageSize=25')).pageSize).toBe(25);
  });
});

describe('P2-8B — serialize round-trip + defaults omitted', () => {
  it('round-trips through URL params', () => {
    const url = 'scope=system&category=SECURITY&action=SETTING_CHANGED&actorId=u1&pageSize=25&phi=1&from=2026-01-01T00:00:00Z';
    const parsed = parseAuditFilters(sp(url));
    const reparsed = parseAuditFilters(new URLSearchParams(serializeAuditFilters(parsed)));
    expect(reparsed).toEqual(parsed);
  });

  it('omits default page size and false phi', () => {
    const s: AuditFilterState = { pageSize: DEFAULT_PAGE_SIZE, phi: false };
    expect(serializeAuditFilters(s)).toEqual({});
  });
});

describe('P2-8B — API param mapping (allow-listed only)', () => {
  it('maps only allow-listed fields, lowercases scope, joins CSV, sets includePhi', () => {
    const s: AuditFilterState = {
      scope: 'CROSS_LAB', labIds: ['a', 'b'], category: ['SECURITY'], actionCode: ['X', 'Y'],
      actorType: 'STAFF', actorId: 'u1', resourceType: 'User', resourceId: 'r1', outcome: 'SUCCESS',
      correlationId: 'c1', timeFrom: '2026-01-01T00:00:00Z', timeTo: '2026-01-02T00:00:00Z', pageSize: 25, phi: true,
    };
    expect(filtersToApiParams(s)).toEqual({
      pageSize: '25', scope: 'cross_lab', labIds: 'a,b', category: 'SECURITY', actionCode: 'X,Y',
      actorType: 'STAFF', actorId: 'u1', resourceType: 'User', resourceId: 'r1', outcome: 'SUCCESS',
      correlationId: 'c1', timeFrom: '2026-01-01T00:00:00Z', timeTo: '2026-01-02T00:00:00Z', includePhi: 'true',
    });
  });

  it('omits includePhi when phi is false and never emits unknown keys', () => {
    const p = filtersToApiParams({ pageSize: 50, phi: false });
    expect(p.includePhi).toBeUndefined();
    expect(Object.keys(p)).toEqual(['pageSize']);
  });
});

describe('P2-8B — predicate key', () => {
  it('changes when any predicate changes and is cursor-independent', () => {
    const base: AuditFilterState = { pageSize: 50, phi: false };
    const k = auditPredicateKey(base);
    expect(auditPredicateKey({ ...base, phi: true })).not.toBe(k);
    expect(auditPredicateKey({ ...base, category: ['SECURITY'] })).not.toBe(k);
    expect(auditPredicateKey({ ...base, scope: 'SYSTEM' })).not.toBe(k);
    expect(auditPredicateKey({ ...base })).toBe(k);
  });
});
