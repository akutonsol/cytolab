import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { WatchFolderScanner } from '../auto-ingestion/watch-folder-scanner';

/**
 * Program 5C · C6 — filesystem-discovery interoperability CHARACTERISATION of the accepted C4/B2 confinement
 * contract (WatchFolderScanner). Proves discovery across benign path variations (nested subdirs, spaces, Unicode,
 * duplicate filenames in different directories, identical bytes at different refs) while PRESERVING realpath
 * confinement, symlink-escape rejection, and the posix relative sourceRef. No confinement rule is weakened.
 */
const DCM = new Set(['.dcm']);
let root: string;
let outside: string;
const scanner = new WatchFolderScanner();

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'c6-fsi-root-'));
  outside = fs.mkdtempSync(path.join(os.tmpdir(), 'c6-fsi-out-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});
const put = (rel: string, bytes = Buffer.from('dcm')) => {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, bytes);
  return abs;
};
const refs = async () => (await scanner.scan(root, { exts: DCM, max: 100 })).map((d) => d.sourceRef).sort();

describe('P5C-C6 filesystem interoperability characterisation', () => {
  it('discovers nested subdirectories with a posix relative sourceRef', async () => {
    put('a/b/c/scan.dcm');
    expect(await refs()).toEqual(['a/b/c/scan.dcm']);
  });

  it('discovers spaces and Unicode in confined relative paths', async () => {
    put('with space/scan one.dcm');
    put('ünïcode/スライド.dcm');
    expect(await refs()).toEqual(['with space/scan one.dcm', 'ünïcode/スライド.dcm'].sort());
  });

  it('treats the same filename in different directories as distinct sourceRefs', async () => {
    put('dirA/slide.dcm');
    put('dirB/slide.dcm');
    expect(await refs()).toEqual(['dirA/slide.dcm', 'dirB/slide.dcm']);
  });

  it('discovers identical bytes at different refs as distinct discoveries (byte-dedup is downstream)', async () => {
    const same = Buffer.from('identical-native-bytes');
    put('one.dcm', same);
    put('two.dcm', same);
    const found = await scanner.scan(root, { exts: DCM, max: 100 });
    expect(found.map((d) => d.sourceRef).sort()).toEqual(['one.dcm', 'two.dcm']);
    expect(found[0].sizeBytes).toBe(found[1].sizeBytes); // same bytes; the scanner does not dedup (that is C2/B3's job)
  });

  it('ignores unsupported extensions', async () => {
    put('note.txt');
    put('slide.dcm');
    expect(await refs()).toEqual(['slide.dcm']);
  });

  it('fail-closed: an escaping symlink is never discovered (confinement preserved)', async () => {
    fs.writeFileSync(path.join(outside, 'secret.dcm'), Buffer.from('outside'));
    put('kept.dcm');
    let linked = true;
    try { fs.symlinkSync(path.join(outside, 'secret.dcm'), path.join(root, 'escape.dcm')); } catch { linked = false; }
    const found = await refs();
    expect(found).toContain('kept.dcm');
    if (linked) expect(found).not.toContain('escape.dcm'); // the escaping symlink is skipped
  });

  it('CHARACTERISATION: mixed-case extensions ARE discovered (the scanner lower-cases the extension)', async () => {
    // NOTE: this corrects the C6 preflight §18 assumption. WatchFolderScanner normalises the extension with
    // `.toLowerCase()`, so `.DCM`/`.Dcm` files are already discovered by the accepted scanner — mixed-case is NOT
    // a deferred gap. Characterised here as current, accepted behaviour; the scanner is unchanged.
    put('UPPER.DCM');
    put('Mixed.Dcm');
    expect(await refs()).toEqual(['Mixed.Dcm', 'UPPER.DCM'].sort());
  });
});
