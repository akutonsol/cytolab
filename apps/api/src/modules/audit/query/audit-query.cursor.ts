/**
 * Program 2 · P2-7A — opaque cursor for deterministic keyset pagination over the immutable ledger.
 * Ordering is fixed: recordedAt DESC, then id DESC (stable tie-break for equal timestamps). The
 * cursor carries ONLY the two keyset values; the caller cannot inject ordering fields. It is not
 * encryption — just an opaque, tamper-evident-enough token that fails closed on any malformation.
 */
import { BadRequestException } from '@nestjs/common';

export interface AuditQueryCursor {
  recordedAt: Date;
  id: string;
}

export function encodeAuditCursor(c: AuditQueryCursor): string {
  const payload = JSON.stringify({ r: c.recordedAt.toISOString(), i: c.id });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

export function decodeAuditCursor(token: string | undefined | null): AuditQueryCursor | null {
  if (token === undefined || token === null || token === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestException('Invalid audit query cursor');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new BadRequestException('Invalid audit query cursor');
  }
  const { r, i } = parsed as { r?: unknown; i?: unknown };
  if (typeof r !== 'string' || typeof i !== 'string') {
    throw new BadRequestException('Invalid audit query cursor');
  }
  const recordedAt = new Date(r);
  if (Number.isNaN(recordedAt.getTime())) throw new BadRequestException('Invalid audit query cursor');
  return { recordedAt, id: i };
}

/** The fixed ordering, exported so P2-7B builds the identical Prisma orderBy. */
export const AUDIT_QUERY_ORDER_BY = [
  { field: 'recordedAt', direction: 'desc' },
  { field: 'id', direction: 'desc' },
] as const;
