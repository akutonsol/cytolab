import type { IngestionAdapterType } from '@prisma/client';

/**
 * Program 5C · C4 — the vendor-neutral scanner ADAPTER contract. An adapter is a translation/routing layer
 * over the ACCEPTED transports (FILESYSTEM / DICOMWEB) — never a new transport, pipeline, worker, slide-creation
 * or publication path. It discovers completed scans, normalizes vendor metadata to the small allowlist below,
 * produces a deterministic tenant/source-scoped sourceRef + a discriminated locator, and proves completeness.
 * The canonical router (not the adapter) routes each discovery to the correct accepted intake.
 */
export type ScanObjectKind = 'IMAGE_FILE' | 'DICOM_FILE' | 'DICOMWEB_SERIES';

/** Discriminated locator — never a bag of optional fields. */
export type ScanLocator =
  | { kind: 'IMAGE_FILE'; absPath: string }
  | { kind: 'DICOM_FILE'; absPath: string }
  | { kind: 'DICOMWEB_SERIES'; studyInstanceUID: string; seriesInstanceUID: string };

/** The ONLY scanner metadata an adapter may return/persist — operational/provenance, never PHI, no raw payload. */
export interface CanonicalScannerMetadata {
  adapterId: string;
  adapterVersion?: string;
  vendor?: string;
  scannerModel?: string;
  deviceIdentifier?: string; // pseudonymous
  acquisitionAt?: string;
  vendorSoftwareVersion?: string;
}

export interface CanonicalScanDiscovery {
  sourceRef: string; // deterministic idempotency key (relative ref / study·series) — no absolute host path
  objectKind: ScanObjectKind;
  locator: ScanLocator;
  sizeBytes?: number | null;
  scannerMetadata?: CanonicalScannerMetadata;
}

export interface CompletenessResult {
  complete: boolean;
  reason?: string;
}

/** The subset of a persisted IngestionSource an adapter needs (no credential material is handed to adapters). */
export interface ResolvedScannerSource {
  id: string;
  kind: string; // FILESYSTEM | DICOMWEB
  rootPath: string | null;
  endpointBaseUrl: string | null;
  adapterType: IngestionAdapterType | null;
}

export interface ScannerAdapter {
  readonly id: string;
  readonly adapterType: IngestionAdapterType;
  /** Discover completed scan objects for a configured source (already tenant-scoped by the caller). */
  discoverCompletedScans(source: ResolvedScannerSource): Promise<CanonicalScanDiscovery[]>;
  /** Prove a discovered object is a COMPLETED scan (stability/quiescence/manifest) before any handoff. */
  validateCompleteness(d: CanonicalScanDiscovery, source: ResolvedScannerSource): Promise<CompletenessResult>;
}

/** DI token collecting the statically-registered adapters (no dynamic/plugin loading). */
export const SCANNER_ADAPTERS = Symbol('SCANNER_ADAPTERS');

export type ScannerAdapterErrorCode =
  | 'UNSUPPORTED_ADAPTER'
  | 'ADAPTER_TRANSPORT_MISMATCH'
  | 'MALFORMED_VENDOR_PAYLOAD'
  | 'INCOMPLETE_SCAN'
  | 'UNSTABLE_SOURCE'
  | 'SOURCE_NOT_FOUND'
  | 'MANIFEST_MISMATCH'
  | 'SOURCE_CHANGED'
  | 'HANDOFF_FAILED';

/** A scanner-adapter/framework error — distinct from transport (DicomWebError) and clinical/conformance (C1/C2). */
export class ScannerAdapterError extends Error {
  constructor(
    public readonly code: ScannerAdapterErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ScannerAdapterError';
  }
}

/** Deterministic adapter↔transport compatibility (FILESYSTEM_* ⇒ FILESYSTEM; DICOMWEB ⇒ DICOMWEB). */
export function assertAdapterMatchesKind(adapterType: IngestionAdapterType, kind: string): void {
  const fsAdapters: IngestionAdapterType[] = ['FILESYSTEM_IMAGE', 'FILESYSTEM_DICOM'];
  const ok = (fsAdapters.includes(adapterType) && kind === 'FILESYSTEM') || (adapterType === 'DICOMWEB' && kind === 'DICOMWEB');
  if (!ok) throw new ScannerAdapterError('ADAPTER_TRANSPORT_MISMATCH', `adapterType ${adapterType} is not valid for source kind ${kind}`);
}
