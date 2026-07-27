import { randomUUID } from 'node:crypto';
import { createTestPrisma } from '@test/test-database';

// Inlined (avoids importing the DTO's class-validator decorators under the integration jest project).
const RECONCILIATION_EXCEPTION_STATES = ['UNMATCHED', 'AMBIGUOUS', 'DUPLICATE', 'FAILED'] as const;

/**
 * Program 5B · B4 — proves the concurrency PRIMITIVE the ReconciliationService relies on, against REAL
 * Postgres: a status-guarded `updateMany` is an atomic compare-and-set on the existing `status` column. Two
 * concurrent guarded transitions of the same exception row yield EXACTLY one winner (count=1) and one loser
 * (count=0) — the basis for "only the winning request can invoke ingestion." No schema/version column needed.
 */
const prisma = createTestPrisma();
const labIds: string[] = [];

async function seedException(status: string) {
  const lab = await prisma.lab.create({ data: { name: 'p5b-b4-cas', slug: `p5b-b4-cas-${randomUUID()}` } });
  labIds.push(lab.id);
  const source = await prisma.ingestionSource.create({ data: { labId: lab.id, kind: 'FILESYSTEM', rootPath: `/tmp/${randomUUID()}`, enabled: true } });
  const d = await prisma.ingestionDiscovery.create({
    data: { labId: lab.id, sourceId: source.id, sourceRef: `${randomUUID()}.svs`, status: status as any, sourceChecksum: 'a'.repeat(64), matchedRecordId: null },
  });
  return { labId: lab.id, id: d.id };
}

afterAll(async () => {
  for (const labId of labIds) {
    await prisma.$executeRaw`DELETE FROM "IngestionDiscovery" WHERE "labId" = ${labId}`;
    await prisma.$executeRaw`DELETE FROM "IngestionSource" WHERE "labId" = ${labId}`;
    await prisma.$executeRaw`DELETE FROM "Lab" WHERE id = ${labId}`;
  }
  await prisma.$disconnect();
});

it('exposes exactly the four intake exception states', () => {
  expect([...RECONCILIATION_EXCEPTION_STATES]).toEqual(['UNMATCHED', 'AMBIGUOUS', 'DUPLICATE', 'FAILED']);
});

it('two concurrent status-guarded transitions of one UNMATCHED row → exactly one winner', async () => {
  const { id } = await seedException('UNMATCHED');
  const guarded = () =>
    prisma.ingestionDiscovery.updateMany({
      where: { id, status: 'UNMATCHED' },
      data: { status: 'MATCHED', reconciliationAction: 'RESOLVE_TO_RECORD', reconciledAt: new Date() },
    });
  const [a, b] = await Promise.all([guarded(), guarded()]);
  expect([a.count, b.count].sort()).toEqual([0, 1]);
  const row = await prisma.ingestionDiscovery.findUnique({ where: { id } });
  expect(row?.status).toBe('MATCHED');
  expect(row?.reconciliationAction).toBe('RESOLVE_TO_RECORD');
});

it('a stale repeat transition after the row already left the exception state is a no-op (count=0)', async () => {
  const { id } = await seedException('FAILED');
  const first = await prisma.ingestionDiscovery.updateMany({ where: { id, status: 'FAILED' }, data: { status: 'RECONCILED', reconciliationAction: 'DISMISS' } });
  const stale = await prisma.ingestionDiscovery.updateMany({ where: { id, status: 'FAILED' }, data: { status: 'RECONCILED', reconciliationAction: 'DISMISS' } });
  expect(first.count).toBe(1);
  expect(stale.count).toBe(0);
});
