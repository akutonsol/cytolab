// Program 5B · B2 — watch-folder worker configuration. DISABLED by default and ALWAYS under test
// (mirrors the accepted processing worker's WSI_PROCESSING_WORKER gate). Enabled only by explicit env.
export const WATCH_FOLDER_CONFIG = Symbol('WATCH_FOLDER_CONFIG');

export interface WatchFolderConfig {
  enabled: boolean;
  intervalMs: number;
  settleMs: number; // quiescence window (file must be size-stable across polls AND mtime-quiet this long)
  chunkBytes: number; // server-side upload chunk size (reuses the accepted chunked ingestion path)
  maxFilesPerScan: number; // bound per source per tick (no unbounded fan-out)
  exts: Set<string>; // supported WSI file extensions (lowercase, incl. dot)
}

function num(v: string | undefined, def: number): number {
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : def;
}

export function loadWatchFolderConfig(env: NodeJS.ProcessEnv = process.env): WatchFolderConfig {
  const exts = (env.WSI_WATCH_FOLDER_EXTS ?? '.svs,.ndpi,.tif,.tiff')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return {
    enabled: env.WSI_WATCH_FOLDER === 'true' && env.NODE_ENV !== 'test',
    intervalMs: num(env.WSI_WATCH_FOLDER_INTERVAL_MS, 15_000),
    settleMs: num(env.WSI_WATCH_FOLDER_SETTLE_MS, 5_000),
    chunkBytes: num(env.WSI_WATCH_FOLDER_CHUNK_BYTES, 8 * 1024 * 1024),
    maxFilesPerScan: num(env.WSI_WATCH_FOLDER_MAX_FILES, 200),
    exts: new Set(exts),
  };
}
