import { createHash, Hash } from 'node:crypto';
import { DerivativeObjectStore } from '../../storage/derivative-object-store';
import { ManifestLevel } from './manifest';

/**
 * Program 5A · P5-3B.2A — per-level pyramid integrity, computed from PERSISTED bytes.
 *
 * Digests are folded from what the DerivativeObjectStore actually holds (never engine temp output), in
 * deterministic lexicographic key order, using LENGTH-PREFIXED binary framing so no field boundary is
 * ambiguous. Each object contributes: framed(normalizedKey) ‖ framed(storedSize) ‖ framed(bytes) — the
 * key and size are included so a relocated/renamed/resized tile changes the digest.
 */
function frame(hash: Hash, buf: Buffer): void {
  const len = Buffer.allocUnsafe(4);
  len.writeUInt32BE(buf.length, 0);
  hash.update(len);
  hash.update(buf);
}

function readAll(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (d) => chunks.push(d as Buffer));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

export interface LevelDigest {
  tileDigest: string;
  objectCount: number;
  byteCount: number;
}

/** Digest one level's objects (under `levelPrefix`) from persisted storage. */
export async function computeLevelDigest(store: DerivativeObjectStore, levelPrefix: string): Promise<LevelDigest> {
  const keys = (await store.listPrefix(levelPrefix)).sort(); // deterministic order
  const hash = createHash('sha256');
  let byteCount = 0;
  for (const key of keys) {
    const bytes = await readAll(store.openReadStream(key));
    frame(hash, Buffer.from(key, 'utf8'));
    frame(hash, Buffer.from(String(bytes.length), 'utf8'));
    frame(hash, bytes);
    byteCount += bytes.length;
  }
  return { tileDigest: hash.digest('hex'), objectCount: keys.length, byteCount };
}

/**
 * Digest every level of a pyramid + return the aggregate byte/object counts (for the sealer to verify
 * against the registered TILE_PYRAMID SlideAsset.sizeBytes). `levels` supplies the structural metadata;
 * the digests come from persisted bytes.
 */
export async function digestPyramid(
  store: DerivativeObjectStore,
  pyramidPrefix: string,
  levels: { level: number; cols: number; rows: number; tileCount: number }[],
): Promise<{ levels: ManifestLevel[]; aggregateBytes: number; aggregateObjects: number }> {
  const out: ManifestLevel[] = [];
  let aggregateBytes = 0;
  let aggregateObjects = 0;
  for (const lv of [...levels].sort((a, b) => a.level - b.level)) {
    const d = await computeLevelDigest(store, `${pyramidPrefix}/${lv.level}`);
    out.push({ level: lv.level, cols: lv.cols, rows: lv.rows, tileCount: lv.tileCount, tileDigest: d.tileDigest });
    aggregateBytes += d.byteCount;
    aggregateObjects += d.objectCount;
  }
  return { levels: out, aggregateBytes, aggregateObjects };
}
