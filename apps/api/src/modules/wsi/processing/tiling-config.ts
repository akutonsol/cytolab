/**
 * Program 5A · P5-3B.1C — versioned tiling configuration.
 *
 * The tiling parameters passed to the engine. Values that change the PRODUCED BYTES are
 * reproducibility-affecting and must later be fingerprinted in the B.2 manifest's processing-config
 * (together with the engine name+version); `executionTimeoutMs` is purely operational. `configVersion`
 * lets the contract evolve without ambiguity.
 */
export interface TilingConfig {
  configVersion: number;
  tileSize: number;
  overlap: number;
  tileFormat: string; // e.g. "jpeg"
  quality: number; // encoder quality (jpeg)
  pyramidLayout: string; // "dzi" in Phase 1
  associatedImages: boolean; // extract label/macro when present
  thumbnail: boolean; // generate a thumbnail
  executionTimeoutMs: number; // operational only — NOT reproducibility-affecting
}

/** Fields whose values change the produced derivative bytes → must appear in the B.2 manifest. */
export const REPRODUCIBILITY_FIELDS = [
  'tileSize',
  'overlap',
  'tileFormat',
  'quality',
  'pyramidLayout',
  'associatedImages',
  'thumbnail',
] as const;

const num = (v: string | undefined, d: number): number => {
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export function loadTilingConfig(env: NodeJS.ProcessEnv = process.env): TilingConfig {
  return {
    configVersion: 1,
    tileSize: num(env.WSI_TILE_SIZE, 256),
    overlap: env.WSI_TILE_OVERLAP != null ? Math.max(0, Number(env.WSI_TILE_OVERLAP) || 0) : 1,
    tileFormat: env.WSI_TILE_FORMAT ?? 'jpeg',
    quality: num(env.WSI_TILE_QUALITY, 90),
    pyramidLayout: 'dzi',
    associatedImages: env.WSI_TILE_ASSOCIATED !== 'false',
    thumbnail: env.WSI_TILE_THUMBNAIL !== 'false',
    executionTimeoutMs: num(env.WSI_TILE_TIMEOUT_MS, 30 * 60_000),
  };
}
