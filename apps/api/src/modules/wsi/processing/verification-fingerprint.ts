import { createHash } from 'node:crypto';
import { canonicalSerialize } from './manifest/canonical-json';

/**
 * Program 5A · P5-3B.3B-ii-a — the SINGLE, pure certified-state fingerprint.
 *
 * A deterministic sha256 over exactly the persisted DB facts that independent verification (B.3A) relies
 * on — the "certified state". Both B.3A (when it certifies an outcome) and B.3B (inside the verdict
 * transaction, re-reading the row) build the surface and hash it THROUGH THIS ONE MODULE, so the stale
 * guard can never disagree merely because two code paths canonicalized differently.
 *
 * The surface covers every DB fact whose change between compute and commit could invalidate the verdict:
 * the relationship chain, the sealed identity + manifest checksum + tile-source type, the structural
 * metadata, the ingestion source provenance, and the ENTIRE registered SlideAsset inventory (incl. the
 * MANIFEST row). It deliberately EXCLUDES mutable workflow fields — status, verified, verifiedAt,
 * sealedAt, publishedAt, and any timestamps — whose legitimate change must not read as staleness.
 */
export interface CertifiedSurfaceInput {
  generationId: string;
  slideId: string;
  jobId: string;
  ingestionId: string;
  sealed: boolean;
  tileSourceType: string;
  derivativeManifestChecksum: string | null;
  tiledWidth: number | null;
  tiledHeight: number | null;
  tileSize: number | null;
  levelCount: number | null;
  sourceObjectKey: string | null;
  sourceChecksum: string | null;
}

export interface CertifiedSurfaceAsset {
  role: string;
  storageKey: string;
  checksum: string | null;
  sizeBytes: number | null;
}

export interface CertifiedSurface extends CertifiedSurfaceInput {
  /** The full SlideAsset registry (incl. MANIFEST), stable-sorted by (role, storageKey). */
  assets: CertifiedSurfaceAsset[];
}

/** Assemble the canonical certified surface. Assets are normalized + deterministically ordered here. */
export function buildCertifiedSurface(input: CertifiedSurfaceInput, assets: CertifiedSurfaceAsset[]): CertifiedSurface {
  const normalized = assets
    .map((a) => ({ role: a.role, storageKey: a.storageKey, checksum: a.checksum ?? null, sizeBytes: a.sizeBytes ?? null }))
    .sort((a, b) => (a.role === b.role ? a.storageKey.localeCompare(b.storageKey) : a.role.localeCompare(b.role)));
  return { ...input, assets: normalized };
}

/** sha256 over the canonical serialization of the surface (keys sorted; asset array order is pre-sorted). */
export function fingerprintCertifiedSurface(surface: CertifiedSurface): string {
  return createHash('sha256').update(canonicalSerialize(surface), 'utf8').digest('hex');
}
