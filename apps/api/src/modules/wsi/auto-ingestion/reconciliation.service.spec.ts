import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service';

/**
 * Program 5B · B4 — the reconciliation state machine, CAS guard, candidate constraint, retry classification,
 * checksum-anchored ingest, and no-slide invariants — proven without a DB. Prisma/composer/sources/audit are
 * mocked; the ingest paths use a REAL temp file so root-confinement + SHA-256 re-verification are exercised.
 */
const ACTOR = 'user-recon-1';

function harness(over: { discovery?: any; prisma?: any; sources?: any; composer?: any } = {}) {
  const casResult = { count: 1 };
  const prisma = {
    ingestionDiscovery: {
      updateMany: jest.fn(async () => casResult),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
      groupBy: jest.fn(async () => []),
    },
    record: { findFirst: jest.fn(async () => ({ id: 'rec-1' })) },
    ...(over.prisma ?? {}),
  };
  const discovery = {
    get: jest.fn(async () => null),
    setStatus: jest.fn(async (_id: string, status: string, patch: any = {}) => ({ id: 'd1', status, ...patch })),
    ...(over.discovery ?? {}),
  };
  const sources = { get: jest.fn(async () => ({ id: 's1', rootPath: '/nonexistent' })), ...(over.sources ?? {}) };
  const composer = { ingestMatchedFile: jest.fn(async () => ({ slideId: 'slide-1', ingestionId: 'ing-1', checksum: 'x' })), ...(over.composer ?? {}) };
  const audit = { recordEntityUpdated: jest.fn(async () => undefined) };
  const svc = new ReconciliationService(prisma as any, discovery as any, sources as any, composer as any, audit as any);
  return { svc, prisma, discovery, sources, composer, audit, casResult };
}

describe('P5B-B4 ReconciliationService', () => {
  let root: string;
  let file: string;
  let checksum: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'recon-'));
    file = 'CBL-9.svs';
    const bytes = Buffer.from('recon-bytes');
    await fs.writeFile(path.join(root, file), bytes);
    checksum = createHash('sha256').update(bytes).digest('hex');
  });
  afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

  const exceptionRow = (over: any) => ({ id: 'd1', labId: 'lab-1', sourceId: 's1', sourceRef: file, sizeBytes: 11, sourceChecksum: checksum, matchedRecordId: null, matchedSpecimenId: null, matchEvidence: null, retryCount: 0, ...over });

  // ── Guards / not-found ──────────────────────────────────────────────────────────────────────────────
  it('resolveToRecord throws NotFound for a missing discovery', async () => {
    const h = harness();
    await expect(h.svc.resolveToRecord('nope', 'rec-1', ACTOR)).rejects.toBeInstanceOf(NotFoundException);
    expect(h.composer.ingestMatchedFile).not.toHaveBeenCalled();
  });

  it('resolveToRecord rejects a non-exception (already-INGESTED) row with Conflict, no ingest', async () => {
    const h = harness({ discovery: { get: jest.fn(async () => exceptionRow({ status: 'INGESTED' })) } });
    await expect(h.svc.resolveToRecord('d1', 'rec-1', ACTOR)).rejects.toBeInstanceOf(ConflictException);
    expect(h.prisma.ingestionDiscovery.updateMany).not.toHaveBeenCalled();
    expect(h.composer.ingestMatchedFile).not.toHaveBeenCalled();
  });

  // ── AMBIGUOUS candidate constraint ────────────────────────────────────────────────────────────────────
  it('AMBIGUOUS resolve rejects a record NOT in the persisted candidate set (no fuzzy inference)', async () => {
    const h = harness({ discovery: { get: jest.fn(async () => exceptionRow({ status: 'AMBIGUOUS', matchEvidence: { candidateRecordIds: ['a', 'b'] } })) } });
    await expect(h.svc.resolveToRecord('d1', 'c', ACTOR)).rejects.toBeInstanceOf(BadRequestException);
    expect(h.prisma.ingestionDiscovery.updateMany).not.toHaveBeenCalled();
    expect(h.composer.ingestMatchedFile).not.toHaveBeenCalled();
  });

  it('resolve rejects a record not found in this lab (cross-tenant/missing → BadRequest, no mutation)', async () => {
    const h = harness({
      discovery: { get: jest.fn(async () => exceptionRow({ status: 'UNMATCHED' })) },
      prisma: { ingestionDiscovery: { updateMany: jest.fn() }, record: { findFirst: jest.fn(async () => null) } },
    });
    await expect(h.svc.resolveToRecord('d1', 'rec-x', ACTOR)).rejects.toBeInstanceOf(BadRequestException);
    expect(h.prisma.ingestionDiscovery.updateMany).not.toHaveBeenCalled();
  });

  // ── CAS conflict ──────────────────────────────────────────────────────────────────────────────────────
  it('resolve loses a concurrent race (CAS count=0) → Conflict, composer never invoked', async () => {
    const h = harness({ discovery: { get: jest.fn(async () => exceptionRow({ status: 'UNMATCHED' })) } });
    h.casResult.count = 0;
    await expect(h.svc.resolveToRecord('d1', 'rec-1', ACTOR)).rejects.toBeInstanceOf(ConflictException);
    expect(h.composer.ingestMatchedFile).not.toHaveBeenCalled();
  });

  // ── UNMATCHED happy path → accepted handoff → INGESTED ────────────────────────────────────────────────
  it('UNMATCHED resolve → CAS to MATCHED (audited) → accepted handoff → INGESTED with resulting ids', async () => {
    const h = harness({
      discovery: { get: jest.fn(async () => exceptionRow({ status: 'UNMATCHED' })) },
      sources: { get: jest.fn(async () => ({ id: 's1', rootPath: root })) },
    });
    const out = await h.svc.resolveToRecord('d1', 'rec-1', ACTOR);
    // CAS stamps the operator decision + record
    expect(h.prisma.ingestionDiscovery.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'd1', status: 'UNMATCHED' },
      data: expect.objectContaining({ status: 'MATCHED', matchedRecordId: 'rec-1', reconciledById: ACTOR, reconciliationAction: 'RESOLVE_TO_RECORD' }),
    }));
    // accepted pipeline reused with the re-verified checksum + record-level specimen null
    expect(h.composer.ingestMatchedFile).toHaveBeenCalledWith(expect.objectContaining({ recordId: 'rec-1', specimenId: null, expectedChecksum: checksum }));
    expect(out.status).toBe('INGESTED');
    expect(out.resultingSlideId).toBe('slide-1');
    expect(out.resultingIngestionId).toBe('ing-1');
    expect(h.audit.recordEntityUpdated).toHaveBeenCalled();
  });

  it('resolve refuses to ingest when source bytes changed since discovery (checksum anchor) → Conflict, FAILED', async () => {
    const h = harness({
      discovery: { get: jest.fn(async () => exceptionRow({ status: 'UNMATCHED', sourceChecksum: 'd'.repeat(64) })) }, // != file
      sources: { get: jest.fn(async () => ({ id: 's1', rootPath: root })) },
    });
    await expect(h.svc.resolveToRecord('d1', 'rec-1', ACTOR)).rejects.toBeInstanceOf(ConflictException);
    expect(h.composer.ingestMatchedFile).not.toHaveBeenCalled();
    // marked FAILED truthfully (still retryable — match + checksum persisted)
    expect(h.discovery.setStatus).toHaveBeenCalledWith('d1', 'FAILED', expect.objectContaining({ failureReason: expect.stringContaining('CHECKSUM') }));
  });

  // ── DUPLICATE acknowledge → RECONCILED, no slide ──────────────────────────────────────────────────────
  it('acknowledgeDuplicate → RECONCILED, retains duplicateOf, creates NO slide/ingestion', async () => {
    const dupEvidence = { duplicateOf: { by: 'sourceChecksum', sourceChecksum: checksum, sourceType: 'SlideIngestion', priorIngestionId: 'ing-p', priorSlideId: 'slide-p', priorDiscoveryId: null } };
    const h = harness({ discovery: { get: jest.fn(async () => exceptionRow({ status: 'DUPLICATE', matchEvidence: dupEvidence })) } });
    await h.svc.acknowledgeDuplicate('d1', ACTOR);
    expect(h.prisma.ingestionDiscovery.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'd1', status: 'DUPLICATE' },
      data: expect.objectContaining({ status: 'RECONCILED', reconciliationAction: 'ACKNOWLEDGE_DUPLICATE', reconciledById: ACTOR }),
    }));
    // matchEvidence is NOT overwritten (duplicateOf preserved); no slide created
    const casData = h.prisma.ingestionDiscovery.updateMany.mock.calls[0][0].data;
    expect(casData).not.toHaveProperty('matchEvidence');
    expect(h.composer.ingestMatchedFile).not.toHaveBeenCalled();
  });

  it('acknowledgeDuplicate on a non-DUPLICATE row → Conflict', async () => {
    const h = harness({ discovery: { get: jest.fn(async () => exceptionRow({ status: 'UNMATCHED' })) } });
    await expect(h.svc.acknowledgeDuplicate('d1', ACTOR)).rejects.toBeInstanceOf(ConflictException);
  });

  // ── DISMISS ───────────────────────────────────────────────────────────────────────────────────────────
  it('dismiss any exception → RECONCILED (no slide), preserving prior evidence + noting the dismissal', async () => {
    const h = harness({ discovery: { get: jest.fn(async () => exceptionRow({ status: 'FAILED', matchEvidence: { accession: 'X' } })) } });
    await h.svc.dismiss('d1', ACTOR, 'unreadable, re-scan later');
    const call = h.prisma.ingestionDiscovery.updateMany.mock.calls[0][0];
    expect(call.data.status).toBe('RECONCILED');
    expect(call.data.reconciliationAction).toBe('DISMISS');
    expect(call.data.matchEvidence).toEqual({ accession: 'X', dismissal: { reason: 'unreadable, re-scan later' } });
    expect(h.composer.ingestMatchedFile).not.toHaveBeenCalled();
  });

  // ── FAILED retry ──────────────────────────────────────────────────────────────────────────────────────
  it('retry is refused for a pre-match failure (no persisted match/checksum) → BadRequest, no CAS', async () => {
    const h = harness({ discovery: { get: jest.fn(async () => exceptionRow({ status: 'FAILED', matchedRecordId: null, sourceChecksum: null })) } });
    await expect(h.svc.retry('d1', ACTOR)).rejects.toBeInstanceOf(BadRequestException);
    expect(h.prisma.ingestionDiscovery.updateMany).not.toHaveBeenCalled();
  });

  it('retry of a retryable FAILED (match+checksum) → re-hash verifies → accepted handoff → INGESTED once', async () => {
    const h = harness({
      discovery: { get: jest.fn(async () => exceptionRow({ status: 'FAILED', matchedRecordId: 'rec-1', failureReason: 'RECONCILE_HANDOFF_FAILED: store down' })) },
      sources: { get: jest.fn(async () => ({ id: 's1', rootPath: root })) },
    });
    const out = await h.svc.retry('d1', ACTOR);
    expect(h.prisma.ingestionDiscovery.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'd1', status: 'FAILED', matchedRecordId: { not: null }, sourceChecksum: { not: null } },
      data: expect.objectContaining({ status: 'MATCHED', reconciliationAction: 'RETRY', retryCount: { increment: 1 } }),
    }));
    expect(h.composer.ingestMatchedFile).toHaveBeenCalledTimes(1);
    expect(out.status).toBe('INGESTED');
  });

  it('retry loses a concurrent race / stale repeat (CAS count=0) → Conflict, no second ingest', async () => {
    const h = harness({ discovery: { get: jest.fn(async () => exceptionRow({ status: 'FAILED', matchedRecordId: 'rec-1' })) }, sources: { get: jest.fn(async () => ({ id: 's1', rootPath: root })) } });
    h.casResult.count = 0;
    await expect(h.svc.retry('d1', ACTOR)).rejects.toBeInstanceOf(ConflictException);
    expect(h.composer.ingestMatchedFile).not.toHaveBeenCalled();
  });

  // ── Queue summary ─────────────────────────────────────────────────────────────────────────────────────
  it('queue returns items + total + a bounded per-status backlog summary (only exception states)', async () => {
    const h = harness({
      prisma: {
        ingestionDiscovery: {
          findMany: jest.fn(async () => [{ id: 'd1', status: 'UNMATCHED' }]),
          count: jest.fn(async () => 1),
          groupBy: jest.fn(async () => [{ status: 'UNMATCHED', _count: { _all: 3 } }, { status: 'FAILED', _count: { _all: 2 } }]),
        },
        record: { findFirst: jest.fn() },
      },
    });
    const out = await h.svc.queue({});
    expect(out.total).toBe(1);
    expect(out.summary).toEqual({ UNMATCHED: 3, AMBIGUOUS: 0, DUPLICATE: 0, FAILED: 2 });
    // the queue query is constrained to the four exception states
    const where = h.prisma.ingestionDiscovery.findMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ in: ['UNMATCHED', 'AMBIGUOUS', 'DUPLICATE', 'FAILED'] });
  });
});
