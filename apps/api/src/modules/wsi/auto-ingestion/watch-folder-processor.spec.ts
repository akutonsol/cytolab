import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { WatchFolderProcessor } from './watch-folder-processor';

// Mocked B1 services + composer; a REAL tmp file so SHA-256 hashing is exercised. Proves the pipeline
// state machine + truthful outcomes without a DB. status flows through setStatus calls we capture.
function harness(overrides: Partial<Record<string, any>> = {}) {
  const state: any = { row: { id: 'd1', status: 'DISCOVERED', sizeBytes: null, retryCount: 0 } };
  const discovery = {
    recordDiscovery: jest.fn(async () => state.row),
    setStatus: jest.fn(async (_id: string, status: string, patch: any = {}) => {
      state.row = { ...state.row, status, ...patch };
      return state.row;
    }),
    findDuplicateBytes: jest.fn(async () => null),
    get: jest.fn(async () => state.row),
  };
  const resolver = { resolve: jest.fn(async () => ({ kind: 'unique', recordId: 'rec-1', matchedBy: 'labNumber' })) };
  const composer = { ingestMatchedFile: jest.fn(async () => ({ slideId: 'slide-1', ingestionId: 'ing-1', checksum: 'x' })) };
  const scanner = {} as any;
  const cfg = { settleMs: 0, exts: new Set(['.svs']), maxFilesPerScan: 100, chunkBytes: 1024 } as any;
  Object.assign(discovery, overrides.discovery ?? {});
  Object.assign(resolver, overrides.resolver ?? {});
  Object.assign(composer, overrides.composer ?? {});
  const proc = new WatchFolderProcessor(discovery as any, resolver as any, composer as any, scanner, cfg);
  return { proc, discovery, resolver, composer, state };
}

describe('P5B-B2 WatchFolderProcessor — pipeline & truthful outcomes', () => {
  let root: string;
  let file: { sourceRef: string; absPath: string; sizeBytes: number; mtimeMs: number };
  let checksum: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'wf-proc-'));
    const abs = path.join(root, 'CBL-1.svs');
    const bytes = Buffer.from('slide-bytes');
    await fs.writeFile(abs, bytes);
    checksum = createHash('sha256').update(bytes).digest('hex');
    file = { sourceRef: 'CBL-1.svs', absPath: abs, sizeBytes: bytes.length, mtimeMs: Date.now() - 60_000 };
  });
  afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

  const src = { id: 's1', matchConfig: null };

  it('first sighting only establishes a STABILIZING baseline — no slide', async () => {
    const h = harness();
    await (h.proc as any).processFile(src, file);
    expect(h.state.row.status).toBe('STABILIZING');
    expect(h.composer.ingestMatchedFile).not.toHaveBeenCalled();
  });

  it('a size still changing stays STABILIZING (never ingests a growing file)', async () => {
    const h = harness();
    h.state.row = { id: 'd1', status: 'STABILIZING', sizeBytes: 5, retryCount: 0 }; // prior poll saw 5 bytes
    await (h.proc as any).processFile(src, file); // now 11 bytes → changed
    expect(h.state.row.status).toBe('STABILIZING');
    expect(h.composer.ingestMatchedFile).not.toHaveBeenCalled();
  });

  it('stable + unique match → MATCHED → hands off → INGESTED with resulting ids', async () => {
    const h = harness();
    h.state.row = { id: 'd1', status: 'STABILIZING', sizeBytes: file.sizeBytes, retryCount: 0 };
    await (h.proc as any).processFile(src, file);
    expect(h.composer.ingestMatchedFile).toHaveBeenCalledWith(expect.objectContaining({ recordId: 'rec-1', specimenId: null, expectedChecksum: checksum }));
    expect(h.state.row.status).toBe('INGESTED');
    expect(h.state.row.resultingSlideId).toBe('slide-1');
    expect(h.state.row.resultingIngestionId).toBe('ing-1');
    expect(h.state.row.sourceChecksum).toBe(checksum);
  });

  it('duplicate bytes → DUPLICATE with prior-object provenance, never ingested, no clinical inheritance', async () => {
    const priorMatch = { by: 'sourceChecksum', sourceChecksum: checksum, sourceType: 'SlideIngestion', priorIngestionId: 'ing-prior', priorSlideId: 'slide-prior', priorDiscoveryId: null };
    const h = harness({ discovery: { findDuplicateBytes: jest.fn(async () => priorMatch) } });
    h.state.row = { id: 'd1', status: 'STABILIZING', sizeBytes: file.sizeBytes, retryCount: 0 };
    await (h.proc as any).processFile(src, file);
    expect(h.state.row.status).toBe('DUPLICATE');
    // B3: truthful provenance of the prior authoritative object, in matchEvidence only.
    expect(h.state.row.matchEvidence).toEqual({ duplicateOf: priorMatch });
    // no clinical inheritance / no fabricated association on the duplicate discovery
    expect(h.state.row.matchedRecordId).toBeUndefined();
    expect(h.state.row.matchedSpecimenId).toBeUndefined();
    expect(h.state.row.resultingSlideId).toBeUndefined();
    expect(h.state.row.resultingIngestionId).toBeUndefined();
    // human-reconciliation fields untouched (reserved for B4)
    expect(h.state.row.reconciledById).toBeUndefined();
    expect(h.state.row.reconciliationAction).toBeUndefined();
    expect(h.composer.ingestMatchedFile).not.toHaveBeenCalled();
  });

  it('no accession match → UNMATCHED, no slide, no fabricated record', async () => {
    const h = harness({ resolver: { resolve: jest.fn(async () => ({ kind: 'none' })) } });
    h.state.row = { id: 'd1', status: 'STABILIZING', sizeBytes: file.sizeBytes, retryCount: 0 };
    await (h.proc as any).processFile(src, file);
    expect(h.state.row.status).toBe('UNMATCHED');
    expect(h.state.row.matchedRecordId).toBeUndefined();
    expect(h.composer.ingestMatchedFile).not.toHaveBeenCalled();
  });

  it('ambiguous match → AMBIGUOUS, no slide', async () => {
    const h = harness({ resolver: { resolve: jest.fn(async () => ({ kind: 'ambiguous', candidateRecordIds: ['a', 'b'] })) } });
    h.state.row = { id: 'd1', status: 'STABILIZING', sizeBytes: file.sizeBytes, retryCount: 0 };
    await (h.proc as any).processFile(src, file);
    expect(h.state.row.status).toBe('AMBIGUOUS');
    expect(h.composer.ingestMatchedFile).not.toHaveBeenCalled();
  });

  it('handoff failure → FAILED with a truthful reason (not a silent log) + retryCount bump', async () => {
    const h = harness({ composer: { ingestMatchedFile: jest.fn(async () => { throw new Error('store down'); }) } });
    h.state.row = { id: 'd1', status: 'STABILIZING', sizeBytes: file.sizeBytes, retryCount: 0 };
    await (h.proc as any).processFile(src, file);
    expect(h.state.row.status).toBe('FAILED');
    expect(h.state.row.failureReason).toContain('HANDOFF_FAILED');
    expect(h.state.row.retryCount).toBe(1);
  });

  it('a terminal/in-flight discovery is never re-processed (idempotent, no duplicate ingest)', async () => {
    for (const status of ['INGESTED', 'DUPLICATE', 'UNMATCHED', 'AMBIGUOUS', 'FAILED', 'MATCHED']) {
      const h = harness();
      h.state.row = { id: 'd1', status, sizeBytes: file.sizeBytes, retryCount: 0 };
      await (h.proc as any).processFile(src, file);
      expect(h.discovery.setStatus).not.toHaveBeenCalled();
      expect(h.composer.ingestMatchedFile).not.toHaveBeenCalled();
    }
  });
});
