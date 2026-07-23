import { randomUUID, createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  CheckedStream,
  DerivativeKeyError,
  DerivativeObjectStore,
  DerivativeStat,
  DerivativeWriteOnceError,
  ObjectRead,
  PutObjectResult,
  PutTreeResult,
} from './derivative-object-store';

/**
 * Program 5A · P5-3B.1B — local-filesystem DerivativeObjectStore (dev / test / CI).
 *
 * Write-once is enforced with an ATOMIC create-if-absent promotion: a fully-written staging file is
 * `link()`ed to its destination, which fails with EEXIST if the destination already exists — there is
 * no `exists? → rename` race. Objects live under `<root>/objects`; staging lives under `<root>/.staging`
 * and is never visible through the public API. Tree promotion walks only REGULAR files in deterministic
 * lexicographic order and rejects traversal, symlinks, and non-regular entries.
 */
export class LocalDerivativeObjectStore implements DerivativeObjectStore {
  private readonly objectsRoot: string;
  private readonly stagingRoot: string;

  constructor(root: string) {
    this.objectsRoot = path.join(root, 'objects');
    this.stagingRoot = path.join(root, '.staging');
  }

  async putImmutableObject(key: string, source: Readable): Promise<PutObjectResult> {
    const segs = normalizeKey(key);
    const dest = path.join(this.objectsRoot, ...segs);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.mkdir(this.stagingRoot, { recursive: true });

    const tmp = path.join(this.stagingRoot, `${randomUUID()}.tmp`);
    const hash = createHash('sha256');
    let sizeBytes = 0;
    const meter = new Transform({
      transform(chunk, _enc, cb) {
        hash.update(chunk);
        sizeBytes += chunk.length;
        cb(null, chunk);
      },
    });

    try {
      await pipeline(source, meter, createWriteStream(tmp));
      // Atomic write-once promotion: link fails with EEXIST if the destination already exists.
      try {
        await fs.link(tmp, dest);
      } catch (e: any) {
        if (e?.code === 'EEXIST') throw new DerivativeWriteOnceError(key);
        throw e;
      }
    } finally {
      await fs.rm(tmp, { force: true }).catch(() => undefined);
    }
    return { sizeBytes, checksum: hash.digest('hex') };
  }

  async putImmutableTree(prefix: string, sourceDir: string): Promise<PutTreeResult> {
    const prefixSegs = normalizeKey(prefix);
    const relPaths = await collectRegularFiles(sourceDir); // sorted, symlink/non-regular rejected
    let objectCount = 0;
    let byteCount = 0;
    for (const rel of relPaths) {
      const relSegs = rel.split(path.sep).filter((s) => s.length);
      const key = [...prefixSegs, ...relSegs].join('/');
      const res = await this.putImmutableObject(key, createReadStream(path.join(sourceDir, rel)));
      objectCount += 1;
      byteCount += res.sizeBytes;
    }
    return { objectCount, byteCount };
  }

  openReadStream(key: string): Readable {
    return createReadStream(path.join(this.objectsRoot, ...normalizeKey(key)));
  }

  async readObject(key: string): Promise<ObjectRead> {
    const abs = path.join(this.objectsRoot, ...normalizeKey(key));
    try {
      return { status: 'FOUND', bytes: await fs.readFile(abs) };
    } catch (e: any) {
      // ONLY a definitive "does not exist" maps to NOT_FOUND. Every other failure (EISDIR, EACCES, EIO,
      // …) is indeterminate and is re-thrown — it must never be read as absence (P5-3B.3 OD-D).
      if (e?.code === 'ENOENT') return { status: 'NOT_FOUND' };
      throw e;
    }
  }

  async openReadStreamChecked(key: string): Promise<CheckedStream> {
    const abs = path.join(this.objectsRoot, ...normalizeKey(key));
    let st: import('node:fs').Stats;
    try {
      st = await fs.stat(abs);
    } catch (e: any) {
      // Definitive absence → NOT_FOUND; anything else (EACCES/EIO/…) is indeterminate and is re-thrown.
      if (e?.code === 'ENOENT') return { status: 'NOT_FOUND' };
      throw e;
    }
    if (!st.isFile()) throw new Error(`derivative key is not a regular file: ${key}`); // e.g. a directory prefix
    // Path-based stream: default autoClose closes the fd on 'end', 'error', and destroy — so an interrupted
    // or cancelled consumer never leaks a descriptor. A post-open read fault surfaces as an 'error' event.
    return { status: 'FOUND', stream: createReadStream(abs), sizeBytes: st.size };
  }

  async stat(key: string): Promise<DerivativeStat> {
    const st = await fs.stat(path.join(this.objectsRoot, ...normalizeKey(key))).catch(() => null);
    return { key, exists: !!st, sizeBytes: st?.size ?? 0 };
  }

  async listPrefix(prefix: string): Promise<string[]> {
    const segs = normalizeKey(prefix);
    const dir = path.join(this.objectsRoot, ...segs);
    const rels = await collectRegularFiles(dir).catch(() => [] as string[]);
    // Objects live under <root>/objects; staging is under <root>/.staging → never enumerated here.
    return rels.map((rel) => [...segs, ...rel.split(path.sep)].join('/')).sort();
  }

  async delete(key: string): Promise<void> {
    await fs.rm(path.join(this.objectsRoot, ...normalizeKey(key)), { force: true });
  }
}

/** Split + validate a key into safe path segments (reject absolute / '.' / '..' / empty). */
function normalizeKey(key: string): string[] {
  const segs = key.split('/').filter((s) => s.length);
  if (segs.length === 0) throw new DerivativeKeyError(`empty key: "${key}"`);
  for (const s of segs) {
    if (s === '.' || s === '..' || path.isAbsolute(s)) throw new DerivativeKeyError(`unsafe segment "${s}"`);
  }
  return segs;
}

/**
 * Recursively collect REGULAR files under `dir` as relative paths, sorted lexicographically. Rejects
 * symlinks and non-regular entries (fifo/socket/device) — only real files are promotable.
 */
async function collectRegularFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(rel: string): Promise<void> {
    const abs = path.join(dir, rel);
    const entries = await fs.readdir(abs, { withFileTypes: true });
    for (const e of entries) {
      const childRel = rel ? path.join(rel, e.name) : e.name;
      const childAbs = path.join(dir, childRel);
      const l = await fs.lstat(childAbs);
      if (l.isSymbolicLink()) throw new DerivativeKeyError(`symlink not allowed: ${childRel}`);
      if (l.isDirectory()) {
        await walk(childRel);
      } else if (l.isFile()) {
        out.push(childRel);
      } else {
        throw new DerivativeKeyError(`non-regular file not allowed: ${childRel}`);
      }
    }
  }
  await walk('');
  return out.sort();
}
