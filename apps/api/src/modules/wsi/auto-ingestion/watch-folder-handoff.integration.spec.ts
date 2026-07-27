import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { PrismaService } from '../../../database/prisma.service';
import { AuditRecorder } from '../../audit/audit-recorder.service';
import { LocalSourceObjectStore } from '../storage/local-source-object-store';
import { SlideIngestionService } from '../ingestion/slide-ingestion.service';
import { AutomatedIngestionComposer } from './automated-ingestion-composer';

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/** Stateful in-memory Prisma (no DB) — labId stamping is the tenancy extension's job, tested elsewhere. */
function makePrisma() {
  const slides = new Map<string, any>();
  const ingestions = new Map<string, any>();
  let s = 0;
  let i = 0;
  const api: any = {
    record: { findFirst: jest.fn(async () => ({ id: 'rec-1' })) },
    specimen: { findFirst: jest.fn(async () => ({ id: 'spec-1' })) },
    digitalSlide: {
      create: jest.fn(async ({ data }: any) => { const id = `slide-${++s}`; slides.set(id, { id, labId: 'lab-1', ...data }); return { id, labId: 'lab-1' }; }),
      update: jest.fn(async ({ where, data }: any) => { const r = slides.get(where.id) ?? {}; Object.assign(r, data); slides.set(where.id, r); return r; }),
      findFirst: jest.fn(async ({ where }: any) => slides.get(where.id) ?? null),
    },
    slideIngestion: {
      create: jest.fn(async ({ data }: any) => { const id = `ing-${++i}`; ingestions.set(id, { id, ...data }); return { id }; }),
      update: jest.fn(async ({ where, data }: any) => { const r = ingestions.get(where.id); Object.assign(r, data); return { ...r }; }),
      findFirst: jest.fn(async ({ where }: any) => (ingestions.get(where.id) ? { ...ingestions.get(where.id) } : null)),
      findMany: jest.fn(async () => [] as any[]), // accepted duplicateAdvisory() read (advisory, non-blocking)
    },
    _slides: slides,
    _ingestions: ingestions,
  };
  api.$transaction = jest.fn(async (fn: any) => fn(api));
  return api;
}

describe('P5B-B2 WATCH_FOLDER handoff — drives the ACCEPTED 5A pipeline (not a second path)', () => {
  let root: string; // source-object store dir
  let src: string; // the discovered source file dir

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'wf-store-'));
    src = await fs.mkdtemp(path.join(os.tmpdir(), 'wf-src-'));
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(src, { recursive: true, force: true });
  });

  it('creates a VERIFIED WATCH_FOLDER SlideIngestion + slide via the real service/store, and enqueues a processing job', async () => {
    const prisma = makePrisma();
    const audit = { recordEntityCreated: jest.fn() };
    const queue = { enqueueForIngestion: jest.fn() };
    const store = new LocalSourceObjectStore(root);
    const ingestion = new SlideIngestionService(prisma as unknown as PrismaService, audit as unknown as AuditRecorder, store as any, queue as any);
    const composer = new AutomatedIngestionComposer(ingestion, queue as any, { chunkBytes: 16 } as any);

    const bytes = Buffer.from('a-real-whole-slide-image-payload-streamed-in-chunks');
    const abs = path.join(src, 'CBL26-06-465.svs');
    await fs.writeFile(abs, bytes);
    const checksum = sha(bytes);

    const res = await composer.ingestMatchedFile({ absPath: abs, filename: 'CBL26-06-465.svs', sizeBytes: bytes.length, recordId: 'rec-1', specimenId: null, expectedChecksum: checksum });

    // The resulting slide + ingestion were created through the ACCEPTED service, tagged WATCH_FOLDER.
    const slide = prisma._slides.get(res.slideId);
    const ing = prisma._ingestions.get(res.ingestionId);
    expect(slide.sourceKind).toBe('WATCH_FOLDER');
    expect(slide.availabilityStatus).toBe('DRAFT'); // NOT viewable / NOT published — inherits the 5A boundary
    expect(ing.sourceKind).toBe('WATCH_FOLDER');
    expect(ing.status).toBe('VERIFIED'); // real store round-trip + real checksum verification passed
    expect(ing.sourceChecksum).toBe(checksum);
    // Same 5A hand-off: the accepted queue was asked to enqueue a processing job for this ingestion.
    expect(queue.enqueueForIngestion).toHaveBeenCalledWith(expect.anything(), res.ingestionId);
  });

  it('a checksum mismatch fails the ingestion through the accepted verification (no VERIFIED, no enqueue)', async () => {
    const prisma = makePrisma();
    const queue = { enqueueForIngestion: jest.fn() };
    const store = new LocalSourceObjectStore(root);
    const ingestion = new SlideIngestionService(prisma as unknown as PrismaService, { recordEntityCreated: jest.fn() } as unknown as AuditRecorder, store as any, queue as any);
    const composer = new AutomatedIngestionComposer(ingestion, queue as any, { chunkBytes: 16 } as any);

    const abs = path.join(src, 'X.svs');
    await fs.writeFile(abs, Buffer.from('real-bytes'));
    // Declare a WRONG checksum → the accepted complete() must fail the ingestion.
    await expect(
      composer.ingestMatchedFile({ absPath: abs, filename: 'X.svs', sizeBytes: 10, recordId: 'rec-1', specimenId: null, expectedChecksum: 'f'.repeat(64) }),
    ).rejects.toThrow(/checksum/i);
    expect(queue.enqueueForIngestion).not.toHaveBeenCalled();
  });
});
