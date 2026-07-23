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

/**
 * P5-3B.3A — the typed read semantic that separates integrity evidence from transient infrastructure
 * faults. `NOT_FOUND` is a DEFINITIVE absence (integrity evidence). Any indeterminate failure (timeout,
 * connection reset, permission, backend 5xx, EISDIR/EIO, …) is THROWN and must NEVER be represented as
 * absence — a caller may treat a thrown error as retryable, but never as "the object is gone".
 */
export type ObjectRead = { status: 'FOUND'; bytes: Buffer } | { status: 'NOT_FOUND' };

/**
 * P5-5A-ii — the STREAMING read semantic for delivery (distinct from the buffered `readObject`). Same
 * definitive-absence-vs-transient rule as `readObject`, but returns a stream instead of materializing
 * bytes. IMPORTANT: `FOUND` means only that the object was opened — it does NOT guarantee the transfer
 * completes. A mid-transfer read fault surfaces as a stream `'error'` event, which the consumer MUST treat
 * as an infrastructure failure (distinct from a clean `'end'`/EOF), never as absence.
 */
export type CheckedStream = { status: 'FOUND'; stream: Readable; sizeBytes: number } | { status: 'NOT_FOUND' };

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
  /**
   * Read a whole object into memory with DEFINITIVE presence semantics: returns `FOUND` with the bytes,
   * or `NOT_FOUND` for a definitively-absent object. THROWS on any indeterminate failure — a thrown error
   * must never be interpreted as absence. This is the contract P5-3B.3 verification relies on to avoid
   * converting a transient storage fault into a permanent QC failure.
   */
  readObject(key: string): Promise<ObjectRead>;
  /**
   * Streaming analog of `readObject` for delivery: `FOUND` with an open stream + size, `NOT_FOUND` for a
   * definitively-absent object, THROWS on any indeterminate/transient failure. The returned stream closes
   * its file descriptor on `'end'`, `'error'`, and destroy/cancel (no leak on interrupted transfers).
   */
  openReadStreamChecked(key: string): Promise<CheckedStream>;
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
