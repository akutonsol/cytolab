import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { FilesystemHealthChecker } from './filesystem-health.checker';

/** Program 5C · C5 — FILESYSTEM health: reachability only, read-only, no intake, no hardware claims. */
function adapters(over: Partial<{ has: (t: any) => boolean }> = {}) {
  return { has: over.has ?? (() => true), require: jest.fn() } as any;
}
const src = (over: any) => ({ id: 's', kind: 'FILESYSTEM', rootPath: null, endpointBaseUrl: null, authType: null, credentialCipher: null, adapterType: null, enabled: true, ...over });

describe('P5C-C5 FilesystemHealthChecker', () => {
  let root: string;
  beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'fsh-')); });
  afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

  it('a readable (even idle) directory → HEALTHY', async () => {
    const r = await new FilesystemHealthChecker(adapters()).check(src({ rootPath: root }));
    expect(r.state).toBe('HEALTHY');
    expect(typeof r.responseTimeMs).toBe('number');
  });

  it('missing rootPath → MISCONFIGURED', async () => {
    expect((await new FilesystemHealthChecker(adapters()).check(src({ rootPath: null }))).state).toBe('MISCONFIGURED');
  });

  it('non-existent path → UNREACHABLE / FILESYSTEM_NOT_FOUND', async () => {
    const r = await new FilesystemHealthChecker(adapters()).check(src({ rootPath: path.join(root, 'nope') }));
    expect(r.state).toBe('UNREACHABLE');
    expect(r.errorCode).toBe('FILESYSTEM_NOT_FOUND');
  });

  it('a file (not a directory) → MISCONFIGURED', async () => {
    const f = path.join(root, 'x'); await fs.writeFile(f, 'y');
    expect((await new FilesystemHealthChecker(adapters()).check(src({ rootPath: f }))).state).toBe('MISCONFIGURED');
  });

  it('adapter/transport mismatch → MISCONFIGURED / ADAPTER_TRANSPORT_MISMATCH', async () => {
    const r = await new FilesystemHealthChecker(adapters()).check(src({ rootPath: root, adapterType: 'DICOMWEB' }));
    expect(r.state).toBe('MISCONFIGURED');
    expect(r.errorCode).toBe('ADAPTER_TRANSPORT_MISMATCH');
  });

  it('unregistered filesystem adapter → MISCONFIGURED / ADAPTER_NOT_REGISTERED', async () => {
    const r = await new FilesystemHealthChecker(adapters({ has: () => false })).check(src({ rootPath: root, adapterType: 'FILESYSTEM_DICOM' }));
    expect(r.errorCode).toBe('ADAPTER_NOT_REGISTERED');
  });

  it('never surfaces an absolute path in the result', async () => {
    const r = await new FilesystemHealthChecker(adapters()).check(src({ rootPath: root }));
    expect(JSON.stringify(r)).not.toContain(root);
  });
});
