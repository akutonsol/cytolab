import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface DiscoveredFile {
  sourceRef: string; // posix path relative to the resolved root (the idempotency key with sourceId)
  absPath: string; // resolved (realpath) absolute path, proven to be within the root
  sizeBytes: number;
  mtimeMs: number;
}

/**
 * Program 5B · B2 — filesystem watch-folder scanner. SECURITY BOUNDARY.
 *
 * The configured rootPath is authoritative. Every candidate is resolved with realpath() and confined to
 * realpath(root): a path that resolves OUTSIDE the root — via `..` traversal or an escaping symlink — is
 * skipped (fail-closed), never discovered. Symlinks that resolve INSIDE the root are followed to their
 * real target. Filename content is NEVER trusted for tenant/patient/accession/record/specimen identity.
 * Only regular files with a supported extension are returned; source paths never become public URLs.
 */
@Injectable()
export class WatchFolderScanner {
  private readonly logger = new Logger(WatchFolderScanner.name);

  async scan(rootPath: string, opts: { exts: Set<string>; max: number }): Promise<DiscoveredFile[]> {
    let rootReal: string;
    try {
      rootReal = await fs.realpath(rootPath);
    } catch {
      this.logger.warn(`watch-folder source root unavailable (skipped this tick): ${rootPath}`);
      return []; // source temporarily unavailable → retried next tick; no discovery/FAILED persisted
    }

    const out: DiscoveredFile[] = [];
    const walk = async (dir: string): Promise<void> => {
      if (out.length >= opts.max) return;
      let entries: import('node:fs').Dirent[];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return; // unreadable subdir → skip, do not abort the whole scan
      }
      for (const e of entries) {
        if (out.length >= opts.max) break;
        const abs = path.join(dir, e.name);
        let real: string;
        let st: import('node:fs').Stats;
        try {
          real = await fs.realpath(abs); // resolves symlinks to their true target
          st = await fs.stat(real);
        } catch {
          continue; // broken symlink / vanished entry → skip
        }
        if (!isWithinRoot(rootReal, real)) {
          this.logger.warn(`watch-folder: skipping path that escapes the source root: ${abs} → ${real}`);
          continue; // fail-closed: escaping symlink / traversal
        }
        if (st.isDirectory()) {
          await walk(real);
          continue;
        }
        if (!st.isFile()) continue;
        const ext = path.extname(e.name).toLowerCase();
        if (!opts.exts.has(ext)) continue;
        const sourceRef = path.relative(rootReal, real).split(path.sep).join('/');
        out.push({ sourceRef, absPath: real, sizeBytes: st.size, mtimeMs: st.mtimeMs });
      }
    };
    await walk(rootReal);
    return out;
  }
}

/** True iff `p` is the root itself or strictly contained within it (after both are realpath-resolved). */
export function isWithinRoot(rootReal: string, p: string): boolean {
  const rel = path.relative(rootReal, p);
  return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
}
