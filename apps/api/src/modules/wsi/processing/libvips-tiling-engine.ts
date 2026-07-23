import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Logger } from '@nestjs/common';
import {
  EngineIdentity,
  TilingEngine,
  TilingEngineError,
  TilingInput,
  TilingLevel,
  TilingResult,
} from './tiling-engine';

/**
 * Program 5A · P5-3B.1C — libvips (+OpenSlide) TilingEngine via a hardened subprocess boundary.
 *
 * Process boundary (the architecturally load-bearing part, and what B.1C fixes): direct executable +
 * argv array (NO shell, no interpolation), bounded stderr capture, config timeout, graceful SIGTERM →
 * SIGKILL escalation wired to the abort signal, and exit-code → error-code mapping.
 *
 * NOT CI-tested (no libvips/OpenSlide system dependency here). Per the approved architecture, this
 * adapter is not production-ready until ≥1 real WSI fixture passes validate → DZI → seal → verify — a
 * later gate. Metadata extraction (MPP / objective power / vendor / associated images) is therefore
 * best-effort here and finalized against that fixture; the fake engine drives all B.1C tests.
 */
export class LibvipsTilingEngine implements TilingEngine {
  private readonly logger = new Logger(LibvipsTilingEngine.name);
  constructor(private readonly executable: string = process.env.WSI_VIPS_BIN ?? 'vips') {}

  async identity(): Promise<EngineIdentity> {
    try {
      const { stdout } = await this.run(['--version'], { timeoutMs: 10_000 });
      const version = stdout.trim().split(/\s+/).pop() ?? 'unknown';
      return { name: 'libvips', version };
    } catch {
      throw new TilingEngineError('ENGINE_UNAVAILABLE', `libvips executable not available: ${this.executable}`);
    }
  }

  async tile(input: TilingInput): Promise<TilingResult> {
    const engine = await this.identity(); // fails ENGINE_UNAVAILABLE if the binary is missing
    const started = Date.now();
    const pyramidBase = path.join(input.outputDirectory, 'pyramid');
    const suffix = `.${input.config.tileFormat === 'jpeg' ? 'jpg' : input.config.tileFormat}[Q=${input.config.quality}]`;

    // argv array only — the working-file path and output base are arguments, never shell tokens.
    const args = [
      'dzsave',
      input.workingFilePath,
      pyramidBase,
      '--tile-size', String(input.config.tileSize),
      '--overlap', String(input.config.overlap),
      '--suffix', suffix,
    ];

    let res;
    try {
      res = await this.run(args, { timeoutMs: input.config.executionTimeoutMs, signal: input.abortSignal });
    } catch (e) {
      if (e instanceof TilingEngineError) throw e;
      throw new TilingEngineError('ENGINE_CRASH', `dzsave failed: ${(e as Error).message}`);
    }
    if (res.code !== 0) {
      const unsupported = /unsupported|not a .*file|unable to load|unknown file/i.test(res.stderr);
      throw new TilingEngineError(
        unsupported ? 'UNSUPPORTED_FORMAT' : 'ENGINE_CRASH',
        `dzsave exited ${res.code}: ${res.stderr.slice(-500)}`,
        { exitCode: res.code },
      );
    }

    // dzsave writes "<base>.dzi" + "<base>_files/<level>/<col>_<row>.<fmt>".
    const structure = await this.readDziStructure(`${pyramidBase}.dzi`, `${pyramidBase}_files`, input);
    return {
      structure,
      // Best-effort until the real-WSI validation gate (needs OpenSlide property reads).
      acquisition: { sourceWidth: structure.tiledWidth, sourceHeight: structure.tiledHeight, objectivePower: null, mpp: null, vendor: null },
      assets: [
        { role: 'DZI_DESCRIPTOR', kind: 'object', relativePath: 'pyramid.dzi' },
        { role: 'TILE_PYRAMID', kind: 'tree', relativePath: 'pyramid_files' },
      ],
      engine,
      warnings: [],
      diagnostics: { exitCode: res.code, durationMs: Date.now() - started },
    };
  }

  /** Parse the .dzi descriptor + count produced levels/tiles into the structural contract. */
  private async readDziStructure(dziPath: string, filesDir: string, input: TilingInput): Promise<TilingResult['structure']> {
    const xml = await fs.readFile(dziPath, 'utf8').catch(() => '');
    const width = Number(/Width="(\d+)"/.exec(xml)?.[1] ?? 0);
    const height = Number(/Height="(\d+)"/.exec(xml)?.[1] ?? 0);
    const levelNames = (await fs.readdir(filesDir, { withFileTypes: true }).catch(() => []))
      .filter((e) => e.isDirectory())
      .map((e) => Number(e.name))
      .filter((n) => Number.isInteger(n))
      .sort((a, b) => a - b);
    const levels: TilingLevel[] = [];
    for (const lvl of levelNames) {
      const files = await fs.readdir(path.join(filesDir, String(lvl))).catch(() => []);
      const cols = new Set(files.map((f) => f.split('_')[0])).size;
      const rows = new Set(files.map((f) => f.split('_')[1]?.split('.')[0])).size;
      levels.push({ level: lvl, cols: Math.max(cols, 1), rows: Math.max(rows, 1), tileCount: files.length });
    }
    return {
      tiledWidth: width,
      tiledHeight: height,
      tileSize: input.config.tileSize,
      overlap: input.config.overlap,
      tileFormat: input.config.tileFormat,
      levelCount: levels.length,
      levels,
    };
  }

  /** Spawn the executable with an argv array (no shell), capturing stdout/stderr with kill escalation. */
  private run(args: string[], opts: { timeoutMs: number; signal?: AbortSignal }): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.executable, args, { shell: false, windowsHide: true });
      let stdout = '';
      let stderr = '';
      const MAX = 64 * 1024; // bounded capture
      child.stdout?.on('data', (d) => { if (stdout.length < MAX) stdout += d.toString(); });
      child.stderr?.on('data', (d) => { if (stderr.length < MAX) stderr += d.toString(); });

      let killed = false;
      const kill = (reason: string) => {
        killed = true;
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 5_000).unref?.();
        reject(new TilingEngineError('ENGINE_CRASH', reason));
      };
      const timer = setTimeout(() => kill(`engine timed out after ${opts.timeoutMs}ms`), opts.timeoutMs);
      timer.unref?.();
      opts.signal?.addEventListener('abort', () => kill('engine aborted (lease loss / shutdown)'), { once: true });

      child.on('error', (e) => { clearTimeout(timer); if (!killed) reject(e); });
      child.on('close', (code) => { clearTimeout(timer); if (!killed) resolve({ code: code ?? -1, stdout, stderr }); });
    });
  }
}
