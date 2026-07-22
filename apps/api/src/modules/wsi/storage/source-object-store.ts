import { Readable } from 'node:stream';

/**
 * Program 5A · P5-3A — the private source-object storage abstraction.
 *
 * Expressed purely in object-lifecycle terms — upload session, object, metadata, stream, deletion —
 * NEVER in storage-technology terms. The application layer must never know whether an object lives on
 * a local filesystem, in GCS, or in another backend (Refinement 1). Bytes are streamed, never buffered
 * whole. Uploads are RESUMABLE: an upload session is keyed by the object key and survives a process
 * restart, so an interrupted upload can continue from its last offset.
 *
 * The upload SESSION is transport state with a lifecycle independent of the SlideIngestion clinical
 * provenance (Refinement 4): abandoning a session leaves only reclaimable temp bytes, not an abandoned
 * ingestion. A production backend (GCS resumable session / signed direct-to-store) satisfies this same
 * contract without changing orchestration; the P5-3A implementation is a local filesystem store.
 */

/** DI token for the active SourceObjectStore implementation. */
export const SOURCE_OBJECT_STORE = Symbol('SOURCE_OBJECT_STORE');

/** A resumable upload session handle. `sessionId` is transport identity; `objectKey` is the target. */
export interface UploadSession {
  sessionId: string;
  objectKey: string;
}

/** The result of finalizing an upload — the integrity anchor computed from the PERSISTED bytes. */
export interface CompletedObject {
  objectKey: string;
  sizeBytes: number;
  /** sha256 (lowercase hex) of the fully-assembled, persisted object. */
  checksum: string;
}

export interface StoredObjectInfo {
  objectKey: string;
  exists: boolean;
  sizeBytes: number;
}

export interface SourceObjectStore {
  /** Prepare (or resume) a resumable upload session for a target object key. Idempotent. */
  createUploadSession(objectKey: string): Promise<UploadSession>;

  /** Append bytes at an absolute offset (resumable/idempotent per offset). Never buffers the whole object. */
  writeChunk(objectKey: string, offset: number, chunk: Buffer): Promise<{ nextOffset: number }>;

  /**
   * Finalize the upload: assemble the object, compute its size + streaming checksum from the PERSISTED
   * bytes, and make it the durable object. Idempotent — a second call returns the same CompletedObject.
   */
  completeUpload(objectKey: string): Promise<CompletedObject>;

  /** Discard an incomplete session's temp bytes (does not affect a completed object). */
  abortUploadSession(objectKey: string): Promise<void>;

  stat(objectKey: string): Promise<StoredObjectInfo>;
  openReadStream(objectKey: string): Readable;
  delete(objectKey: string): Promise<void>;
}
