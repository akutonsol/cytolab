import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Logger } from '@nestjs/common';
import { SourceObjectStore } from '../storage/source-object-store';
import {
  MaterializedSource,
  SourceChecksumError,
  SourceChecksumFormatError,
  SourceMaterializer,
} from './source-materializer';

const SHA256_HEX = /^[a-f0-9]{64}$/;

/**
 * Program 5A · P5-3B.1B — local streaming SourceMaterializer.
 *
 * Single-pass: streams the source object once, folding bytes into a running sha256 while writing the
 * working file (no double read, no whole-file buffer). Copies (never hardlinks/reflinks) so no engine
 * or native-lib bug can reach the authoritative source inode. The working file is made read-only before
 * hand-off. Cleanup on failure never masks the primary error.
 */
export class LocalSourceMaterializer implements SourceMaterializer {
  private readonly logger = new Logger(LocalSourceMaterializer.name);

  constructor(
    private readonly sourceStore: SourceObjectStore,
    private readonly root: string,
  ) {}

  async materializeVerifiedSource(input: { sourceObjectKey: string; expectedChecksum: string }): Promise<MaterializedSource> {
    // Reject a malformed checksum BEFORE copying a potentially huge WSI.
    if (!SHA256_HEX.test(input.expectedChecksum)) {
      throw new SourceChecksumFormatError();
    }

    // Private per-materialization workspace: materialization/<uuid>/working/<file>.
    const workspace = path.join(this.root, 'materialization', randomUUID());
    const workingDir = path.join(workspace, 'working');
    await fs.mkdir(workingDir, { recursive: true, mode: 0o700 });
    const filePath = path.join(workingDir, safeName(input.sourceObjectKey));

    const dispose = async (): Promise<void> => {
      // Idempotent + never throws (a missing workspace is fine).
      await fs.rm(workspace, { recursive: true, force: true }).catch(() => undefined);
    };

    try {
      const hash = createHash('sha256');
      const meter = new Transform({
        transform(chunk, _enc, cb) {
          hash.update(chunk);
          cb(null, chunk);
        },
      });
      await pipeline(this.sourceStore.openReadStream(input.sourceObjectKey), meter, createWriteStream(filePath, { mode: 0o600 }));

      const checksum = hash.digest('hex');
      if (checksum !== input.expectedChecksum) {
        throw new SourceChecksumError(input.sourceObjectKey);
      }
      await fs.chmod(filePath, 0o400); // read-only for the engine
      return { path: filePath, checksum, dispose };
    } catch (err) {
      // Cleanup must NEVER replace the primary error — dispose failures are logged, not thrown.
      await dispose().catch((cleanupErr) =>
        this.logger.warn(`materialization cleanup failed (primary error preserved): ${cleanupErr?.message ?? cleanupErr}`),
      );
      throw err;
    }
  }
}

/** Derive a single safe filename segment from the source key (never a path/traversal). */
function safeName(sourceObjectKey: string): string {
  const base = sourceObjectKey.split('/').filter(Boolean).pop() ?? 'source';
  const safe = base.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '');
  return safe.length ? safe.slice(0, 200) : 'source';
}
