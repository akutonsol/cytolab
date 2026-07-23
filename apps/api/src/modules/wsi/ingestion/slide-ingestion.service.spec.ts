import { createHash, randomBytes } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuditRecorder } from '../../audit/audit-recorder.service';
import { LocalSourceObjectStore } from '../storage/local-source-object-store';
import { SlideIngestionService } from './slide-ingestion.service';

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/** Small stateful Prisma mock — no DB; labId injection is the tenancy extension's job (tested elsewhere). */
function makePrisma() {
  const ingestions = new Map<string, any>();
  const slides = new Map<string, any>();
  let ing = 0;
  let slide = 0;
  const api = {
    record: { findFirst: jest.fn(async () => ({ id: 'rec-1' })) },
    specimen: { findFirst: jest.fn(async () => ({ id: 'spec-1' })) },
    digitalSlide: {
      create: jest.fn(async ({ data }: any) => {
        const id = `slide-${++slide}`;
        slides.set(id, { id, labId: 'lab-1', recordId: data.recordId, ...data });
        return { id, labId: 'lab-1' };
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = slides.get(where.id) ?? {};
        Object.assign(row, data);
        slides.set(where.id, row);
        return row;
      }),
      findFirst: jest.fn(async ({ where }: any) => {
        const row = slides.get(where.id);
        return row ? { recordId: row.recordId } : null;
      }),
    },
    slideIngestion: {
      create: jest.fn(async ({ data }: any) => {
        const id = `ing-${++ing}`;
        ingestions.set(id, { id, ...data });
        return { id };
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = ingestions.get(where.id);
        Object.assign(row, data);
        return { ...row };
      }),
      findFirst: jest.fn(async ({ where }: any) => {
        const row = ingestions.get(where.id);
        return row ? { ...row } : null;
      }),
      findMany: jest.fn(async () => [] as any[]),
    },
    _slides: slides,
  } as any;
  // Interactive transaction runs the callback with the same mock as the tx client (P5-3B.1A).
  api.$transaction = jest.fn(async (fn: any) => fn(api));
  return api;
}

describe('SlideIngestionService (P5-3A)', () => {
  let root: string;
  let store: LocalSourceObjectStore;
  let prisma: ReturnType<typeof makePrisma>;
  let audit: { recordEntityCreated: jest.Mock };
  let queue: { enqueueForIngestion: jest.Mock };
  let service: SlideIngestionService;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'wsi-ing-test-'));
    store = new LocalSourceObjectStore(root);
    prisma = makePrisma();
    audit = { recordEntityCreated: jest.fn() };
    queue = { enqueueForIngestion: jest.fn() };
    service = new SlideIngestionService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditRecorder,
      store,
      queue as any,
    );
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  async function uploadAndComplete(content: Buffer, expectedChecksum?: string) {
    const init = await service.initiate('rec-1', { filename: 'a.svs' }, 'user-1');
    await service.appendChunk(init.ingestionId, 0, content);
    const res = await service.complete(init.ingestionId, expectedChecksum ? { expectedChecksum } : {});
    return { init, res };
  }

  it('initiate creates a DRAFT slide + UPLOADING ingestion, opens a session, and audits (generic bridge)', async () => {
    const init = await service.initiate('rec-1', { filename: 'a.svs' }, 'user-1');

    const slideData = prisma.digitalSlide.create.mock.calls[0][0].data;
    expect(slideData.availabilityStatus).toBe('DRAFT');
    expect(slideData.sourceKind).toBe('UPLOAD');
    expect(slideData.slideUrl).toBe('');
    const ingData = prisma.slideIngestion.create.mock.calls[0][0].data;
    expect(ingData.status).toBe('UPLOADING');
    expect(init.objectKey).toBe('slides/lab-1/slide-1/source/ing-1/a.svs');
    expect(audit.recordEntityCreated).toHaveBeenCalledWith(
      expect.objectContaining({ resource: expect.objectContaining({ type: 'SlideIngestion' }) }),
    );
  });

  it('complete transitions UPLOADED → (checksum) → VERIFIED in order and records the streaming checksum', async () => {
    const content = randomBytes(30_000);
    const { init, res } = await uploadAndComplete(content);

    const statuses = prisma.slideIngestion.update.mock.calls
      .map((c: any) => c[0].data.status)
      .filter(Boolean);
    // initiate sets sourceObjectKey (no status), then UPLOADED, then VERIFIED — order matters (R3).
    expect(statuses).toEqual(['UPLOADED', 'VERIFIED']);
    expect(res.ingestion.status).toBe('VERIFIED');
    expect(res.ingestion.sourceChecksum).toBe(sha(content));

    // The slide gains its storageKey but stays DRAFT (never published in P5-3A).
    const slide = prisma._slides.get(init.slideId);
    expect(slide.storageKey).toBe(init.objectKey);
    expect(slide.availabilityStatus).toBe('DRAFT');

    // P5-3B.1A — the initial processing job is enqueued transactionally with the VERIFIED transition.
    expect(queue.enqueueForIngestion).toHaveBeenCalledTimes(1);
  });

  it('a declared checksum mismatch fails the ingestion before VERIFIED', async () => {
    const content = randomBytes(1_000);
    await expect(uploadAndComplete(content, 'f'.repeat(64))).rejects.toBeInstanceOf(BadRequestException);

    const statuses = prisma.slideIngestion.update.mock.calls.map((c: any) => c[0].data.status).filter(Boolean);
    expect(statuses).toEqual(['UPLOADED', 'FAILED']); // never VERIFIED
  });

  it('complete is idempotent — re-completing a VERIFIED ingestion does not re-finalize or overwrite', async () => {
    const content = randomBytes(5_000);
    const { init } = await uploadAndComplete(content);
    const completeSpy = jest.spyOn(store, 'completeUpload');
    const updatesBefore = prisma.slideIngestion.update.mock.calls.length;

    const again = await service.complete(init.ingestionId, {});
    expect(again.ingestion.status).toBe('VERIFIED');
    expect(again.ingestion.sourceChecksum).toBe(sha(content));
    expect(completeSpy).not.toHaveBeenCalled(); // no re-finalize
    expect(prisma.slideIngestion.update.mock.calls.length).toBe(updatesBefore); // no overwrite
  });

  it('duplicate detection is advisory and runs after VERIFIED (never blocks completion)', async () => {
    const content = randomBytes(2_000);
    prisma.slideIngestion.findMany.mockResolvedValueOnce([{ id: 'ing-prior' }] as any);
    const { res } = await uploadAndComplete(content);

    expect(res.ingestion.status).toBe('VERIFIED'); // completion still succeeded
    expect(res.duplicate.isPossibleDuplicate).toBe(true);
    expect(res.duplicate.matchingIngestionIds).toEqual(['ing-prior']);
  });

  it('rejects chunks once the ingestion is no longer UPLOADING', async () => {
    const content = randomBytes(1_000);
    const { init } = await uploadAndComplete(content);
    await expect(service.appendChunk(init.ingestionId, 0, Buffer.from('x'))).rejects.toThrow(/not accepting chunks/);
  });
});
