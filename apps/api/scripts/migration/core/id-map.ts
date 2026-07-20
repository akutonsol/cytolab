/**
 * The legacy-int -> Osieri-uuid identity map. Every legacy integer PK is
 * translated to a stable UUID so foreign keys can be rewritten and re-runs stay
 * idempotent (the same legacy row always resolves to the same UUID).
 *
 * Persistence is pluggable. For a full run it is backed by a table in the
 * staging/target DB; in tests/dry-runs an in-memory store is enough. Because
 * `getOrCreate` is deterministic per (table,id) within a process and durable
 * across runs via the store, the nightly incremental sync can resolve updates
 * to already-migrated rows.
 */
import { randomUUID } from 'crypto';

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

  /** Look up or mint-and-persist a uuid for a legacy id. Idempotent. */
  async getOrCreate(table: string, legacyId: number): Promise<string> {
    const m = await this.table(table);
    const existing = m.get(legacyId);
    if (existing) return existing;
    const uuid = randomUUID();
    m.set(legacyId, uuid);
    await this.store.put(table, legacyId, uuid);
    return uuid;
  }

  /**
   * Resolve a REQUIRED foreign key. Throws if the referenced legacy row was
   * never migrated — a dangling FK must fail the run, not silently null out.
   */
  async require(table: string, legacyId: number | null | undefined): Promise<string> {
    if (legacyId === null || legacyId === undefined) {
      throw new Error(`idMap.require(${table}): missing legacy id`);
    }
    const uuid = await this.get(table, legacyId);
    if (!uuid) {
      // Dry-run with --limit: the FK target may simply be outside the sample.
      if (this.lenient) return this.getOrCreate(table, legacyId);
      throw new Error(`idMap.require(${table}, ${legacyId}): no mapping — load ${table} before its dependents`);
    }
    return uuid;
  }

  /** Resolve an OPTIONAL foreign key: null in -> null out; missing map -> null. */
  async optional(table: string, legacyId: number | null | undefined): Promise<string | null> {
    if (legacyId === null || legacyId === undefined) return null;
    return this.get(table, legacyId);
  }
}
