import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { TilingAssetRole, TilingResult } from './tiling-engine';

/**
 * Program 5A · P5-3B.1C — validate UNTRUSTED tiling-engine output before promotion.
 *
 * The engine result (and every path it reports) is treated as hostile until proven otherwise: paths are
 * independently re-resolved beneath the output root, the descriptor and each associated-image role must
 * be unique, the structure must be internally coherent, and the descriptor must reference exactly the
 * promoted pyramid namespace. Any violation → InvalidEngineOutputError (distinct from an engine crash).
 */
export class InvalidEngineOutputError extends Error {
  readonly code = 'INVALID_OUTPUT' as const;
  constructor(detail: string) {
    super(`invalid tiling-engine output: ${detail}`);
    this.name = 'InvalidEngineOutputError';
  }
}

/** Resolve a relative path strictly beneath `root`; reject absolute paths and traversal. */
function resolveWithin(root: string, rel: string): string {
  if (!rel || path.isAbsolute(rel)) throw new InvalidEngineOutputError(`unsafe path "${rel}"`);
  const rootAbs = path.resolve(root);
  const resolved = path.resolve(rootAbs, rel);
  if (resolved !== rootAbs && !resolved.startsWith(rootAbs + path.sep)) {
    throw new InvalidEngineOutputError(`path escapes output root: "${rel}"`);
  }
  return resolved;
}

async function assertNoSymlinksRegularOnly(dir: string): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    const l = await fs.lstat(abs);
    if (l.isSymbolicLink()) throw new InvalidEngineOutputError(`symlink in output: ${abs}`);
    if (l.isDirectory()) await assertNoSymlinksRegularOnly(abs);
    else if (!l.isFile()) throw new InvalidEngineOutputError(`non-regular file in output: ${abs}`);
  }
}

export async function validateTilingOutput(result: TilingResult, outputDirectory: string): Promise<void> {
  // ── Role uniqueness ──────────────────────────────────────────────────────────────────────────────
  const counts = new Map<TilingAssetRole, number>();
  for (const a of result.assets) counts.set(a.role, (counts.get(a.role) ?? 0) + 1);
  if ((counts.get('DZI_DESCRIPTOR') ?? 0) !== 1) throw new InvalidEngineOutputError('exactly one DZI_DESCRIPTOR required');
  if ((counts.get('TILE_PYRAMID') ?? 0) !== 1) throw new InvalidEngineOutputError('exactly one TILE_PYRAMID required');
  for (const role of ['LABEL', 'MACRO', 'THUMBNAIL'] as const) {
    if ((counts.get(role) ?? 0) > 1) throw new InvalidEngineOutputError(`duplicate ${role} asset`);
  }

  // ── Path safety + on-disk shape (untrusted paths re-resolved beneath the output root) ───────────────
  let pyramidDir = '';
  for (const a of result.assets) {
    const resolved = resolveWithin(outputDirectory, a.relativePath);
    const l = await fs.lstat(resolved).catch(() => null);
    if (!l) throw new InvalidEngineOutputError(`missing asset "${a.relativePath}"`);
    if (l.isSymbolicLink()) throw new InvalidEngineOutputError(`asset is a symlink: "${a.relativePath}"`);
    if (a.kind === 'object' && !l.isFile()) throw new InvalidEngineOutputError(`asset "${a.relativePath}" is not a regular file`);
    if (a.kind === 'tree') {
      if (!l.isDirectory()) throw new InvalidEngineOutputError(`tree asset "${a.relativePath}" is not a directory`);
      await assertNoSymlinksRegularOnly(resolved);
      if (a.role === 'TILE_PYRAMID') pyramidDir = resolved;
    }
  }

  // ── Structural coherence ───────────────────────────────────────────────────────────────────────────
  const s = result.structure;
  if (!(s.tiledWidth > 0) || !(s.tiledHeight > 0) || !(s.tileSize > 0)) {
    throw new InvalidEngineOutputError('non-positive dimensions/tileSize');
  }
  if (s.levelCount !== s.levels.length) {
    throw new InvalidEngineOutputError(`levelCount ${s.levelCount} != declared levels ${s.levels.length}`);
  }
  for (const lv of s.levels) {
    if (!(lv.cols > 0) || !(lv.rows > 0) || !(lv.tileCount > 0) || lv.tileCount > lv.cols * lv.rows) {
      throw new InvalidEngineOutputError(`incoherent level ${lv.level}`);
    }
  }

  // ── Descriptor ↔ pyramid relationship: the pyramid must contain exactly the declared level dirs ─────
  const levelDirs = (await fs.readdir(pyramidDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  const expected = s.levels.map((l) => String(l.level)).sort();
  if (levelDirs.length !== expected.length || !expected.every((v, i) => v === levelDirs[i])) {
    throw new InvalidEngineOutputError(`pyramid level directories [${levelDirs}] != declared levels [${expected}]`);
  }
}
