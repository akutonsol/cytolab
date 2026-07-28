import { Injectable } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import { ScannerAdapterRegistry } from '../../scanner/scanner-adapter-registry';
import { assertAdapterMatchesKind } from '../../scanner/scanner-adapter';
import type { IngestionSourceHealthChecker, ResolvedIngestionSource, SourceHealthResult } from '../source-health';

/**
 * Program 5C · C5 — FILESYSTEM import-connection health. Verifies (READ-ONLY): rootPath configured, resolves
 * (realpath), is a readable directory whose listing succeeds, and the configured adapter is registered +
 * transport-compatible. It NEVER writes/renames/deletes, never triggers scan discovery or ingestion, and never
 * infers scanner hardware health. A readable idle directory is HEALTHY. No absolute path is ever surfaced.
 */
@Injectable()
export class FilesystemHealthChecker implements IngestionSourceHealthChecker {
  constructor(private readonly adapters: ScannerAdapterRegistry) {}

  supports(source: ResolvedIngestionSource): boolean {
    return source.kind === 'FILESYSTEM';
  }

  async check(source: ResolvedIngestionSource): Promise<SourceHealthResult> {
    const started = Date.now();
    const rt = () => ({ responseTimeMs: Date.now() - started });

    // Adapter-config pre-check (a null adapterType = the legacy FILESYSTEM_IMAGE watch-folder path — valid).
    if (source.adapterType) {
      try {
        assertAdapterMatchesKind(source.adapterType, source.kind);
      } catch {
        return { state: 'MISCONFIGURED', errorCode: 'ADAPTER_TRANSPORT_MISMATCH', ...rt() };
      }
      if (source.adapterType !== 'FILESYSTEM_IMAGE' && !this.adapters.has(source.adapterType)) {
        return { state: 'MISCONFIGURED', errorCode: 'ADAPTER_NOT_REGISTERED', ...rt() };
      }
    }

    if (!source.rootPath) return { state: 'MISCONFIGURED', errorCode: 'SOURCE_MISCONFIGURED', ...rt() };

    let real: string;
    try {
      real = await fs.realpath(source.rootPath);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT') return { state: 'UNREACHABLE', errorCode: 'FILESYSTEM_NOT_FOUND', ...rt() };
      if (code === 'EACCES') return { state: 'UNREACHABLE', errorCode: 'FILESYSTEM_PERMISSION_DENIED', ...rt() };
      return { state: 'UNREACHABLE', errorCode: 'FILESYSTEM_UNREADABLE', ...rt() };
    }
    try {
      const st = await fs.stat(real);
      if (!st.isDirectory()) return { state: 'MISCONFIGURED', errorCode: 'SOURCE_MISCONFIGURED', ...rt() };
      await fs.readdir(real); // listing must succeed; contents are irrelevant (idle is healthy)
    } catch (e) {
      const code = (e as NodeJS.ErrnoException)?.code;
      if (code === 'EACCES') return { state: 'UNREACHABLE', errorCode: 'FILESYSTEM_PERMISSION_DENIED', ...rt() };
      return { state: 'UNREACHABLE', errorCode: 'FILESYSTEM_UNREADABLE', ...rt() };
    }
    return { state: 'HEALTHY', ...rt() };
  }
}
