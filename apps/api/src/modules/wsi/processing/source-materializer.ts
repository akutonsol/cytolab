/**
 * Program 5A · P5-3B.1B — materialize a VERIFIED source object into a private, seekable, read-only
 * local working file for the future tiling engine (OpenSlide needs a seekable path, not a stream).
 *
 * Responsibilities are deliberately narrow: obtain the verified source bytes, produce a seekable local
 * working copy, and prove the copied bytes equal the verified checksum. It is NOT a generic temp-file
 * manager and knows nothing about generations, engines, manifests, or sealing.
 */
export const SOURCE_MATERIALIZER = Symbol('SOURCE_MATERIALIZER');

export interface MaterializedSource {
  /** Absolute path to a read-only, seekable working file. */
  path: string;
  /** The re-computed sha256 (equal to the verified checksum). */
  checksum: string;
  /** Remove the working file + its private workspace. Idempotent; never throws. */
  dispose(): Promise<void>;
}

export interface SourceMaterializer {
  materializeVerifiedSource(input: {
    sourceObjectKey: string;
    expectedChecksum: string;
    // P5C-C2 — optional intake provenance. The base 5A materializer ignores it; the DICOM-aware decorator
    // uses it to decide whether to add the native-DICOM → working-image decode step. Absent = 5A behaviour.
    sourceKind?: string;
  }): Promise<MaterializedSource>;
}

/** The materialized bytes did not match the verified checksum (bad/altered source) — non-retryable. */
export class SourceChecksumError extends Error {
  constructor(sourceObjectKey: string) {
    super(`materialized source checksum mismatch for "${sourceObjectKey}"`);
    this.name = 'SourceChecksumError';
  }
}

/** The declared checksum is not a valid sha256 hex string — rejected BEFORE any copy. */
export class SourceChecksumFormatError extends Error {
  constructor() {
    super('expectedChecksum must be a lowercase 64-char sha256 hex string');
    this.name = 'SourceChecksumFormatError';
  }
}
