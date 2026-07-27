import { mkdtemp, mkdir, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { pruneNonTilePyramidSidecars } from './libvips-tiling-engine';

/**
 * P5-4 Phase B Part 1B regression — the libvips real-engine output contract.
 *
 * The promoted pyramid tree MUST contain only tile payloads: the sealer's aggregate integrity check
 * (registered promoted aggregate == manifest-declared tile aggregate) rejects the generation otherwise.
 * libvips `dzsave` writes a `vips-properties.xml` sidecar at the top of `*_files`; this proves it (and any
 * future top-level sidecar) is pruned before promotion. Pure fs — does NOT require libvips to be installed.
 */
describe('pruneNonTilePyramidSidecars — libvips pyramid tree is tiles-only before promotion', () => {
  async function buildTree(extraTopLevelFiles: string[]): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), 'wsi-pyramid-'));
    // Deep Zoom layout: numbered level directories holding <col>_<row>.<ext> tiles.
    await mkdir(path.join(dir, '0'), { recursive: true });
    await mkdir(path.join(dir, '1'), { recursive: true });
    await writeFile(path.join(dir, '0', '0_0.jpg'), 'tile-0-0-0');
    await writeFile(path.join(dir, '1', '0_0.jpg'), 'tile-1-0-0');
    await writeFile(path.join(dir, '1', '1_0.jpg'), 'tile-1-1-0');
    for (const f of extraTopLevelFiles) await writeFile(path.join(dir, f), 'sidecar');
    return dir;
  }

  const tilesRemain = async (dir: string) => {
    const top = await readdir(dir, { withFileTypes: true });
    expect(top.filter((e) => e.isFile()).map((e) => e.name)).toEqual([]); // no stray non-tile file remains
    expect(top.filter((e) => e.isDirectory()).map((e) => e.name).sort()).toEqual(['0', '1']); // level dirs intact
    expect((await readdir(path.join(dir, '0'))).sort()).toEqual(['0_0.jpg']);
    expect((await readdir(path.join(dir, '1'))).sort()).toEqual(['0_0.jpg', '1_0.jpg']);
  };

  it('removes the known libvips vips-properties.xml sidecar, preserving every tile', async () => {
    const dir = await buildTree(['vips-properties.xml']);
    const removed = await pruneNonTilePyramidSidecars(dir);
    expect(removed).toEqual(['vips-properties.xml']);
    await tilesRemain(dir);
  });

  it('is robust to ANY future top-level sidecar name (guards against silent non-tile files)', async () => {
    const dir = await buildTree(['vips-properties.xml', 'some-future-sidecar.json']);
    const removed = (await pruneNonTilePyramidSidecars(dir)).sort();
    expect(removed).toEqual(['some-future-sidecar.json', 'vips-properties.xml']);
    await tilesRemain(dir);
  });

  it('is a no-op on a clean tiles-only tree', async () => {
    const dir = await buildTree([]);
    expect(await pruneNonTilePyramidSidecars(dir)).toEqual([]);
    await tilesRemain(dir);
  });
});
