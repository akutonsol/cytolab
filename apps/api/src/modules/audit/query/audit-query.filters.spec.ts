import { BadRequestException } from '@nestjs/common';
import {
  validateAuditQueryFilters,
  DEFAULT_LOOKBACK_MS,
  MAX_LOOKBACK_MS,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_FILTER_VALUES,
} from './audit-query.filters';

const NOW = new Date('2026-07-18T12:00:00Z');

describe('P2-7A — audit-query filter contract', () => {
  it('defaults to the last 24h and page size 50 when unspecified', () => {
    const f = validateAuditQueryFilters({}, NOW);
    expect(f.timeTo).toEqual(NOW);
    expect(f.timeFrom).toEqual(new Date(NOW.getTime() - DEFAULT_LOOKBACK_MS));
    expect(f.pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it('rejects timeFrom after timeTo', () => {
    expect(() => validateAuditQueryFilters({ timeFrom: '2026-07-18T13:00:00Z', timeTo: '2026-07-18T12:00:00Z' }, NOW)).toThrow(BadRequestException);
  });

  it('rejects a range beyond the 31-day maximum', () => {
    const from = new Date(NOW.getTime() - MAX_LOOKBACK_MS - 1000);
    expect(() => validateAuditQueryFilters({ timeFrom: from, timeTo: NOW }, NOW)).toThrow(BadRequestException);
  });

  it('accepts a range exactly at the maximum', () => {
    const from = new Date(NOW.getTime() - MAX_LOOKBACK_MS);
    expect(validateAuditQueryFilters({ timeFrom: from, timeTo: NOW }, NOW).timeFrom).toEqual(from);
  });

  it('rejects an invalid date', () => {
    expect(() => validateAuditQueryFilters({ timeFrom: 'not-a-date' }, NOW)).toThrow(BadRequestException);
  });

  it('clamps page size to the maximum and floors invalid sizes to the default', () => {
    expect(validateAuditQueryFilters({ pageSize: 1000 }, NOW).pageSize).toBe(MAX_PAGE_SIZE);
    expect(validateAuditQueryFilters({ pageSize: 0 }, NOW).pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(validateAuditQueryFilters({ pageSize: -5 }, NOW).pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it('bounds multi-value filters and drops empty arrays', () => {
    const many = Array.from({ length: MAX_FILTER_VALUES + 1 }, (_, i) => `A${i}`);
    expect(() => validateAuditQueryFilters({ actionCode: many }, NOW)).toThrow(BadRequestException);
    expect(validateAuditQueryFilters({ actionCode: [] }, NOW).actionCode).toBeUndefined();
    expect(validateAuditQueryFilters({ category: ['SECURITY'] as any }, NOW).category).toEqual(['SECURITY']);
  });

  it('passes through allow-listed scalar filters', () => {
    const f = validateAuditQueryFilters(
      { actorType: 'STAFF' as any, actorId: 'u1', resourceType: 'User', resourceId: 'x', outcome: 'SUCCESS' as any, correlationId: 'c1' },
      NOW,
    );
    expect(f).toMatchObject({ actorType: 'STAFF', actorId: 'u1', resourceType: 'User', resourceId: 'x', outcome: 'SUCCESS', correlationId: 'c1' });
  });
});
