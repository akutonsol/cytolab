import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { WatchFolderScanner, isWithinRoot } from './watch-folder-scanner';

const EXTS = new Set(['.svs', '.tif']);

describe('P5B-B2 WatchFolderScanner — filesystem security boundary', () => {
  let root: string;
  let outside: string;
  const scanner = new WatchFolderScanner();

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'wf-root-'));
    outside = await fs.mkdtemp(path.join(os.tmpdir(), 'wf-out-'));
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  });

  it('discovers supported files (recursively) with a posix relative sourceRef; ignores unsupported', async () => {
    await fs.writeFile(path.join(root, 'a.svs'), 'x');
    await fs.mkdir(path.join(root, 'sub'));
    await fs.writeFile(path.join(root, 'sub', 'b.tif'), 'yy');
    await fs.writeFile(path.join(root, 'note.txt'), 'skip'); // unsupported ext
    const found = await scanner.scan(root, { exts: EXTS, max: 100 });
    expect(found.map((f) => f.sourceRef).sort()).toEqual(['a.svs', 'sub/b.tif']);
    expect(found.find((f) => f.sourceRef === 'sub/b.tif')!.sizeBytes).toBe(2);
  });

  it('fail-closed: a symlink resolving OUTSIDE the root is skipped', async () => {
    await fs.writeFile(path.join(outside, 'secret.svs'), 'zzz');
    await fs.symlink(path.join(outside, 'secret.svs'), path.join(root, 'escape.svs'));
    await fs.writeFile(path.join(root, 'ok.svs'), 'w');
    const found = await scanner.scan(root, { exts: EXTS, max: 100 });
    expect(found.map((f) => f.sourceRef)).toEqual(['ok.svs']); // escaping symlink not discovered
  });

  it('returns [] when the root is unavailable (retried next tick; no throw)', async () => {
    await expect(scanner.scan(path.join(root, 'does-not-exist'), { exts: EXTS, max: 100 })).resolves.toEqual([]);
  });
});

describe('P5B-B2 isWithinRoot', () => {
  it('accepts the root and contained paths, rejects escapes', () => {
    expect(isWithinRoot('/data/in', '/data/in')).toBe(true);
    expect(isWithinRoot('/data/in', '/data/in/sub/x.svs')).toBe(true);
    expect(isWithinRoot('/data/in', '/data/other/x.svs')).toBe(false);
    expect(isWithinRoot('/data/in', '/data')).toBe(false);
  });
});
