import { BadRequestException } from '@nestjs/common';
import { encodeAuditCursor, decodeAuditCursor, AUDIT_QUERY_ORDER_BY } from './audit-query.cursor';

describe('P2-7A — audit-query cursor', () => {
  it('round-trips recordedAt + id and is opaque (base64url, no plaintext ordering field)', () => {
    const c = { recordedAt: new Date('2026-07-18T12:00:00.123Z'), id: 'evt_abc' };
    const token = encodeAuditCursor(c);
    expect(token).not.toContain('recordedAt');
    expect(token).not.toMatch(/[^A-Za-z0-9\-_]/); // base64url alphabet only
    expect(decodeAuditCursor(token)).toEqual(c);
  });

  it('treats null/undefined/empty as "no cursor"', () => {
    expect(decodeAuditCursor(null)).toBeNull();
    expect(decodeAuditCursor(undefined)).toBeNull();
    expect(decodeAuditCursor('')).toBeNull();
  });

  it('rejects a malformed cursor (fails closed)', () => {
    expect(() => decodeAuditCursor('!!!not-base64!!!')).toThrow(BadRequestException);
    expect(() => decodeAuditCursor(Buffer.from('not json', 'utf8').toString('base64url'))).toThrow(BadRequestException);
    expect(() => decodeAuditCursor(Buffer.from(JSON.stringify({ r: 'bad-date', i: 'x' }), 'utf8').toString('base64url'))).toThrow(BadRequestException);
    expect(() => decodeAuditCursor(Buffer.from(JSON.stringify({ i: 'x' }), 'utf8').toString('base64url'))).toThrow(BadRequestException);
  });

  it('exposes the fixed deterministic ordering (recordedAt desc, id desc)', () => {
    expect(AUDIT_QUERY_ORDER_BY).toEqual([
      { field: 'recordedAt', direction: 'desc' },
      { field: 'id', direction: 'desc' },
    ]);
  });
});
