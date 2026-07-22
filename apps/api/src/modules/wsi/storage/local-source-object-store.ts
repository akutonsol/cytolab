import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import {
  CompletedObject,
  SourceObjectStore,
  StoredObjectInfo,
  UploadSession,
} from './source-object-store';

/**
 * Program 5A · P5-3A — local-filesystem SourceObjectStore (dev / test / CI).
 *
 * Cost-free, deterministic, no cloud dependency — honoring the Program 5 / Program 9 boundary (a GCS
 * implementation of the same interface is deferred to Program 9). Chunks stream to a per-object temp
 * file under `<root>/.sessions`; the temp path is derived DETERMINISTICALLY from the object key, so an
 * interrupted upload resumes across a process restart. `completeUpload` streams the assembled bytes
 * through sha256 and atomically promotes the temp file to the final object path — it never buffers the
 * whole object in memory.
 */
export class LocalSourceObjectStore implements SourceObjectStore {
  constructor(private readonly root: string) {}

  private sessionPath(objectKey: string): string {
    // Deterministic per-object-key temp file → resumable across restarts, independent of the ingestion.
    const id = createHash('sha256').update(objectKey).digest('hex');
    return path.join(this.root, '.sessions', `${id}.part`);
  }

  private objectPath(objectKey: string): string {
    // Object keys are opaque, slash-delimited; keep them within the root.
    const safe = objectKey.split('/').filter((seg) => seg && seg !== '.' && seg !== '..');
    return path.join(this.root, 'objects', ...safe);
  }

  async createUploadSession(objectKey: string): Promise<UploadSession> {
    const sessionPath = this.sessionPath(objectKey);
    await fs.mkdir(path.dirname(sessionPath), { recursive: true });
    // Do NOT truncate an existing part file — that is what makes the session resumable.
    const handle = await fs.open(sessionPath, 'a');
    await handle.close();
    return { sessionId: path.basename(sessionPath, '.part'), objectKey };
  }

  async writeChunk(objectKey: string, offset: number, chunk: Buffer): Promise<{ nextOffset: number }> {
    const sessionPath = this.sessionPath(objectKey);
    await fs.mkdir(path.dirname(sessionPath), { recursive: true });
    const handle = await fs.open(sessionPath, 'r+').catch(async (e: NodeJS.ErrnoException) => {
      if (e.code === 'ENOENT') return fs.open(sessionPath, 'w+');
      throw e;
    });
    try {
      await handle.write(chunk, 0, chunk.length, offset);
    } finally {
      await handle.close();
    }
    return { nextOffset: offset + chunk.length };
  }

  async completeUpload(objectKey: string): Promise<CompletedObject> {
    const objectPath = this.objectPath(objectKey);

    // Idempotent: if the final object already exists, recompute its checksum + size and return.
    const existing = await this.stat(objectKey);
    if (existing.exists) {
      return { objectKey, sizeBytes: existing.sizeBytes, checksum: await this.hashFile(objectPath) };
    }

    const sessionPath = this.sessionPath(objectKey);
    const st = await fs.stat(sessionPath).catch(() => null);
    if (!st) {
      throw new Error(`no upload session bytes for object "${objectKey}"`);
    }
    const checksum = await this.hashFile(sessionPath);
    await fs.mkdir(path.dirname(objectPath), { recursive: true });
    await fs.rename(sessionPath, objectPath); // atomic promotion within the same filesystem
    return { objectKey, sizeBytes: st.size, checksum };
  }

  async abortUploadSession(objectKey: string): Promise<void> {
    await fs.rm(this.sessionPath(objectKey), { force: true });
  }

  async stat(objectKey: string): Promise<StoredObjectInfo> {
    const st = await fs.stat(this.objectPath(objectKey)).catch(() => null);
    return { objectKey, exists: !!st, sizeBytes: st?.size ?? 0 };
  }

  openReadStream(objectKey: string): Readable {
    return createReadStream(this.objectPath(objectKey));
  }

  async delete(objectKey: string): Promise<void> {
    await fs.rm(this.objectPath(objectKey), { force: true });
  }

  private hashFile(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256');
      const stream = createReadStream(filePath);
      stream.on('data', (d) => hash.update(d));
      stream.on('error', reject);
      stream.on('end', () => resolve(hash.digest('hex')));
    });
  }
}
