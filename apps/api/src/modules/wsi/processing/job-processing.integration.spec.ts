import { randomUUID } from 'node:crypto';
import { createTestPrisma } from '@test/test-database';
import { PrismaService } from '../../../database/prisma.service';
import { JobLeaseService } from './job-lease.service';
import { SlideProcessingQueueService } from './slide-processing-queue.service';
import { loadProcessingConfig } from './processing-config';

/**
 * Program 5A · P5-3B.1A — job orchestration + lease runtime, against the isolated test DB. Proves the
 * DB-level guarantees that cannot be mocked: FOR UPDATE SKIP LOCKED claiming, lease ownership, expiry
 * reclamation + retry, the active-job partial unique index, and backoff-aware reconciliation.
 *
 * No engine, generation, sealing, or SUCCEEDED transition is exercised — B.1A manages only job rows.
 */
const prisma = createTestPrisma();
const cfg = { ...loadProcessingConfig({} as any), leaseDurationMs: 60_000, maxAttempts: 3 };
const lease = new JobLeaseService(prisma as unknown as PrismaService, cfg);
const queue = new SlideProcessingQueueService(prisma as unknown as PrismaService, cfg);

const MARKER = 'p5-3b1a-it';
let labIds: string[] = [];

async function seedIngestion(): Promise<{ labId: string; slideId: string; ingestionId: string }> {
  const lab = await prisma.lab.create({ data: { name: `${MARKER}-lab`, slug: `${MARKER}-${randomUUID()}` } });
  labIds.push(lab.id);
  const patient = await prisma.patient.create({
    data: { labId: lab.id, registrationNo: `${MARKER}-${randomUUID()}`, firstName: 'P', lastName: 'X' },
  });
  const record = await prisma.record.create({
    data: { labId: lab.id, identifier: `${MARKER}-${randomUUID()}`, patientId: patient.id },
  });
  const slide = await prisma.digitalSlide.create({ data: { labId: lab.id, recordId: record.id, slideUrl: '' } });
  const ingestion = await prisma.slideIngestion.create({
    data: { labId: lab.id, slideId: slide.id, sourceKind: 'UPLOAD', status: 'VERIFIED' },
  });
  return { labId: lab.id, slideId: slide.id, ingestionId: ingestion.id };
}

async function insertJob(labId: string, ingestionId: string, over: Record<string, unknown> = {}) {
  return prisma.slideProcessingJob.create({
    data: { labId, ingestionId, status: 'QUEUED', attempt: 1, ...over } as any,
  });
}

beforeAll(async () => {
  // The partial unique index is raw SQL in the migration (not the datamodel global-setup builds from).
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "SlideProcessingJob_ingestion_active_key" ` +
      `ON "SlideProcessingJob" ("ingestionId") WHERE "status" IN ('QUEUED','RUNNING')`,
  );
});

afterEach(async () => {
  // Clean up in FK order for every lab created this test.
  for (const labId of labIds) {
    await prisma.$executeRaw`DELETE FROM "SlideProcessingJob" WHERE "labId" = ${labId}`;
    await prisma.$executeRaw`DELETE FROM "SlideIngestion" WHERE "labId" = ${labId}`;
    await prisma.$executeRaw`DELETE FROM "DigitalSlide" WHERE "labId" = ${labId}`;
    await prisma.$executeRaw`DELETE FROM "Record" WHERE "labId" = ${labId}`;
    await prisma.$executeRaw`DELETE FROM "Patient" WHERE "labId" = ${labId}`;
    await prisma.$executeRaw`DELETE FROM "Lab" WHERE "id" = ${labId}`;
  }
  labIds = [];
});

describe('claim (FOR UPDATE SKIP LOCKED)', () => {
  it('claims the oldest QUEUED job, sets RUNNING + a lease, and returns null when the queue is empty', async () => {
    const a = await seedIngestion();
    await insertJob(a.labId, a.ingestionId);
    const claimed = await lease.claim('w1');
    expect(claimed).not.toBeNull();
    expect(claimed!.ingestionId).toBe(a.ingestionId);
    expect(claimed!.leaseExpiresAt.getTime()).toBeGreaterThan(Date.now());
    const row = await prisma.slideProcessingJob.findUniqueOrThrow({ where: { id: claimed!.id } });
    expect(row.status).toBe('RUNNING');
    expect(row.workerId).toBe('w1');
    expect(await lease.claim('w2')).toBeNull(); // queue now empty
  });

  it('two concurrent claims on a single job hand it to exactly one worker (no double-claim)', async () => {
    const a = await seedIngestion();
    await insertJob(a.labId, a.ingestionId);
    const [c1, c2] = await Promise.all([lease.claim('w1'), lease.claim('w2')]);
    const nonNull = [c1, c2].filter(Boolean);
    expect(nonNull).toHaveLength(1);
  });
});

describe('renew (lease ownership)', () => {
  it('renews only while this worker owns a RUNNING job', async () => {
    const a = await seedIngestion();
    await insertJob(a.labId, a.ingestionId);
    const claimed = (await lease.claim('w1'))!;

    expect(await lease.renew(claimed.id, 'w1')).toBe(true); // owner
    expect(await lease.renew(claimed.id, 'w2')).toBe(false); // not the owner

    await lease.terminalizeOwned(claimed.id, 'w1', 'FAILED', 'ENGINE_CRASH'); // no longer RUNNING
    expect(await lease.renew(claimed.id, 'w1')).toBe(false); // ownership check fails on status
  });
});

describe('reclaimExpired (crash recovery + retry)', () => {
  it('times out an expired RUNNING job and enqueues a retry (attempt+1) within the attempt budget', async () => {
    const a = await seedIngestion();
    const past = new Date(Date.now() - 5 * 60_000);
    await insertJob(a.labId, a.ingestionId, {
      status: 'RUNNING', workerId: 'dead', attempt: 1, startedAt: past, heartbeatAt: past, leaseExpiresAt: past,
    });

    expect(await lease.reclaimExpired()).toBe(1);

    const jobs = await prisma.slideProcessingJob.findMany({ where: { ingestionId: a.ingestionId }, orderBy: { attempt: 'asc' } });
    expect(jobs).toHaveLength(2);
    expect(jobs[0].status).toBe('TIMED_OUT');
    expect(jobs[0].errorCode).toBe('WORKER_TERMINATED');
    expect(jobs[1].status).toBe('QUEUED');
    expect(jobs[1].attempt).toBe(2);
  });

  it('does not enqueue a retry once the attempt budget is exhausted', async () => {
    const a = await seedIngestion();
    const past = new Date(Date.now() - 5 * 60_000);
    await insertJob(a.labId, a.ingestionId, {
      status: 'RUNNING', workerId: 'dead', attempt: 3, leaseExpiresAt: past,
    });
    expect(await lease.reclaimExpired()).toBe(1);
    const jobs = await prisma.slideProcessingJob.findMany({ where: { ingestionId: a.ingestionId } });
    expect(jobs).toHaveLength(1); // no retry
    expect(jobs[0].status).toBe('TIMED_OUT');
  });

  it('leaves un-expired RUNNING jobs untouched', async () => {
    const a = await seedIngestion();
    const future = new Date(Date.now() + 5 * 60_000);
    await insertJob(a.labId, a.ingestionId, { status: 'RUNNING', workerId: 'alive', leaseExpiresAt: future });
    expect(await lease.reclaimExpired()).toBe(0);
  });
});

describe('reconcile (backoff-aware recovery) + active-job uniqueness', () => {
  it('enqueues attempt 1 for a VERIFIED ingestion with no job', async () => {
    const a = await seedIngestion();
    expect(await queue.reconcile()).toBe(1);
    const jobs = await prisma.slideProcessingJob.findMany({ where: { ingestionId: a.ingestionId } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe('QUEUED');
    expect(jobs[0].attempt).toBe(1);
  });

  it('does not enqueue when an active job already exists (partial unique index backstop)', async () => {
    const a = await seedIngestion();
    await insertJob(a.labId, a.ingestionId); // active QUEUED
    expect(await queue.reconcile()).toBe(0);
    // A second raw active insert also conflicts (ON CONFLICT DO NOTHING).
    const n = await prisma.$executeRaw`
      INSERT INTO "SlideProcessingJob" (id, "labId", "ingestionId", status, attempt, "createdAt", "updatedAt")
      VALUES (${randomUUID()}, ${a.labId}, ${a.ingestionId}, 'QUEUED', 1, NOW(), NOW())
      ON CONFLICT DO NOTHING`;
    expect(n).toBe(0);
  });

  it('respects retry backoff and non-retryable classification', async () => {
    const a = await seedIngestion();
    const justNow = new Date();
    // A retryable failure that only just finished → backoff (1 min) not yet elapsed → no retry.
    await insertJob(a.labId, a.ingestionId, {
      status: 'FAILED', attempt: 1, errorCode: 'ENGINE_CRASH', finishedAt: justNow,
    });
    expect(await queue.reconcile()).toBe(0);

    // Move finishedAt into the past beyond the backoff → retry becomes due.
    await prisma.slideProcessingJob.updateMany({
      where: { ingestionId: a.ingestionId },
      data: { finishedAt: new Date(Date.now() - 2 * 60_000) },
    });
    expect(await queue.reconcile()).toBe(1);
    const retry = await prisma.slideProcessingJob.findFirst({ where: { ingestionId: a.ingestionId, status: 'QUEUED' } });
    expect(retry?.attempt).toBe(2);
  });

  it('does not retry a non-retryable failure', async () => {
    const a = await seedIngestion();
    await insertJob(a.labId, a.ingestionId, {
      status: 'FAILED', attempt: 1, errorCode: 'CHECKSUM_MISMATCH', finishedAt: new Date(Date.now() - 60 * 60_000),
    });
    expect(await queue.reconcile()).toBe(0);
  });
});
