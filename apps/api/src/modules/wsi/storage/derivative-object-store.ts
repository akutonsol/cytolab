import { Readable } from 'node:stream';

/**
 * Program 5A · P5-3B.1B — the private DERIVATIVE object store (immutable, write-once).
 *
 * Distinct from the P5-3A SourceObjectStore (resumable uploads): derivatives are produced whole and are
 * WRITE-ONCE. Two write shapes — a single bounded object, and a generation-scoped TREE (a tile pyramid
 * is many immutable objects promoted under one prefix). Knows nothing about generations, assets,
 * manifests, or sealing — that ownership stays in orchestration. A GCS implementation satisfies this
 * same interface in Program 9 (write-once ⇒ ifGenerationMatch:0; listPrefix ⇒ prefix list).
 */
export const DERIVATIVE_OBJECT_STORE = Symbol('DERIVATIVE_OBJECT_STORE');

export interface PutObjectResult {
  sizeBytes: number;
  checksum: string; // sha256 (lowercase hex) of the written bytes
}

/** Aggregate accounting only — NO per-object checksums / digests in B.1 (per-level integrity is B.2). */
export interface PutTreeResult {
  objectCount: number;
  byteCount: number;
}

export interface DerivativeStat {
  key: string;
  exists: boolean;
  sizeBytes: number;
}

export interface DerivativeObjectStore {
  /** Write a single immutable object. Fails (write-once) if the key already exists. */
  putImmutableObject(key: string, source: Readable): Promise<PutObjectResult>;
  /**
   * Promote every REGULAR file under `sourceDir` (a worker-owned temp output dir) into the store under
   * `prefix/<relative path>`, in deterministic lexicographic order, write-once. Rejects traversal,
   * symlinks, and non-regular files. Returns aggregate object count + byte count.
   */
  putImmutableTree(prefix: string, sourceDir: string): Promise<PutTreeResult>;
  openReadStream(key: string): Readable;
  stat(key: string): Promise<DerivativeStat>;
  /** Deterministically-ordered keys under a prefix (never exposes internal staging). */
  listPrefix(prefix: string): Promise<string[]>;
  /** Byte reclamation (for a later GC checkpoint). */
  delete(key: string): Promise<void>;
}

/** A write violated the write-once contract — the destination key already exists. */
export class DerivativeWriteOnceError extends Error {
  constructor(key: string) {
    super(`derivative object already exists (write-once): ${key}`);
    this.name = 'DerivativeWriteOnceError';
  }
}

/** An invalid/unsafe object key or tree entry (traversal, absolute, empty, symlink, non-regular). */
export class DerivativeKeyError extends Error {
  constructor(detail: string) {
    super(`invalid derivative key/entry: ${detail}`);
    this.name = 'DerivativeKeyError';
  }
}
