import { Inject, Injectable } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import { WatchFolderScanner } from '../../auto-ingestion/watch-folder-scanner';
import { WATCH_FOLDER_CONFIG, type WatchFolderConfig } from '../../auto-ingestion/watch-folder-config';
import type { CanonicalScanDiscovery, CompletenessResult, ResolvedScannerSource, ScannerAdapter } from '../scanner-adapter';

const ADAPTER_ID = 'filesystem-dicom';
const ADAPTER_VERSION = '1';

/**
 * Program 5C · C4 — reference FILESYSTEM_DICOM adapter. Fills the genuine gap: a scanner that drops native
 * `.dcm` files into a watch folder. It reuses the ACCEPTED, realpath-confined WatchFolderScanner to discover
 * `.dcm` objects and the 5B mtime-quiescence completeness rule — then emits DICOM_FILE discoveries. It NEVER
 * decodes/re-encodes DICOM, never parses demographics, and never creates a slide: the router routes the exact
 * native bytes to the accepted C2 `ingestDicomWsi`. The sourceRef is the relative path (no absolute host path).
 */
@Injectable()
export class FilesystemDicomAdapter implements ScannerAdapter {
  readonly id = ADAPTER_ID;
  readonly adapterType = 'FILESYSTEM_DICOM' as const;

  constructor(
    private readonly scanner: WatchFolderScanner,
    @Inject(WATCH_FOLDER_CONFIG) private readonly cfg: WatchFolderConfig,
  ) {}

  async discoverCompletedScans(source: ResolvedScannerSource): Promise<CanonicalScanDiscovery[]> {
    if (!source.rootPath) return [];
    const files = await this.scanner.scan(source.rootPath, { exts: new Set(['.dcm']), max: this.cfg.maxFilesPerScan });
    return files.map((f) => ({
      sourceRef: f.sourceRef, // realpath-confined RELATIVE ref — the deterministic idempotency key
      objectKind: 'DICOM_FILE' as const,
      locator: { kind: 'DICOM_FILE' as const, absPath: f.absPath },
      sizeBytes: f.sizeBytes,
      scannerMetadata: { adapterId: this.id, adapterVersion: ADAPTER_VERSION },
    }));
  }

  /** Completed = mtime-quiescent (the 5B quiescence rule; the file has not been written within settleMs). */
  async validateCompleteness(d: CanonicalScanDiscovery, _source: ResolvedScannerSource): Promise<CompletenessResult> {
    if (d.locator.kind !== 'DICOM_FILE') return { complete: false, reason: 'not a DICOM file locator' };
    let mtimeMs: number;
    try {
      mtimeMs = (await fs.stat(d.locator.absPath)).mtimeMs;
    } catch {
      return { complete: false, reason: 'source vanished before completeness check' };
    }
    const quiet = Date.now() - mtimeMs >= this.cfg.settleMs;
    return quiet ? { complete: true } : { complete: false, reason: 'source not yet mtime-quiescent (still being written)' };
  }
}
