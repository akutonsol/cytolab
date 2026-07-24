import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { DERIVATIVE_OBJECT_STORE, DerivativeObjectStore } from '../storage/derivative-object-store';
import { Manifest, MANIFEST_SCHEMA_ID } from '../processing/manifest/manifest';
import { generationManifestKey, generationPrefix, generationPyramidPrefix } from '../processing/derivative-keys';
import { ScopeError, ValidatedCapability } from './delivery-session.service';

/**
 * Program 5A · P5-5B-ii — resolve + open a permitted, immutable derivative artifact for a redeemed viewing
 * capability. It NEVER receives a token, NEVER touches the source store (no SOURCE_OBJECT_STORE injection),
 * and exposes ONLY the four typed artifact methods — there is no generic open(key)/getObject(path) escape
 * hatch. Every storage key is derived server-side from the capability's generation + the registered
 * SlideAsset registry; the client contributes only scope-gated selectors (level/x/y, associated role).
 */

export type AssociatedRole = 'LABEL' | 'MACRO' | 'THUMBNAIL';
export const ASSOCIATED_ROLES: AssociatedRole[] = ['LABEL', 'MACRO', 'THUMBNAIL'];

export interface RawTileCoords {
  level: string;
  x: string;
  y: string;
}
export interface ArtifactStream {
  stream: Readable;
  sizeBytes: number;
  contentType: string;
}

/** A tile coordinate was not a canonical non-negative integer. → 400 */
export class CoordinateError extends Error {
  constructor(detail: string) {
    super(`invalid tile coordinate: ${detail}`);
    this.name = 'CoordinateError';
  }
}
/** A tile coordinate was outside the manifest-declared bounds. → 404 */
export class TileBoundsError extends Error {
  constructor(detail: string) {
    super(`tile out of bounds: ${detail}`);
    this.name = 'TileBoundsError';
  }
}
/** No registered asset row for the requested role. → 404 */
export class ArtifactNotRegisteredError extends Error {
  constructor(role: string) {
    super(`no registered ${role} asset`);
    this.name = 'ArtifactNotRegisteredError';
  }
}
/** More than one registered asset row where exactly one is required. → 500 (integrity) */
export class AssetRegistryIntegrityError extends Error {
  constructor(role: string, count: number) {
    super(`expected exactly one ${role} asset, found ${count}`);
    this.name = 'AssetRegistryIntegrityError';
  }
}
/** The registered/persisted manifest is inconsistent with the generation state. → 500 (integrity) */
export class ManifestStateError extends Error {
  constructor(detail: string) {
    super(`manifest state error: ${detail}`);
    this.name = 'ManifestStateError';
  }
}
/** A registered object is definitively absent from storage. → 404 (logged as an anomaly when within bounds) */
export class ArtifactObjectMissingError extends Error {
  constructor(key: string) {
    super(`artifact object missing: ${key}`);
    this.name = 'ArtifactObjectMissingError';
  }
}

const TILE_EXT: Record<string, string> = { jpeg: 'jpg', jpg: 'jpg', png: 'png' };
const TILE_CONTENT_TYPE: Record<string, string> = { jpeg: 'image/jpeg', jpg: 'image/jpeg', png: 'image/png' };
const INT_GRAMMAR = /^(0|[1-9][0-9]*)$/; // canonical non-negative integer only

interface AssetRow {
  storageKey: string;
  checksum: string | null;
  sizeBytes: number | null;
}

/** Bounded, process-local LRU of parsed IMMUTABLE manifest structure. Never caches auth/capability state. */
class ManifestCache {
  private readonly map = new Map<string, Manifest>();
  constructor(private readonly capacity = 128) {}
  get(key: string): Manifest | undefined {
    const v = this.map.get(key);
    if (v) {
      this.map.delete(key);
      this.map.set(key, v);
    }
    return v;
  }
  set(key: string, val: Manifest): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, val);
    if (this.map.size > this.capacity) this.map.delete(this.map.keys().next().value as string);
  }
}

@Injectable()
export class ArtifactDeliveryService {
  private readonly logger = new Logger(ArtifactDeliveryService.name);
  private readonly manifestCache = new ManifestCache();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(DERIVATIVE_OBJECT_STORE) private readonly store: DerivativeObjectStore,
  ) {}

  async descriptor(cap: ValidatedCapability): Promise<ArtifactStream> {
    requireScope(cap, 'DESCRIPTOR');
    const asset = await this.exactlyOne(cap.generationId, 'DZI_DESCRIPTOR');
    return this.open(cap, asset.storageKey, 'application/xml');
  }

  async manifest(cap: ValidatedCapability): Promise<ArtifactStream> {
    requireScope(cap, 'MANIFEST');
    const asset = await this.exactlyOne(cap.generationId, 'MANIFEST');
    return this.open(cap, asset.storageKey, 'application/json');
  }

  async associated(cap: ValidatedCapability, role: AssociatedRole): Promise<ArtifactStream> {
    requireScope(cap, 'ASSOCIATED_IMAGES');
    const asset = await this.zeroOrOne(cap.generationId, role);
    if (!asset) throw new ArtifactNotRegisteredError(role);
    // No format is persisted for associated images → the safe fallback avoids mislabelling bytes (OD-1).
    return this.open(cap, asset.storageKey, 'application/octet-stream');
  }

  async tile(cap: ValidatedCapability, raw: RawTileCoords): Promise<ArtifactStream> {
    requireScope(cap, 'TILES');
    const { level, x, y } = parseTileCoords(raw);
    const manifest = await this.loadManifest(cap);
    if (level >= manifest.levels.length) throw new TileBoundsError(`level ${level} >= ${manifest.levels.length}`);
    const lv = manifest.levels[level];
    if (x >= lv.cols || y >= lv.rows) throw new TileBoundsError(`(${x},${y}) outside ${lv.cols}x${lv.rows} at level ${level}`);

    const ext = TILE_EXT[manifest.structure.tileFormat];
    const contentType = TILE_CONTENT_TYPE[manifest.structure.tileFormat];
    if (!ext || !contentType) throw new ManifestStateError(`unsupported tileFormat ${manifest.structure.tileFormat}`);

    const pyramid = await this.exactlyOne(cap.generationId, 'TILE_PYRAMID');
    const expectedPyramidRoot = generationPyramidPrefix(generationPrefix(cap.labId, cap.slideId, cap.generationId));
    if (pyramid.storageKey !== expectedPyramidRoot) throw new ManifestStateError(`TILE_PYRAMID at non-canonical key ${pyramid.storageKey}`);
    const key = `${pyramid.storageKey}/${level}/${x}_${y}.${ext}`;
    this.assertInGeneration(cap, key);
    const res = await this.store.openReadStreamChecked(key);
    if (res.status === 'NOT_FOUND') {
      // Within manifest-declared bounds but physically absent — surfaced as 404 but logged as an anomaly
      // (the verified manifest says this object should exist).
      this.logger.warn(`INTEGRITY: tile within bounds is missing from storage: ${key}`);
      throw new ArtifactObjectMissingError(key);
    }
    return { stream: res.stream, sizeBytes: res.sizeBytes, contentType };
  }

  // ── internals ────────────────────────────────────────────────────────────────────────────────────────
  private async open(cap: ValidatedCapability, key: string, contentType: string): Promise<ArtifactStream> {
    this.assertInGeneration(cap, key);
    const res = await this.store.openReadStreamChecked(key); // NOT_FOUND → 404; a thrown error → transient (503)
    if (res.status === 'NOT_FOUND') throw new ArtifactObjectMissingError(key);
    return { stream: res.stream, sizeBytes: res.sizeBytes, contentType };
  }

  /**
   * Defense-in-depth: EVERY served key must lie under this capability's own generation prefix. Because
   * source objects live under `.../source/...` (never `.../derivatives/<gen>/...`), this structurally makes
   * ingestion source objects — and any other generation's objects — unreachable, even if a registry row
   * were tampered to point elsewhere.
   */
  private assertInGeneration(cap: ValidatedCapability, key: string): void {
    const prefix = generationPrefix(cap.labId, cap.slideId, cap.generationId);
    if (key !== prefix && !key.startsWith(`${prefix}/`)) throw new ManifestStateError(`asset key escapes generation prefix: ${key}`);
  }

  private async exactlyOne(generationId: string, role: string): Promise<AssetRow> {
    const rows = await this.assetsFor(generationId, role);
    if (rows.length === 0) throw new ArtifactNotRegisteredError(role);
    if (rows.length > 1) throw new AssetRegistryIntegrityError(role, rows.length);
    return rows[0];
  }
  private async zeroOrOne(generationId: string, role: string): Promise<AssetRow | null> {
    const rows = await this.assetsFor(generationId, role);
    if (rows.length > 1) throw new AssetRegistryIntegrityError(role, rows.length);
    return rows[0] ?? null;
  }
  private assetsFor(generationId: string, role: string): Promise<AssetRow[]> {
    return this.prisma.$queryRaw<AssetRow[]>`
      SELECT "storageKey", checksum, "sizeBytes" FROM "SlideAsset" WHERE "generationId" = ${generationId} AND role = ${role}::"SlideAssetRole"
    `;
  }

  /** Load + verify the canonical manifest structure (cached by generationId:checksum — immutable). */
  private async loadManifest(cap: ValidatedCapability): Promise<Manifest> {
    const genRows = await this.prisma.$queryRaw<{ labId: string; slideId: string; derivativeManifestChecksum: string | null }[]>`
      SELECT "labId", "slideId", "derivativeManifestChecksum" FROM "DerivativeGeneration" WHERE id = ${cap.generationId}
    `;
    const gen = genRows[0];
    if (!gen || !gen.derivativeManifestChecksum) throw new ManifestStateError(`generation ${cap.generationId} has no manifest checksum`);
    const checksum = gen.derivativeManifestChecksum;

    const cacheKey = `${cap.generationId}:${checksum}`;
    const cached = this.manifestCache.get(cacheKey);
    if (cached) return cached;

    // R1 — cheap state-consistency checks before trusting the manifest for tile addressing.
    const asset = await this.exactlyOne(cap.generationId, 'MANIFEST');
    const expectedKey = generationManifestKey(generationPrefix(gen.labId, gen.slideId, cap.generationId));
    if (asset.storageKey !== expectedKey) throw new ManifestStateError('MANIFEST asset at non-canonical key');
    if (asset.checksum !== checksum) throw new ManifestStateError('MANIFEST asset checksum != generation checksum');

    const read = await this.store.readObject(asset.storageKey);
    if (read.status === 'NOT_FOUND') throw new ArtifactObjectMissingError(asset.storageKey);
    if (createHash('sha256').update(read.bytes).digest('hex') !== checksum) throw new ManifestStateError('MANIFEST bytes checksum mismatch');

    let parsed: Manifest;
    try {
      parsed = JSON.parse(read.bytes.toString('utf8')) as Manifest;
    } catch {
      throw new ManifestStateError('MANIFEST bytes are not valid JSON');
    }
    if (parsed.schemaId !== MANIFEST_SCHEMA_ID) throw new ManifestStateError(`unknown manifest schema ${parsed.schemaId}`);
    if (parsed.generationId !== cap.generationId) throw new ManifestStateError('manifest generationId mismatch');
    // R2 — dense rectangular levels: tileCount MUST equal cols*rows (no sparse pyramids in this contract).
    for (const lv of parsed.levels) {
      if (lv.tileCount !== lv.cols * lv.rows) throw new ManifestStateError(`level ${lv.level} is not dense (tileCount ${lv.tileCount} != ${lv.cols}x${lv.rows})`);
    }

    this.manifestCache.set(cacheKey, parsed);
    return parsed;
  }
}

function requireScope(cap: ValidatedCapability, scope: 'DESCRIPTOR' | 'TILES' | 'ASSOCIATED_IMAGES' | 'MANIFEST'): void {
  if (!cap.scopes.includes(scope as (typeof cap.scopes)[number])) throw new ScopeError(scope as (typeof cap.scopes)[number]);
}

function parseTileCoords(raw: RawTileCoords): { level: number; x: number; y: number } {
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v !== 'string' || !INT_GRAMMAR.test(v)) throw new CoordinateError(`${k}="${v}"`);
  }
  const level = Number(raw.level);
  const x = Number(raw.x);
  const y = Number(raw.y);
  if (![level, x, y].every((n) => Number.isSafeInteger(n))) throw new CoordinateError('coordinate exceeds safe integer range');
  return { level, x, y };
}
