/**
 * Program 5A · P5-3B.2A — the canonical whole-generation manifest (types + identity constants).
 *
 * The manifest fingerprints the ENTIRE derivative generation. Every field below participates in the
 * canonical digest — there are no non-hashed fields inside the manifest bytes (operational metadata such
 * as sealedAt lives on the DerivativeGeneration row, never here). `sha256(canonicalBytes)` is the
 * DerivativeGeneration.derivativeManifestChecksum. Independent verification (B.3) dispatches parsing from
 * the explicit `schemaId`, never from a code version.
 */
export const MANIFEST_SCHEMA_ID = 'pathology.manifest.v1';
export const MANIFEST_BUILDER_VERSION = '1.0.0';
export const MANIFEST_DIGEST_ALGORITHM = 'sha256';

export interface ManifestProcessingConfig {
  configVersion: number;
  tileSize: number;
  overlap: number;
  tileFormat: string;
  quality: number;
  pyramidLayout: string;
  associatedImages: boolean;
  thumbnail: boolean;
}

export interface ManifestStructure {
  tiledWidth: number;
  tiledHeight: number;
  tileSize: number;
  overlap: number;
  tileFormat: string;
  levelCount: number;
}

export interface ManifestAcquisition {
  sourceWidth: number | null;
  sourceHeight: number | null;
  objectivePower: number | null;
  mpp: number | null;
  vendor: string | null;
}

export interface ManifestLevel {
  level: number;
  cols: number;
  rows: number;
  tileCount: number;
  /** Per-level tile-content digest computed from PERSISTED bytes (length-prefixed framing). */
  tileDigest: string;
}

export interface ManifestAsset {
  role: string;
  storageKey: string;
  /** Bounded-asset sha256; null for the TILE_PYRAMID (per-level integrity lives in `levels`). */
  checksum: string | null;
  sizeBytes: number;
  /** Present only for the TILE_PYRAMID (object count under the prefix). */
  objectCount?: number;
}

export interface Manifest {
  schemaId: string;
  builderVersion: string;
  digestAlgorithm: string;
  generationId: string;
  slideId: string;
  ingestionId: string;
  sourceObjectKey: string;
  sourceChecksum: string;
  engineName: string;
  engineVersion: string;
  processingConfig: ManifestProcessingConfig;
  structure: ManifestStructure;
  acquisition: ManifestAcquisition;
  /** Bounded assets + the TILE_PYRAMID, sorted by (role, storageKey); EXCLUDES the MANIFEST itself. */
  assets: ManifestAsset[];
  /** Sorted by level ascending. */
  levels: ManifestLevel[];
}
