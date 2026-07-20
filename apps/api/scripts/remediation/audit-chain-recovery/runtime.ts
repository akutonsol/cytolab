/**
 * Program 2 · P2-R016B-A2 — Dry-Run Recovery Planner: runtime (READ-ONLY DB access + binding).
 *
 * Provides a PrismaClient and read-only chain readers. It performs Prisma read operations only
 * (findMany / findUnique / groupBy / count / aggregate) — no create/update/delete, no $transaction,
 * no raw mutation. It never touches AuditChainHead except to read it. Binding helpers (git commit,
 * schema state, db fingerprint) let a generated plan be pinned to the exact snapshot it planned over.
 */
import { execSync } from 'child_process';
import { createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';
import type { VerifiableAuditRow } from '../../../src/modules/audit/audit-verification.service';
import type { ChainHeadState } from './shared';

let client: PrismaClient | null = null;
export function getPrisma(): PrismaClient {
  if (!client) client = new PrismaClient();
  return client;
}

export interface ChainSnapshot {
  chainId: string;
  rows: VerifiableAuditRow[];
  head: ChainHeadState | null;
}

/** Read every non-legacy (non-NULL chainId) chain: its events (ordered) and head. Read-only. */
export async function readAllChains(prisma: PrismaClient): Promise<ChainSnapshot[]> {
  const groups = await prisma.auditEvent.groupBy({
    by: ['chainId'],
    where: { chainId: { not: null } },
    _count: { _all: true },
  });
  const chainIds = groups.map((g) => g.chainId as string).sort();
  const snapshots: ChainSnapshot[] = [];
  for (const chainId of chainIds) {
    const rows = (await prisma.auditEvent.findMany({
      where: { chainId },
      orderBy: { sequence: 'asc' },
    })) as unknown as VerifiableAuditRow[];
    const headRow = await prisma.auditChainHead.findUnique({ where: { chainId } });
    const head: ChainHeadState | null = headRow
      ? { lastSequence: headRow.lastSequence, lastSelfHash: headRow.lastSelfHash }
      : null;
    snapshots.push({ chainId, rows, head });
  }
  return snapshots;
}

/** Count of legacy (NULL chainId) events — reported for completeness; they are not chained. */
export async function readLegacyCount(prisma: PrismaClient): Promise<number> {
  return prisma.auditEvent.count({ where: { chainId: null } });
}

export function gitCommit(): string {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

/** Redacted DB identity (host/name only; never credentials) + a stable fingerprint of the target. */
export function databaseBinding(): { target: string; fingerprint: string } {
  const url = process.env.DATABASE_URL ?? '';
  const redacted = url.replace(/(:\/\/[^:]+:)[^@]+@/, '$1***@');
  const nameHost = (() => {
    const m = url.match(/@([^/]+)\/([^?]+)/);
    return m ? `${m[1]}/${m[2]}` : 'unknown';
  })();
  return { target: redacted, fingerprint: createHash('sha256').update(nameHost).digest('hex').slice(0, 16) };
}
