import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { LocalDerivativeObjectStore } from './local-derivative-object-store';

/**
 * P5-5A-ii — contract tests for `openReadStreamChecked`. Same definitive-absence-vs-transient rule as
 * `readObject`, plus the streaming nuance: obtaining a FOUND stream does NOT guarantee the transfer
 * completes — a post-open fault must surface as a stream 'error', observably distinct from a clean EOF.
 */
function drain(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c) => chunks.push(c as Buffer));
    stream.on('end', () => resolve(Buffer.concat(chunks))); // clean EOF → success
    stream.on('error', reject); // any fault → failure (never silently treated as EOF)
  });
}

describe('LocalDerivativeObjectStore.openReadStreamChecked', () => {
  let root: string;
  let store: LocalDerivativeObjectStore;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), `deriv-stream-${randomUUID()}-`));
    store = new LocalDerivativeObjectStore(root);
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true }).catch(() => undefined);
  });

  it('returns FOUND with a stream of the exact bytes + size', async () => {
    await store.putImmutableObject('slides/a/b/obj', Readable.from(Buffer.from('hello-stream-bytes')));
    const res = await store.openReadStreamChecked('slides/a/b/obj');
    expect(res.status).toBe('FOUND');
    if (res.status === 'FOUND') {
      expect(res.sizeBytes).toBe('hello-stream-bytes'.length);
      expect((await drain(res.stream)).toString('utf8')).toBe('hello-stream-bytes');
    }
  });

  it('returns NOT_FOUND for a definitively-absent object', async () => {
    const res = await store.openReadStreamChecked('slides/a/b/missing');
    expect(res.status).toBe('NOT_FOUND');
  });

  it('THROWS (never NOT_FOUND) for an indeterminate open — a directory key is not a regular file', async () => {
    await store.putImmutableObject('slides/a/pyramid/0/0_0.jpg', Readable.from(Buffer.from('tile')));
    await expect(store.openReadStreamChecked('slides/a/pyramid/0')).rejects.toThrow();
  });

  it('surfaces a post-open transfer fault as a stream error, distinct from EOF', async () => {
    await store.putImmutableObject('slides/a/b/obj', Readable.from(Buffer.from('data')));
    const res = await store.openReadStreamChecked('slides/a/b/obj');
    expect(res.status).toBe('FOUND');
    if (res.status === 'FOUND') {
      const drained = drain(res.stream);
      res.stream.destroy(new Error('simulated mid-transfer fault'));
      await expect(drained).rejects.toThrow(/simulated mid-transfer fault/); // error path, NOT a clean 'end'
    }
  });
});
