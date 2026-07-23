import { createHash } from 'node:crypto';
import { constants as FS } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { LocalSourceObjectStore } from '../storage/local-source-object-store';
import { SourceObjectStore } from '../storage/source-object-store';
import { LocalSourceMaterializer } from './local-source-materializer';
import { SourceChecksumError, SourceChecksumFormatError } from './source-materializer';

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

describe('LocalSourceMaterializer (P5-3B.1B)', () => {
  let sourceRoot: string;
  let matRoot: string;
  let sourceStore: LocalSourceObjectStore;

  const KEY = 'slides/l/s/source/i/image.svs';

  beforeEach(async () => {
    sourceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'wsi-mat-src-'));
    matRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'wsi-mat-work-'));
    sourceStore = new LocalSourceObjectStore(sourceRoot);
  });
  afterEach(async () => {
    await fs.rm(sourceRoot, { recursive: true, force: true });
    await fs.rm(matRoot, { recursive: true, force: true });
  });

  async function seedSource(content: Buffer): Promise<string> {
    await sourceStore.createUploadSession(KEY);
    await sourceStore.writeChunk(KEY, 0, content);
    return (await sourceStore.completeUpload(KEY)).checksum;
  }

  async function workspaceCount(): Promise<number> {
    return fs.readdir(path.join(matRoot, 'materialization')).then((d) => d.length).catch(() => 0);
  }

  it('materializes a verified source into a read-only, seekable working file with a matching checksum', async () => {
    const content = Buffer.from('whole-slide-bytes');
    const checksum = await seedSource(content);
    const mat = new LocalSourceMaterializer(sourceStore, matRoot);

    const out = await mat.materializeVerifiedSource({ sourceObjectKey: KEY, expectedChecksum: checksum });
    expect(out.checksum).toBe(checksum);
    expect(await fs.readFile(out.path)).toEqual(content);

    // Working file is read-only (owner-write bit cleared).
    const st = await fs.stat(out.path);
    expect(st.mode & 0o200).toBe(0);
    await expect(fs.access(out.path, FS.W_OK)).rejects.toBeTruthy();

    // dispose removes the workspace, and is idempotent.
    await out.dispose();
    await out.dispose();
    expect(await workspaceCount()).toBe(0);
  });

  it('rejects a malformed checksum BEFORE reading the source (no copy)', async () => {
    const spy = jest.spyOn(sourceStore, 'openReadStream');
    const mat = new LocalSourceMaterializer(sourceStore, matRoot);
    await expect(
      mat.materializeVerifiedSource({ sourceObjectKey: KEY, expectedChecksum: 'not-a-sha' }),
    ).rejects.toBeInstanceOf(SourceChecksumFormatError);
    expect(spy).not.toHaveBeenCalled();
    expect(await workspaceCount()).toBe(0);
  });

  it('fails non-retryably on a checksum mismatch and cleans up the workspace', async () => {
    await seedSource(Buffer.from('real-bytes'));
    const wrong = sha(Buffer.from('different')); // valid format, wrong value
    const mat = new LocalSourceMaterializer(sourceStore, matRoot);

    await expect(
      mat.materializeVerifiedSource({ sourceObjectKey: KEY, expectedChecksum: wrong }),
    ).rejects.toBeInstanceOf(SourceChecksumError);
    expect(await workspaceCount()).toBe(0); // cleaned up
  });

  it('cleans up the workspace when the source stream errors mid-copy', async () => {
    // Fake store whose read stream errors partway — only openReadStream is used by the materializer.
    const failing: Pick<SourceObjectStore, 'openReadStream'> = {
      openReadStream: () =>
        new Readable({
          read() {
            this.push(Buffer.from('partial'));
            this.destroy(new Error('storage read failed'));
          },
        }),
    };
    const mat = new LocalSourceMaterializer(failing as SourceObjectStore, matRoot);
    await expect(
      mat.materializeVerifiedSource({ sourceObjectKey: KEY, expectedChecksum: sha(Buffer.from('x')) }),
    ).rejects.toBeTruthy();
    expect(await workspaceCount()).toBe(0); // cleanup ran; primary error preserved
  });
});
