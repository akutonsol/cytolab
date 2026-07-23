import { TilingConfig } from './tiling-config';

/**
 * Program 5A · P5-3B.1C — the engine-neutral tiling contract.
 *
 * The engine consumes a verified seekable working-file path, a worker-owned output directory, explicit
 * config, and an abort signal — and NOTHING ELSE. It has no database access, no object-store
 * credentials, no generation ownership, and no final storage keys. It writes only under
 * `outputDirectory` and returns a structured, UNTRUSTED result (paths relative to `outputDirectory`;
 * the worker re-resolves + validates them). DZI is the Phase-1 produced format; a future IIIF/DICOM
 * engine satisfies the same contract.
 */
export const TILING_ENGINE = Symbol('TILING_ENGINE');

export type TilingAssetRole = 'DZI_DESCRIPTOR' | 'TILE_PYRAMID' | 'LABEL' | 'MACRO' | 'THUMBNAIL';

export interface TilingLevel {
  level: number;
  cols: number;
  rows: number;
  tileCount: number;
}

export interface TilingStructure {
  tiledWidth: number;
  tiledHeight: number;
  tileSize: number;
  overlap: number;
  tileFormat: string;
  levelCount: number;
  levels: TilingLevel[];
}

/** Source-intrinsic metadata (stable across generations). `null` = the engine could not determine it. */
export interface TilingAcquisition {
  sourceWidth: number | null;
  sourceHeight: number | null;
  objectivePower: number | null;
  mpp: number | null;
  vendor: string | null;
}

export interface TilingAssetOutput {
  role: TilingAssetRole;
  kind: 'object' | 'tree';
  /** Path RELATIVE to the engine's outputDirectory (untrusted — the worker re-resolves it). */
  relativePath: string;
}

export interface EngineIdentity {
  name: string;
  version: string;
}

export interface TilingResult {
  structure: TilingStructure;
  acquisition: TilingAcquisition;
  assets: TilingAssetOutput[];
  engine: EngineIdentity;
  warnings: string[];
  /** Operational diagnostics (process timings/exit); only engine version becomes provenance later. */
  diagnostics?: Record<string, unknown>;
}

export interface TilingInput {
  workingFilePath: string;
  outputDirectory: string;
  config: TilingConfig;
  abortSignal: AbortSignal;
}

export interface TilingEngine {
  tile(input: TilingInput): Promise<TilingResult>;
  identity(): Promise<EngineIdentity>;
}

export type TilingEngineErrorCode = 'UNSUPPORTED_FORMAT' | 'ENGINE_CRASH' | 'ENGINE_UNAVAILABLE';

/** A failure INSIDE the engine (subprocess). Distinct from INVALID_OUTPUT (bad data that WAS produced). */
export class TilingEngineError extends Error {
  constructor(
    public readonly code: TilingEngineErrorCode,
    message: string,
    public readonly diagnostics?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'TilingEngineError';
  }
}
