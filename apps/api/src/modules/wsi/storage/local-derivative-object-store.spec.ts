import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { DerivativeKeyError, DerivativeWriteOnceError } from './derivative-object-store';
import { LocalDerivativeObjectStore } from './local-derivative-object-store';

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const readAll = (s: NodeJS.ReadableStream) =>
  new Promise<Buffer>((res, rej) => {
    const c: Buffer[] = [];
    s.on('data', (d) => c.push(d as Buffer));
    s.on('end', () => res(Buffer.concat(c)));
    s.on('error', rej);
  });

describe('LocalDerivativeObjectStore (P5-3B.1B)', () => {
  let root: string;
  let store: LocalDerivativeObjectStore;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'wsi-deriv-test-'));
    store = new LocalDerivativeObjectStore(root);
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('putImmutableObject writes readable bytes and reports size + sha256', async () => {
    const bytes = Buffer.from('tile-bytes-123');
    const res = await store.putImmutableObject('slides/l/s/derivatives/g/dzi.xml', Readable.from(bytes));
    expect(res.sizeBytes).toBe(bytes.length);
    expect(res.checksum).toBe(sha(bytes));
    expect(await readAll(store.openReadStream('slides/l/s/derivatives/g/dzi.xml'))).toEqual(bytes);
  });

  it('handles a zero-byte object', async () => {
    const res = await store.putImmutableObject('slides/l/s/derivatives/g/empty', Readable.from(Buffer.alloc(0)));
    expect(res.sizeBytes).toBe(0);
    expect(res.checksum).toBe(sha(Buffer.alloc(0)));
    expect((await store.stat('slides/l/s/derivatives/g/empty')).exists).toBe(true);
  });

  it('is write-once: re-writing an existing key is rejected', async () => {
    await store.putImmutableObject('k/a', Readable.from(Buffer.from('one')));
    await expect(store.putImmutableObject('k/a', Readable.from(Buffer.from('two')))).rejects.toBeInstanceOf(DerivativeWriteOnceError);
    // Original bytes are unchanged.
    expect(await readAll(store.openReadStream('k/a'))).toEqual(Buffer.from('one'));
  });

  it('two concurrent writes to the same key: exactly one succeeds (atomic no-replace)', async () => {
    const results = await Promise.allSettled([
      store.putImmutableObject('race/k', Readable.from(Buffer.from('a'))),
      store.putImmutableObject('race/k', Readable.from(Buffer.from('bb'))),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });

  it('rejects unsafe keys (traversal / absolute / empty)', async () => {
    await expect(store.putImmutableObject('a/../b', Readable.from(Buffer.from('x')))).rejects.toBeInstanceOf(DerivativeKeyError);
    await expect(store.putImmutableObject('', Readable.from(Buffer.from('x')))).rejects.toBeInstanceOf(DerivativeKeyError);
  });

  describe('putImmutableTree', () => {
    async function makeTree(): Promise<string> {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wsi-tree-src-'));
      await fs.mkdir(path.join(dir, '0'), { recursive: true });
      await fs.writeFile(path.join(dir, 'dzi.xml'), 'descriptor');
      await fs.writeFile(path.join(dir, '0', '0_0.jpg'), 'tileA');
      await fs.writeFile(path.join(dir, '0', '1_0.jpg'), 'tileBB');
      return dir;
    }

    it('promotes every regular file under a prefix with preserved paths + aggregate accounting', async () => {
      const src = await makeTree();
      const res = await store.putImmutableTree('slides/l/s/derivatives/g/pyramid', src);
      expect(res.objectCount).toBe(3);
      expect(res.byteCount).toBe('descriptor'.length + 'tileA'.length + 'tileBB'.length);
      expect(await readAll(store.openReadStream('slides/l/s/derivatives/g/pyramid/0/0_0.jpg'))).toEqual(Buffer.from('tileA'));
      await fs.rm(src, { recursive: true, force: true });
    });

    it('re-promoting the same prefix is rejected (write-once)', async () => {
      const src = await makeTree();
      await store.putImmutableTree('p', src);
      await expect(store.putImmutableTree('p', src)).rejects.toBeInstanceOf(DerivativeWriteOnceError);
      await fs.rm(src, { recursive: true, force: true });
    });

    it('rejects a tree containing a symlink (only regular files are promotable)', async () => {
      const src = await fs.mkdtemp(path.join(os.tmpdir(), 'wsi-tree-lnk-'));
      await fs.writeFile(path.join(src, 'real'), 'r');
      await fs.symlink(path.join(src, 'real'), path.join(src, 'link'));
      await expect(store.putImmutableTree('p', src)).rejects.toBeInstanceOf(DerivativeKeyError);
      await fs.rm(src, { recursive: true, force: true });
    });
  });

  it('listPrefix returns deterministic (sorted) keys and never exposes internal staging', async () => {
    await store.putImmutableObject('p/b', Readable.from(Buffer.from('b')));
    await store.putImmutableObject('p/a', Readable.from(Buffer.from('a')));
    await store.putImmutableObject('p/sub/c', Readable.from(Buffer.from('c')));
    const keys = await store.listPrefix('p');
    expect(keys).toEqual(['p/a', 'p/b', 'p/sub/c']); // sorted, no ".staging" ever
    expect(keys.some((k) => k.includes('.staging'))).toBe(false);
  });

  it('delete removes an object', async () => {
    await store.putImmutableObject('d/k', Readable.from(Buffer.from('x')));
    await store.delete('d/k');
    expect((await store.stat('d/k')).exists).toBe(false);
  });
});
