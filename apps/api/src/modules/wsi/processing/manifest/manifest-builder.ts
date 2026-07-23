import { createHash } from 'node:crypto';
import { canonicalSerialize } from './canonical-json';
import {
  Manifest,
  ManifestAcquisition,
  ManifestAsset,
  ManifestLevel,
  ManifestProcessingConfig,
  ManifestStructure,
  MANIFEST_BUILDER_VERSION,
  MANIFEST_DIGEST_ALGORITHM,
  MANIFEST_SCHEMA_ID,
} from './manifest';

export interface ManifestInput {
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
  /** Bounded assets + the TILE_PYRAMID (the MANIFEST asset must NOT be included; it is filtered out). */
  assets: ManifestAsset[];
  /** Per-level entries carrying their persisted-byte tileDigests. */
  levels: ManifestLevel[];
}

/**
 * Program 5A · P5-3B.2A — PURE, deterministic manifest builder. No DB, no storage, no transactions.
 * Given identical inputs it always yields identical canonical bytes + checksum. Assets are sorted by
 * (role, storageKey) and the MANIFEST asset is defensively excluded (no self-reference); levels are
 * sorted by level. `checksum = sha256(canonicalBytes)` is the generation's derivativeManifestChecksum.
 */
export function buildManifest(input: ManifestInput): { manifest: Manifest; bytes: Buffer; checksum: string } {
  const assets = [...input.assets]
    .filter((a) => a.role !== 'MANIFEST')
    .sort((a, b) => (a.role === b.role ? a.storageKey.localeCompare(b.storageKey) : a.role.localeCompare(b.role)));
  const levels = [...input.levels].sort((a, b) => a.level - b.level);

  const manifest: Manifest = {
    schemaId: MANIFEST_SCHEMA_ID,
    builderVersion: MANIFEST_BUILDER_VERSION,
    digestAlgorithm: MANIFEST_DIGEST_ALGORITHM,
    generationId: input.generationId,
    slideId: input.slideId,
    ingestionId: input.ingestionId,
    sourceObjectKey: input.sourceObjectKey,
    sourceChecksum: input.sourceChecksum,
    engineName: input.engineName,
    engineVersion: input.engineVersion,
    processingConfig: input.processingConfig,
    structure: input.structure,
    acquisition: input.acquisition,
    assets,
    levels,
  };

  const bytes = Buffer.from(canonicalSerialize(manifest), 'utf8');
  const checksum = createHash('sha256').update(bytes).digest('hex');
  return { manifest, bytes, checksum };
}
