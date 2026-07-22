import { createHash, randomBytes } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { LocalSourceObjectStore } from './local-source-object-store';

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const readAll = (s: NodeJS.ReadableStream) =>
  new Promise<Buffer>((resolve, reject) => {
    const c: Buffer[] = [];
    s.on('data', (d) => c.push(d as Buffer));
    s.on('end', () => resolve(Buffer.concat(c)));
    s.on('error', reject);
  });

describe('LocalSourceObjectStore (P5-3A)', () => {
  let root: string;
  const KEY = 'slides/lab-1/slide-1/source/ing-1/image.svs';

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'wsi-store-test-'));
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('streams chunks to a durable object and reports size + streaming sha256 of the persisted bytes', async () => {
    const store = new LocalSourceObjectStore(root);
    const content = randomBytes(50_000);
    await store.createUploadSession(KEY);
    // Two ordered chunks.
    await store.writeChunk(KEY, 0, content.subarray(0, 20_000));
    await store.writeChunk(KEY, 20_000, content.subarray(20_000));
    const completed = await store.completeUpload(KEY);

    expect(completed.sizeBytes).toBe(content.length);
    expect(completed.checksum).toBe(sha(content));
    expect(await readAll(store.openReadStream(KEY))).toEqual(content);
  });

  it('assembles chunks by absolute offset regardless of write order', async () => {
    const store = new LocalSourceObjectStore(root);
    const content = randomBytes(9);
    await store.createUploadSession(KEY);
    await store.writeChunk(KEY, 3, content.subarray(3, 6));
    await store.writeChunk(KEY, 0, content.subarray(0, 3));
    await store.writeChunk(KEY, 6, content.subarray(6));
    const completed = await store.completeUpload(KEY);
    expect(completed.checksum).toBe(sha(content));
  });

  it('RESUMES an interrupted upload across a process restart and verifies exactly once', async () => {
    const content = randomBytes(40_000);

    // "Process A": upload the first half, then crash (instance discarded).
    const storeA = new LocalSourceObjectStore(root);
    await storeA.createUploadSession(KEY);
    await storeA.writeChunk(KEY, 0, content.subarray(0, 25_000));

    // "Process B" (restart): same root, same key → the session temp survives; resume from the offset.
    const storeB = new LocalSourceObjectStore(root);
    await storeB.createUploadSession(KEY); // must NOT truncate the partial upload
    await storeB.writeChunk(KEY, 25_000, content.subarray(25_000));
    const completed = await storeB.completeUpload(KEY);

    expect(completed.sizeBytes).toBe(content.length);
    expect(completed.checksum).toBe(sha(content));

    // Idempotent: completing again yields the identical checksum (VERIFIED exactly once upstream).
    const again = await storeB.completeUpload(KEY);
    expect(again.checksum).toBe(completed.checksum);
    expect(again.sizeBytes).toBe(completed.sizeBytes);
  });

  it('abortUploadSession discards incomplete bytes so completion fails', async () => {
    const store = new LocalSourceObjectStore(root);
    await store.createUploadSession(KEY);
    await store.writeChunk(KEY, 0, randomBytes(100));
    await store.abortUploadSession(KEY);
    await expect(store.completeUpload(KEY)).rejects.toThrow(/no upload session bytes/);
  });

  it('stat + delete manage object lifecycle', async () => {
    const store = new LocalSourceObjectStore(root);
    await store.createUploadSession(KEY);
    await store.writeChunk(KEY, 0, randomBytes(10));
    await store.completeUpload(KEY);

    expect((await store.stat(KEY)).exists).toBe(true);
    await store.delete(KEY);
    expect((await store.stat(KEY)).exists).toBe(false);
  });
});
