import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  EngineIdentity,
  TilingEngine,
  TilingEngineError,
  TilingInput,
  TilingLevel,
  TilingResult,
} from './tiling-engine';

/**
 * Program 5A · P5-3B.1C — deterministic fake TilingEngine (CI; no libvips/OpenSlide).
 *
 * Byte-for-byte stable across platforms: given the same config it writes the same descriptor + tile
 * pyramid + associated images and returns the same TilingResult. `corruption` injects deterministic
 * bad output so the worker's output validator can be exercised without native dependencies.
 */
export type FakeCorruption =
  | 'none'
  | 'no-descriptor'
  | 'duplicate-descriptor'
  | 'descriptor-outside-root'
  | 'bad-level-count'
  | 'missing-tile-dir'
  | 'duplicate-role'
  | 'unsafe-relative-path'
  | 'crash'
  | 'unsupported-format'
  | 'hang';

export const FAKE_ENGINE_IDENTITY: EngineIdentity = { name: 'fake-tiling-engine', version: '1.0.0' };

export class FakeTilingEngine implements TilingEngine {
  constructor(private readonly corruption: FakeCorruption = 'none') {}

  async identity(): Promise<EngineIdentity> {
    return FAKE_ENGINE_IDENTITY;
  }

  async tile(input: TilingInput): Promise<TilingResult> {
    if (this.corruption === 'crash') throw new TilingEngineError('ENGINE_CRASH', 'fake engine crashed');
    if (this.corruption === 'unsupported-format') throw new TilingEngineError('UNSUPPORTED_FORMAT', 'unsupported WSI');
    if (this.corruption === 'hang') {
      await new Promise<void>((_res, rej) => {
        input.abortSignal.addEventListener('abort', () => rej(new TilingEngineError('ENGINE_CRASH', 'aborted')), { once: true });
      });
    }

    const out = input.outputDirectory;
    const tileSize = input.config.tileSize;
    // Small deterministic 2-level pyramid.
    const levels: TilingLevel[] = [
      { level: 0, cols: 1, rows: 1, tileCount: 1 },
      { level: 1, cols: 2, rows: 1, tileCount: 2 },
    ];

    // Descriptor (unless suppressed).
    if (this.corruption !== 'no-descriptor') {
      await fs.mkdir(out, { recursive: true });
      await fs.writeFile(path.join(out, 'descriptor.dzi'), `<Image TileSize="${tileSize}" Overlap="${input.config.overlap}"/>`);
      if (this.corruption === 'duplicate-descriptor') {
        await fs.writeFile(path.join(out, 'descriptor2.dzi'), 'dup');
      }
    }

    // Tile pyramid (unless a level dir is suppressed).
    for (const lv of levels) {
      if (this.corruption === 'missing-tile-dir' && lv.level === 1) continue;
      const dir = path.join(out, 'pyramid', String(lv.level));
      await fs.mkdir(dir, { recursive: true });
      for (let c = 0; c < lv.cols; c++) {
        await fs.writeFile(path.join(dir, `${c}_0.jpg`), `L${lv.level}-${c}_0`); // deterministic bytes
      }
    }

    await fs.writeFile(path.join(out, 'label.png'), 'LABEL');
    await fs.writeFile(path.join(out, 'thumbnail.png'), 'THUMB');

    const assets: TilingResult['assets'] = [
      { role: 'DZI_DESCRIPTOR', kind: 'object', relativePath: 'descriptor.dzi' },
      { role: 'TILE_PYRAMID', kind: 'tree', relativePath: 'pyramid' },
      { role: 'LABEL', kind: 'object', relativePath: 'label.png' },
      { role: 'THUMBNAIL', kind: 'object', relativePath: 'thumbnail.png' },
    ];
    if (this.corruption === 'duplicate-role') {
      assets.push({ role: 'DZI_DESCRIPTOR', kind: 'object', relativePath: 'descriptor.dzi' });
    }
    if (this.corruption === 'duplicate-descriptor') {
      assets.push({ role: 'DZI_DESCRIPTOR', kind: 'object', relativePath: 'descriptor2.dzi' });
    }
    if (this.corruption === 'descriptor-outside-root') {
      assets[0] = { role: 'DZI_DESCRIPTOR', kind: 'object', relativePath: '../escape.dzi' };
    }
    if (this.corruption === 'unsafe-relative-path') {
      assets[1] = { role: 'TILE_PYRAMID', kind: 'tree', relativePath: '/abs/pyramid' };
    }

    return {
      structure: {
        tiledWidth: 300,
        tiledHeight: 150,
        tileSize,
        overlap: input.config.overlap,
        tileFormat: input.config.tileFormat,
        levelCount: this.corruption === 'bad-level-count' ? 5 : levels.length, // mismatch vs actual dirs
        levels,
      },
      acquisition: { sourceWidth: 300, sourceHeight: 150, objectivePower: 40, mpp: 0.25, vendor: 'FakeScanner' },
      assets,
      engine: FAKE_ENGINE_IDENTITY,
      warnings: [],
      diagnostics: { fake: true },
    };
  }
}
