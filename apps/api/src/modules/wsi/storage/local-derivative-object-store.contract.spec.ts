import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { LocalDerivativeObjectStore } from './local-derivative-object-store';

/**
 * P5-3B.3A — contract tests for the typed `readObject` read semantic (OD-D). The distinction that
 * verification relies on: a DEFINITIVELY-absent object returns NOT_FOUND, while any indeterminate failure
 * is THROWN (never collapsed into absence). The eventual GCS implementation must satisfy the same contract.
 */
describe('LocalDerivativeObjectStore.readObject — definitive presence semantics', () => {
  let root: string;
  let store: LocalDerivativeObjectStore;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), `deriv-contract-${randomUUID()}-`));
    store = new LocalDerivativeObjectStore(root);
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true }).catch(() => undefined);
  });

  it('returns FOUND with the exact bytes for an existing object', async () => {
    await store.putImmutableObject('slides/a/b/obj', Readable.from(Buffer.from('hello-bytes')));
    const read = await store.readObject('slides/a/b/obj');
    expect(read.status).toBe('FOUND');
    if (read.status === 'FOUND') expect(read.bytes.toString('utf8')).toBe('hello-bytes');
  });

  it('returns NOT_FOUND for a definitively-absent object', async () => {
    const read = await store.readObject('slides/a/b/does-not-exist');
    expect(read.status).toBe('NOT_FOUND');
  });

  it('THROWS (never NOT_FOUND) when the target exists but cannot be read as a regular object', async () => {
    // A key that resolves to a directory (the pyramid tree lives under a prefix) is an INDETERMINATE
    // read error (EISDIR), not an absence — the store must throw rather than report NOT_FOUND.
    await store.putImmutableObject('slides/a/pyramid/0/0_0.jpg', Readable.from(Buffer.from('tile')));
    await expect(store.readObject('slides/a/pyramid/0')).rejects.toThrow();
  });
});
