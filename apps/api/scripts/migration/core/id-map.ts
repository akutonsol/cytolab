/**
 * The legacy-int -> Osieri-uuid identity map.
 *
 * UUIDs are DETERMINISTIC: uuid = f(table, legacyId) via a stable hash. This is
 * the key to both performance and correctness — the same legacy row ALWAYS maps
 * to the same uuid, in any run, with NO database round-trip and NO persistence.
 * That removes a per-row write on the hot path and makes the nightly sync
 * resolve FKs to already-migrated rows for free. The in-memory store only serves
 * aliases (e.g. the workspace<->client pairing) within a run.
 */
import { createHash } from 'crypto';

const NAMESPACE = 'osieri-legacy-etl:v1';

/** Stable uuid-formatted string derived from (table, legacyId). */
export function deterministicUuid(table: string, legacyId: number): string {
  const h = createHash('sha1').update(`${NAMESPACE}:${table}:${legacyId}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export interface IdMapStore {
  /** All (legacyId -> uuid) pairs for one legacy table. */
  load(table: string): Promise<Map<number, string>>;
  /** Persist a new mapping. Must be idempotent on (table, legacyId). */
  put(table: string, legacyId: number, uuid: string): Promise<void>;
}

/** In-memory store — for dry-runs and unit tests. Not durable. */
export class MemoryIdMapStore implements IdMapStore {
  private data = new Map<string, Map<number, string>>();
  async load(table: string) {
    return this.data.get(table) ?? new Map<number, string>();
  }
  async put(table: string, legacyId: number, uuid: string) {
    let m = this.data.get(table);
    if (!m) this.data.set(table, (m = new Map()));
    m.set(legacyId, uuid);
  }
}

export class IdMap {
  private cache = new Map<string, Map<number, string>>();
  /**
   * @param lenient when true (dry-run only), `require` mints a placeholder for a
   * missing FK target instead of throwing — necessary because `--limit` sampling
   * pulls a record whose patient/parent may be outside the sample. Real loads
   * pass false so a genuine dangling FK still fails the run.
   */
  constructor(private store: IdMapStore, private lenient = false) {}

  private async table(table: string): Promise<Map<number, string>> {
    let m = this.cache.get(table);
    if (!m) this.cache.set(table, (m = await this.store.load(table)));
    return m;
  }

  /** Look up an existing uuid for a legacy id, or null. */
  async get(table: string, legacyId: number): Promise<string | null> {
    return (await this.table(table)).get(legacyId) ?? null;
  }

  /**
   * Bind a legacy id to a SPECIFIC uuid (idempotent). Used for aliasing — e.g.
   * pairing a legacy workspace id and its 1:1 client id to the same Osieri
   * Client uuid, so FKs from either legacy key resolve to one row.
   */
  async set(table: string, legacyId: number, uuid: string): Promise<void> {
    const m = await this.table(table);
    m.set(legacyId, uuid);
    await this.store.put(table, legacyId, uuid);
  }

  /** The uuid for a legacy row: an alias if one was set, else the deterministic id. */
  async getOrCreate(table: string, legacyId: number): Promise<string> {
    const m = await this.table(table);
    const existing = m.get(legacyId);
    if (existing) return existing;
    const uuid = deterministicUuid(table, legacyId);
    m.set(legacyId, uuid);
    return uuid;
  }

  /**
   * Resolve a REQUIRED foreign key. Uses an alias if present, else the
   * deterministic id (so it always resolves — a genuinely dangling FK surfaces
   * later as an insert-time FK violation, naming the constraint).
   */
  async require(table: string, legacyId: number | null | undefined): Promise<string> {
    if (legacyId === null || legacyId === undefined) {
      throw new Error(`idMap.require(${table}): missing legacy id`);
    }
    return (await this.get(table, legacyId)) ?? deterministicUuid(table, legacyId);
  }

  /**
   * Resolve an OPTIONAL foreign key: null in -> null out. A present-but-unaliased
   * id resolves to its deterministic uuid unless it's an alias-only table.
   */
  async optional(table: string, legacyId: number | null | undefined): Promise<string | null> {
    if (legacyId === null || legacyId === undefined) return null;
    if (this.aliasOnly.has(table)) return this.get(table, legacyId);
    return (await this.get(table, legacyId)) ?? deterministicUuid(table, legacyId);
  }

  /** Tables whose ids only ever come from an explicit alias (never deterministic). */
  private aliasOnly = new Set<string>(['workspace', 'client']);
}
