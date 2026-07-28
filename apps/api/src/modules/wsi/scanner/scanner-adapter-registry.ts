import { Inject, Injectable } from '@nestjs/common';
import type { IngestionAdapterType } from '@prisma/client';
import { SCANNER_ADAPTERS, ScannerAdapterError, type ScannerAdapter } from './scanner-adapter';

/**
 * Program 5C · C4 — STATIC scanner-adapter registry. Adapters are compile-time DI providers collected under the
 * SCANNER_ADAPTERS token and indexed by IngestionAdapterType. No dynamic/plugin loading; no class name loaded
 * from the database and instantiated. FILESYSTEM_IMAGE is intentionally NOT registered here — its execution
 * stays the accepted 5B watch-folder path (unchanged); the registry serves only the C4 reference adapters.
 */
@Injectable()
export class ScannerAdapterRegistry {
  private readonly byType = new Map<IngestionAdapterType, ScannerAdapter>();

  constructor(@Inject(SCANNER_ADAPTERS) adapters: ScannerAdapter[]) {
    for (const a of adapters) this.byType.set(a.adapterType, a);
  }

  require(adapterType: IngestionAdapterType | null): ScannerAdapter {
    const a = adapterType ? this.byType.get(adapterType) : undefined;
    if (!a) throw new ScannerAdapterError('UNSUPPORTED_ADAPTER', `no scanner adapter registered for ${adapterType ?? 'null'}`);
    return a;
  }

  has(adapterType: IngestionAdapterType | null): boolean {
    return !!adapterType && this.byType.has(adapterType);
  }
}
