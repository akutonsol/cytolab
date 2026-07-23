import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { DERIVATIVE_OBJECT_STORE, DerivativeObjectStore } from '../storage/derivative-object-store';
import { canonicalSerialize } from './manifest/canonical-json';
import { digestPyramid } from './manifest/pyramid-digest';
import { Manifest, MANIFEST_SCHEMA_ID } from './manifest/manifest';
import { generationManifestKey, generationPrefix, generationPyramidPrefix } from './derivative-keys';

/**
 * P5-3B.3A — the read-only, independent generation verifier.
 *
 * Consumes ONLY Prisma-persisted provenance (DerivativeGeneration / SlideProcessingJob / SlideIngestion /
 * SlideAsset) and the immutable derivative object store. No TilingResult, no processor/sealer state, no
 * engine execution. It RECOMPUTES every integrity value from persisted bytes and triangulates STORAGE ⟷
 * MANIFEST ⟷ DB, producing a typed outcome. It performs NO state transition and writes nothing — the
 * QC_PENDING → READY | QC_FAILED mutation and diagnostics persistence belong to P5-3B.3B.
 *
 * Independence has a documented limit: if a defect made all three persisted representations agree on the
 * same incorrect fact, there is no fourth oracle. Verification catches divergence and corruption, not a
 * uniformly-consistent-but-wrong seal.
 */

export type VerificationReasonCode =
  | 'MANIFEST_MISSING'
  | 'UNKNOWN_MANIFEST_SCHEMA'
  | 'MANIFEST_CHECKSUM_MISMATCH'
  | 'MANIFEST_NON_CANONICAL'
  | 'DB_MANIFEST_DIVERGENCE'
  | 'ASSET_MISSING'
  | 'ASSET_CHECKSUM_MISMATCH'
  | 'PYRAMID_AGGREGATE_MISMATCH'
  | 'PYRAMID_DIGEST_MISMATCH'
  | 'EXTRA_OBJECT';

/** Fixed precedence — collected reasons are ordered by this, NOT by discovery/I/O order (deterministic). */
const REASON_PRECEDENCE: VerificationReasonCode[] = [
  'MANIFEST_MISSING',
  'UNKNOWN_MANIFEST_SCHEMA',
  'MANIFEST_CHECKSUM_MISMATCH',
  'MANIFEST_NON_CANONICAL',
  'DB_MANIFEST_DIVERGENCE',
  'ASSET_MISSING',
  'ASSET_CHECKSUM_MISMATCH',
  'PYRAMID_AGGREGATE_MISMATCH',
  'PYRAMID_DIGEST_MISMATCH',
  'EXTRA_OBJECT',
];

export interface VerificationFailureReason {
  code: VerificationReasonCode;
  detail: string;
}

export type VerificationOutcome =
  | { status: 'READY' }
  | { status: 'QC_FAILED'; reasons: VerificationFailureReason[] }
  | { status: 'RETRYABLE'; cause: string };

export interface VerifyInput {
  generationId: string;
}

/** An indeterminate storage/infra failure surfaced during verification — outcome must be RETRYABLE, never QC_FAILED. */
export class TransientVerificationError extends Error {
  constructor(op: string, readonly cause: unknown) {
    super(`transient verification failure during ${op}: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'TransientVerificationError';
  }
}

interface DbGeneration {
  id: string;
  labId: string;
  slideId: string;
  jobId: string;
  tiledWidth: number | null;
  tiledHeight: number | null;
  tileSize: number | null;
  levelCount: number | null;
  derivativeManifestChecksum: string | null;
}
interface DbAsset {
  role: string;
  storageKey: string;
  checksum: string | null;
  sizeBytes: number | null;
}
interface VerifyContext {
  gen: DbGeneration;
  ingestionId: string;
  sourceObjectKey: string | null;
  sourceChecksum: string | null;
  assets: DbAsset[]; // includes MANIFEST
  prefix: string;
  manifestKey: string;
}

@Injectable()
export class GenerationVerifier {
  private readonly logger = new Logger(GenerationVerifier.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(DERIVATIVE_OBJECT_STORE) private readonly store: DerivativeObjectStore,
  ) {}

  async verify(input: VerifyInput): Promise<VerificationOutcome> {
    try {
      const ctx = await this.loadContext(input.generationId);

      // Foundational stage: nothing downstream can be trusted unless exactly one canonical MANIFEST reads
      // back, checksums three-way, parses to the known schema, and is byte-for-byte canonical.
      const foundation = await this.verifyManifestFoundation(ctx);
      if (foundation.reason) return this.fail([foundation.reason]);
      const manifest = foundation.manifest!;

      const reasons: VerificationFailureReason[] = [];
      reasons.push(...(await this.verifyAssets(ctx, manifest))); // §3 STORAGE ⟷ MANIFEST
      reasons.push(...this.verifyProvenance(ctx, manifest)); //       §4 MANIFEST ⟷ DB
      reasons.push(...(await this.verifyInventory(ctx, manifest))); // strict physical inventory

      return reasons.length ? this.fail(reasons) : { status: 'READY' };
    } catch (e) {
      if (e instanceof TransientVerificationError) return { status: 'RETRYABLE', cause: e.message };
      throw e; // a genuine bug is never masked as transient
    }
  }

  // ── context ───────────────────────────────────────────────────────────────────────────────────────
  private async loadContext(generationId: string): Promise<VerifyContext> {
    const genRows = await this.prisma.$queryRaw<DbGeneration[]>`
      SELECT id, "labId", "slideId", "jobId", "tiledWidth", "tiledHeight", "tileSize", "levelCount", "derivativeManifestChecksum"
      FROM "DerivativeGeneration" WHERE id = ${generationId}
    `;
    const gen = genRows[0];
    if (!gen) throw new Error(`generation ${generationId} not found`);

    const jobRows = await this.prisma.$queryRaw<{ ingestionId: string }[]>`
      SELECT "ingestionId" FROM "SlideProcessingJob" WHERE id = ${gen.jobId}
    `;
    if (!jobRows[0]) throw new Error(`job ${gen.jobId} not found for generation ${generationId}`);

    const ingRows = await this.prisma.$queryRaw<{ sourceObjectKey: string | null; sourceChecksum: string | null }[]>`
      SELECT "sourceObjectKey", "sourceChecksum" FROM "SlideIngestion" WHERE id = ${jobRows[0].ingestionId}
    `;
    const assets = await this.prisma.$queryRaw<DbAsset[]>`
      SELECT role::text AS role, "storageKey", checksum, "sizeBytes" FROM "SlideAsset"
      WHERE "generationId" = ${generationId} ORDER BY role, "storageKey"
    `;

    const prefix = generationPrefix(gen.labId, gen.slideId, gen.id);
    return {
      gen,
      ingestionId: jobRows[0].ingestionId,
      sourceObjectKey: ingRows[0]?.sourceObjectKey ?? null,
      sourceChecksum: ingRows[0]?.sourceChecksum ?? null,
      assets,
      prefix,
      manifestKey: generationManifestKey(prefix),
    };
  }

  // ── §2 foundational manifest verification ───────────────────────────────────────────────────────────
  private async verifyManifestFoundation(ctx: VerifyContext): Promise<{ manifest?: Manifest; reason?: VerificationFailureReason }> {
    const manifestAssets = ctx.assets.filter((a) => a.role === 'MANIFEST');
    if (manifestAssets.length !== 1) {
      return { reason: reason('MANIFEST_MISSING', `expected exactly 1 MANIFEST asset, found ${manifestAssets.length}`) };
    }
    const manifestAsset = manifestAssets[0];

    const read = await this.readObject(manifestAsset.storageKey);
    if (read.status === 'NOT_FOUND') return { reason: reason('MANIFEST_MISSING', `manifest bytes absent at ${manifestAsset.storageKey}`) };

    const actualChecksum = sha256(read.bytes);
    if (actualChecksum !== manifestAsset.checksum || actualChecksum !== ctx.gen.derivativeManifestChecksum) {
      return {
        reason: reason(
          'MANIFEST_CHECKSUM_MISMATCH',
          `sha256(bytes)=${actualChecksum} asset.checksum=${manifestAsset.checksum} generation.checksum=${ctx.gen.derivativeManifestChecksum}`,
        ),
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(read.bytes.toString('utf8'));
    } catch {
      return { reason: reason('MANIFEST_NON_CANONICAL', 'manifest bytes are not valid JSON') };
    }
    if (!isPlainRecord(parsed)) return { reason: reason('MANIFEST_NON_CANONICAL', 'manifest is not a JSON object') };
    if (parsed.schemaId !== MANIFEST_SCHEMA_ID) {
      return { reason: reason('UNKNOWN_MANIFEST_SCHEMA', `schemaId=${JSON.stringify(parsed.schemaId)} (this verifier certifies only ${MANIFEST_SCHEMA_ID})`) };
    }
    if (!isStructurallyValid(parsed)) return { reason: reason('MANIFEST_NON_CANONICAL', 'manifest is missing required fields or has wrong field types') };
    if (canonicalSerialize(parsed) !== read.bytes.toString('utf8')) {
      return { reason: reason('MANIFEST_NON_CANONICAL', 'stored manifest bytes are not the canonical serialization of their content') };
    }

    return { manifest: parsed as unknown as Manifest };
  }

  // ── §3 STORAGE ⟷ MANIFEST asset recomputation ──────────────────────────────────────────────────────
  private async verifyAssets(ctx: VerifyContext, manifest: Manifest): Promise<VerificationFailureReason[]> {
    const reasons: VerificationFailureReason[] = [];
    for (const a of manifest.assets) {
      if (a.role === 'MANIFEST') continue; // defensively — the builder already excludes it
      if (a.role === 'TILE_PYRAMID') {
        reasons.push(...(await this.verifyPyramid(ctx, manifest, a.sizeBytes, a.objectCount ?? -1)));
        continue;
      }
      const read = await this.readObject(a.storageKey);
      if (read.status === 'NOT_FOUND') {
        reasons.push(reason('ASSET_MISSING', `${a.role} bytes absent at ${a.storageKey}`));
        continue;
      }
      const digest = sha256(read.bytes);
      if (digest !== a.checksum || read.bytes.length !== a.sizeBytes) {
        reasons.push(reason('ASSET_CHECKSUM_MISMATCH', `${a.role} at ${a.storageKey}: sha256=${digest}/${read.bytes.length}B vs manifest ${a.checksum}/${a.sizeBytes}B`));
      }
    }
    return reasons;
  }

  private async verifyPyramid(ctx: VerifyContext, manifest: Manifest, declaredBytes: number, declaredObjects: number): Promise<VerificationFailureReason[]> {
    const reasons: VerificationFailureReason[] = [];
    let pyr: Awaited<ReturnType<typeof digestPyramid>>;
    try {
      pyr = await digestPyramid(this.store, generationPyramidPrefix(ctx.prefix), manifest.levels);
    } catch (e) {
      throw new TransientVerificationError('digest pyramid', e);
    }
    if (pyr.aggregateBytes !== declaredBytes || pyr.aggregateObjects !== declaredObjects) {
      reasons.push(reason('PYRAMID_AGGREGATE_MISMATCH', `recomputed ${pyr.aggregateBytes}B/${pyr.aggregateObjects} objects vs manifest ${declaredBytes}B/${declaredObjects}`));
    }
    const byLevel = new Map(pyr.levels.map((l) => [l.level, l.tileDigest]));
    for (const lv of manifest.levels) {
      const recomputed = byLevel.get(lv.level);
      if (recomputed !== lv.tileDigest) {
        reasons.push(reason('PYRAMID_DIGEST_MISMATCH', `level ${lv.level}: recomputed ${recomputed} vs manifest ${lv.tileDigest}`));
      }
    }
    return reasons;
  }

  // ── §4 MANIFEST ⟷ DB provenance ─────────────────────────────────────────────────────────────────────
  private verifyProvenance(ctx: VerifyContext, manifest: Manifest): VerificationFailureReason[] {
    const reasons: VerificationFailureReason[] = [];
    const diverge = (field: string, mv: unknown, dv: unknown) => {
      if (mv !== dv) reasons.push(reason('DB_MANIFEST_DIVERGENCE', `${field}: manifest=${JSON.stringify(mv)} db=${JSON.stringify(dv)}`));
    };
    diverge('generationId', manifest.generationId, ctx.gen.id);
    diverge('slideId', manifest.slideId, ctx.gen.slideId);
    diverge('ingestionId', manifest.ingestionId, ctx.ingestionId);
    diverge('sourceObjectKey', manifest.sourceObjectKey, ctx.sourceObjectKey);
    diverge('sourceChecksum', manifest.sourceChecksum, ctx.sourceChecksum);
    diverge('structure.tiledWidth', manifest.structure.tiledWidth, ctx.gen.tiledWidth);
    diverge('structure.tiledHeight', manifest.structure.tiledHeight, ctx.gen.tiledHeight);
    diverge('structure.tileSize', manifest.structure.tileSize, ctx.gen.tileSize);
    diverge('structure.levelCount', manifest.structure.levelCount, ctx.gen.levelCount);

    // Registered inventory: the manifest's non-MANIFEST assets must match the SlideAsset rows exactly.
    const dbInv = new Map(ctx.assets.filter((a) => a.role !== 'MANIFEST').map((a) => [`${a.role} ${a.storageKey}`, a]));
    const seen = new Set<string>();
    for (const a of manifest.assets) {
      if (a.role === 'MANIFEST') continue;
      const key = `${a.role} ${a.storageKey}`;
      seen.add(key);
      const db = dbInv.get(key);
      if (!db) {
        reasons.push(reason('DB_MANIFEST_DIVERGENCE', `manifest asset not registered: ${a.role} ${a.storageKey}`));
        continue;
      }
      if (db.checksum !== a.checksum || db.sizeBytes !== a.sizeBytes) {
        reasons.push(reason('DB_MANIFEST_DIVERGENCE', `asset ${a.role} ${a.storageKey}: manifest ${a.checksum}/${a.sizeBytes}B vs db ${db.checksum}/${db.sizeBytes}B`));
      }
    }
    for (const key of dbInv.keys()) {
      if (!seen.has(key)) reasons.push(reason('DB_MANIFEST_DIVERGENCE', `registered asset absent from manifest: ${key.replace(' ', ' ')}`));
    }
    // The MANIFEST asset must sit at the single canonical key.
    const manifestAsset = ctx.assets.find((a) => a.role === 'MANIFEST');
    if (manifestAsset && manifestAsset.storageKey !== ctx.manifestKey) {
      reasons.push(reason('DB_MANIFEST_DIVERGENCE', `manifest asset at non-canonical key ${manifestAsset.storageKey} (expected ${ctx.manifestKey})`));
    }
    return reasons;
  }

  // ── strict physical inventory (namespace-aware) ─────────────────────────────────────────────────────
  private async verifyInventory(ctx: VerifyContext, manifest: Manifest): Promise<VerificationFailureReason[]> {
    let actual: string[];
    try {
      actual = await this.store.listPrefix(ctx.prefix);
    } catch (e) {
      throw new TransientVerificationError('list generation prefix', e);
    }
    const boundedKeys = new Set(manifest.assets.filter((a) => a.role !== 'TILE_PYRAMID').map((a) => a.storageKey));
    const expectedNonPyramid = new Set<string>([ctx.manifestKey, ...boundedKeys]);
    const levelPrefixes = manifest.levels.map((l) => `${generationPyramidPrefix(ctx.prefix)}/${l.level}/`);

    const reasons: VerificationFailureReason[] = [];
    for (const key of actual) {
      if (expectedNonPyramid.has(key)) continue; // manifest.json + bounded assets (content validated in §3)
      if (levelPrefixes.some((p) => key.startsWith(p))) continue; // legitimate pyramid tile (validated by digest)
      reasons.push(reason('EXTRA_OBJECT', key));
    }
    return reasons;
  }

  // ── helpers ─────────────────────────────────────────────────────────────────────────────────────────
  private async readObject(key: string) {
    try {
      return await this.store.readObject(key);
    } catch (e) {
      throw new TransientVerificationError(`read ${key}`, e);
    }
  }

  private fail(reasons: VerificationFailureReason[]): VerificationOutcome {
    const ordered = [...reasons].sort(
      (a, b) => REASON_PRECEDENCE.indexOf(a.code) - REASON_PRECEDENCE.indexOf(b.code) || a.detail.localeCompare(b.detail),
    );
    this.logger.warn(`generation verification FAILED: ${ordered.map((r) => r.code).join(', ')}`);
    return { status: 'QC_FAILED', reasons: ordered };
  }
}

function reason(code: VerificationReasonCode, detail: string): VerificationFailureReason {
  return { code, detail };
}
function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}
function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isStructurallyValid(m: Record<string, unknown>): boolean {
  return (
    typeof m.generationId === 'string' &&
    typeof m.slideId === 'string' &&
    typeof m.ingestionId === 'string' &&
    typeof m.sourceObjectKey === 'string' &&
    typeof m.sourceChecksum === 'string' &&
    typeof m.engineName === 'string' &&
    typeof m.engineVersion === 'string' &&
    isPlainRecord(m.structure) &&
    isPlainRecord(m.acquisition) &&
    isPlainRecord(m.processingConfig) &&
    Array.isArray(m.assets) &&
    Array.isArray(m.levels)
  );
}
