import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { FilesystemDicomAdapter } from './filesystem-dicom.adapter';
import { WatchFolderScanner } from '../../auto-ingestion/watch-folder-scanner';

/**
 * Program 5C · C4 — the filesystem-dicom adapter discovers only `.dcm` objects via the ACCEPTED confined
 * scanner, emits a relative-path sourceRef (no absolute host path) + a DICOM_FILE locator, and gates
 * completeness on 5B mtime-quiescence. It never reads/decodes pixels.
 */
describe('P5C-C4 FilesystemDicomAdapter', () => {
  const cfg: any = { settleMs: 5000, exts: new Set(['.svs']), maxFilesPerScan: 100, chunkBytes: 1024 };
  const adapter = new FilesystemDicomAdapter(new WatchFolderScanner(), cfg);
  let root: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'fsd-'));
    await fs.writeFile(path.join(root, 'scan1.dcm'), Buffer.from('DICM1'));
    await fs.writeFile(path.join(root, 'note.txt'), 'ignore me'); // non-.dcm must be skipped
  });
  afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

  const src = { id: 's1', kind: 'FILESYSTEM', rootPath: '', endpointBaseUrl: null, adapterType: 'FILESYSTEM_DICOM' as const };

  it('discovers only .dcm objects with a relative sourceRef + DICOM_FILE locator (no absolute path in sourceRef)', async () => {
    const found = await adapter.discoverCompletedScans({ ...src, rootPath: root });
    expect(found).toHaveLength(1);
    expect(found[0].sourceRef).toBe('scan1.dcm'); // relative, not absolute
    expect(found[0].objectKind).toBe('DICOM_FILE');
    expect(found[0].locator).toEqual({ kind: 'DICOM_FILE', absPath: expect.stringContaining('scan1.dcm') });
    expect(found[0].scannerMetadata?.adapterId).toBe('filesystem-dicom');
    // metadata allowlist — no patient/raw fields
    expect(Object.keys(found[0].scannerMetadata ?? {})).toEqual(expect.arrayContaining(['adapterId']));
    expect(JSON.stringify(found[0])).not.toMatch(/patient/i);
  });

  it('a freshly-written file is INCOMPLETE (not mtime-quiescent); an old file is complete', async () => {
    const found = await adapter.discoverCompletedScans({ ...src, rootPath: root });
    const fresh = await adapter.validateCompleteness(found[0], { ...src, rootPath: root });
    expect(fresh.complete).toBe(false); // just written → within settleMs
    // backdate mtime beyond settleMs → complete
    const old = new Date(Date.now() - 60_000);
    await fs.utimes(found[0].locator.kind === 'DICOM_FILE' ? found[0].locator.absPath : '', old, old);
    const quiet = await adapter.validateCompleteness(found[0], { ...src, rootPath: root });
    expect(quiet.complete).toBe(true);
  });
});
