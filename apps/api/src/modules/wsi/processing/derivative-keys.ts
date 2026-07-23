/**
 * Program 5A · P5-3B.2B — canonical derivative storage-key generation (single source of truth).
 *
 * Both promotion (P5-3B.1C-ii) and sealing (P5-3B.2B) derive their object keys HERE so the two phases
 * can never diverge, and so future schema evolution can never introduce a second valid manifest path.
 * Keys are relative object keys within the DerivativeObjectStore (no leading slash).
 */
export function generationPrefix(labId: string, slideId: string, generationId: string): string {
  return `slides/${labId}/${slideId}/derivatives/${generationId}`;
}

/** The generation-scoped tile-pyramid tree prefix. */
export function generationPyramidPrefix(prefix: string): string {
  return `${prefix}/pyramid`;
}

/** A single bounded asset's object key (descriptor / label / macro / thumbnail). */
export function boundedAssetKey(prefix: string, role: string): string {
  return `${prefix}/${role.toLowerCase()}`;
}

/** THE canonical location of a generation's immutable manifest bytes. Exactly one per sealed generation. */
export function generationManifestKey(prefix: string): string {
  return `${prefix}/manifest.json`;
}
