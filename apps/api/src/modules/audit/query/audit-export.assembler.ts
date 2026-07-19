/**
 * Program 2 · P2-9A — bounded keyset assembly of a complete audit export. It composes over the frozen
 * AuditQueryService page reader (injected as an opaque `fetchPage`) — it builds NO query, imports no
 * Prisma, and knows nothing of predicates beyond an opaque cursor + a pinned time window.
 *
 * Guarantees:
 *   - certified ordering + no duplicate/skipped rows — inherited from the frozen keyset reader;
 *   - a single snapshot window — the resolved (timeFrom,timeTo) from page 1 is PINNED and replayed on
 *     every subsequent page, so a per-call `now()` default can never drift the window mid-iteration;
 *   - stops when exhausted OR at the applied cap; truthful `truncated`;
 *   - defends against a non-advancing/repeated cursor and against an unbounded page loop.
 *
 * It fully resolves the artifact in memory BEFORE the caller captures/egresses — it opens no response.
 */
import { ExportableAuditEvent } from './audit-export.serializer';

export interface AuditExportPage {
  items: ExportableAuditEvent[];
  nextCursor: string | null;
  effective: {
    queryScope: 'LAB' | 'SYSTEM' | 'CROSS_LAB';
    selectedLabCount?: number;
    phi: boolean;
    timeFrom: Date;
    timeTo: Date;
  };
}

/** Opaque page fetch; `window` is null on the first call and the pinned snapshot window thereafter. */
export type AuditExportFetchPage = (args: {
  cursor: string | null;
  window: { timeFrom: Date; timeTo: Date } | null;
}) => Promise<AuditExportPage>;

export interface AuditExportAssembly {
  items: ExportableAuditEvent[];
  exportedCount: number;
  truncated: boolean;
  queryScope: 'LAB' | 'SYSTEM' | 'CROSS_LAB';
  selectedLabCount?: number;
  phi: boolean;
}

export class AuditExportAssemblyError extends Error {
  constructor(message: string) {
    super(`Audit export assembly failed: ${message}`);
    this.name = 'AuditExportAssemblyError';
  }
}

export async function assembleBoundedAuditExport(
  fetchPage: AuditExportFetchPage,
  opts: { cap: number; maxPages: number },
): Promise<AuditExportAssembly> {
  const { cap, maxPages } = opts;
  if (!Number.isInteger(cap) || cap < 1) throw new AuditExportAssemblyError('cap must be a positive integer');

  const items: ExportableAuditEvent[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  let window: { timeFrom: Date; timeTo: Date } | null = null;
  let first: AuditExportPage | null = null;
  let truncated = false;
  let pages = 0;

  for (;;) {
    if (pages++ >= maxPages) {
      // Unbounded-loop backstop — a well-behaved keyset reader converges in ~cap/pageSize pages.
      throw new AuditExportAssemblyError('exceeded the maximum page iterations');
    }

    const page = await fetchPage({ cursor, window });
    if (!first) {
      first = page;
      window = { timeFrom: page.effective.timeFrom, timeTo: page.effective.timeTo }; // pin the snapshot window
    }

    let cappedMidPage = false;
    for (const it of page.items) {
      if (items.length >= cap) {
        cappedMidPage = true;
        break;
      }
      items.push(it);
    }
    if (cappedMidPage) {
      truncated = true; // rows remained in this page beyond the cap
      break;
    }
    if (items.length >= cap) {
      truncated = page.nextCursor !== null; // filled exactly at the page boundary; more iff a page follows
      break;
    }
    if (!page.nextCursor) break; // exhausted — the whole predicate fit under the cap

    if (seenCursors.has(page.nextCursor)) {
      throw new AuditExportAssemblyError('cursor did not advance (repeated cursor)');
    }
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }

  return {
    items,
    exportedCount: items.length,
    truncated,
    queryScope: first!.effective.queryScope,
    selectedLabCount: first!.effective.selectedLabCount,
    phi: first!.effective.phi,
  };
}
