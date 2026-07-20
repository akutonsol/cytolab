/**
 * Read-only adapter over the legacy Postgres database.
 *
 * STRICTLY read-only: the connection sets `default_transaction_read_only = on`,
 * so any accidental write throws at the DB. Intended to run against a SNAPSHOT
 * or read replica (never the live primary during business hours) — and always
 * inside the customer's cloud, so PHI never leaves their environment.
 *
 * Streams rows in batches (server-side cursor via keyset pagination on the
 * integer PK) so the 360k-row `clinical_item` table never loads into memory at
 * once.
 */
import { Client, ClientConfig } from 'pg';

export interface LegacySourceConfig extends ClientConfig {
  /** High-water mark for incremental sync: only rows with dateupdated > since. */
  since?: Date | null;
}

export class LegacySource {
  private client: Client;
  constructor(private cfg: LegacySourceConfig) {
    this.client = new Client(cfg);
  }

  async connect(): Promise<void> {
    await this.client.connect();
    // Belt-and-suspenders: make the whole session read-only.
    await this.client.query('SET default_transaction_read_only = on');
    await this.client.query('SET statement_timeout = 0');
  }

  async end(): Promise<void> {
    await this.client.end();
  }

  /** Ad-hoc read-only query (for small lookups: pairings, single rows). */
  async query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
    const res = await this.client.query(text, params);
    return res.rows as T[];
  }

  /** Exact row count for a table (for reconciliation). */
  async count(table: string, whereSince = false): Promise<number> {
    const where = whereSince && this.cfg.since ? 'WHERE dateupdated > $1' : '';
    const params = whereSince && this.cfg.since ? [this.cfg.since] : [];
    const res = await this.client.query(`SELECT count(*)::int AS n FROM public.${table} ${where}`, params);
    return res.rows[0].n as number;
  }

  /**
   * Stream a table in ascending-id batches. Applies the incremental `since`
   * filter when configured. Yields arrays of rows so callers can bulk-upsert.
   */
  async *stream<T = Record<string, unknown>>(
    table: string,
    opts: { batchSize?: number; incremental?: boolean; orderBy?: string } = {},
  ): AsyncGenerator<T[]> {
    const batchSize = opts.batchSize ?? 1000;
    const key = opts.orderBy ?? 'id';
    const sinceClause = opts.incremental && this.cfg.since ? 'AND dateupdated > $2' : '';
    let last = -1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const params: unknown[] = [last];
      if (sinceClause) params.push(this.cfg.since);
      const res = await this.client.query(
        `SELECT * FROM public.${table} WHERE ${key} > $1 ${sinceClause} ORDER BY ${key} ASC LIMIT ${batchSize}`,
        params,
      );
      if (res.rows.length === 0) return;
      yield res.rows as T[];
      last = (res.rows[res.rows.length - 1] as Record<string, number>)[key];
      if (res.rows.length < batchSize) return;
    }
  }

  /** Fetch all clinical_item rows for a set of clinical_features ids (for the pivot). */
  async clinicalItemsFor(featureIds: number[]): Promise<Record<string, unknown>[]> {
    if (featureIds.length === 0) return [];
    const res = await this.client.query(
      `SELECT clinicalfeatures_id, name, value, datatype FROM public.clinical_item WHERE clinicalfeatures_id = ANY($1)`,
      [featureIds],
    );
    return res.rows;
  }
}
