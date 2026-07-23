import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { LocalDerivativeObjectStore } from '../../storage/local-derivative-object-store';
import { computeLevelDigest, digestPyramid } from './pyramid-digest';

describe('pyramid-digest (P5-3B.2A — from persisted bytes)', () => {
  let root: string;
  let store: LocalDerivativeObjectStore;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'pyr-digest-'));
    store = new LocalDerivativeObjectStore(root);
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const put = (key: string, bytes: Buffer) => store.putImmutableObject(key, Readable.from(bytes));

  it('computes a deterministic per-level digest from stored objects', async () => {
    await put('pyr/0/0_0.jpg', Buffer.from('tileA'));
    await put('pyr/0/1_0.jpg', Buffer.from('tileBB'));
    const d1 = await computeLevelDigest(store, 'pyr/0');
    const d2 = await computeLevelDigest(store, 'pyr/0');
    expect(d1.tileDigest).toBe(d2.tileDigest);
    expect(d1.objectCount).toBe(2);
    expect(d1.byteCount).toBe('tileA'.length + 'tileBB'.length);
  });

  it('changes the digest when a tile is renamed (key folded in)', async () => {
    await put('pyr/0/0_0.jpg', Buffer.from('same'));
    const a = (await computeLevelDigest(store, 'pyr/0')).tileDigest;

    const root2 = await fs.mkdtemp(path.join(os.tmpdir(), 'pyr-digest2-'));
    const store2 = new LocalDerivativeObjectStore(root2);
    await store2.putImmutableObject('pyr/0/9_9.jpg', Readable.from(Buffer.from('same'))); // same bytes, different key
    const b = (await computeLevelDigest(store2, 'pyr/0')).tileDigest;
    await fs.rm(root2, { recursive: true, force: true });

    expect(a).not.toBe(b);
  });

  it('changes the digest when a tile is resized and handles zero-byte objects', async () => {
    await put('pyr/0/0_0.jpg', Buffer.from('abc'));
    const a = (await computeLevelDigest(store, 'pyr/0')).tileDigest;

    const root2 = await fs.mkdtemp(path.join(os.tmpdir(), 'pyr-digest3-'));
    const store2 = new LocalDerivativeObjectStore(root2);
    await store2.putImmutableObject('pyr/0/0_0.jpg', Readable.from(Buffer.from('abcd'))); // resized
    const b = (await computeLevelDigest(store2, 'pyr/0')).tileDigest;
    await store2.putImmutableObject('pyr/0/1_0.jpg', Readable.from(Buffer.alloc(0))); // zero-byte
    const z = await computeLevelDigest(store2, 'pyr/0');
    await fs.rm(root2, { recursive: true, force: true });

    expect(a).not.toBe(b);
    expect(z.objectCount).toBe(2);
    expect(z.byteCount).toBe('abcd'.length);
  });

  it('digests a whole pyramid and reports the aggregate byte/object counts', async () => {
    await put('pyr/0/0_0.jpg', Buffer.from('A'));
    await put('pyr/1/0_0.jpg', Buffer.from('BB'));
    await put('pyr/1/1_0.jpg', Buffer.from('CCC'));
    const res = await digestPyramid(store, 'pyr', [
      { level: 0, cols: 1, rows: 1, tileCount: 1 },
      { level: 1, cols: 2, rows: 1, tileCount: 2 },
    ]);
    expect(res.levels.map((l) => l.level)).toEqual([0, 1]);
    expect(res.aggregateObjects).toBe(3);
    expect(res.aggregateBytes).toBe(1 + 2 + 3);
    expect(res.levels.every((l) => /^[a-f0-9]{64}$/.test(l.tileDigest))).toBe(true);
  });
});
