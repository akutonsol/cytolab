import { assembleBoundedAuditExport, AuditExportFetchPage, AuditExportPage, AuditExportAssemblyError } from './audit-export.assembler';
import { ExportableAuditEvent } from './audit-export.serializer';

const T_FROM = new Date('2026-07-18T00:00:00.000Z');
const T_TO = new Date('2026-07-18T23:59:59.000Z');

const ev = (id: string): ExportableAuditEvent => ({ id } as ExportableAuditEvent);

/**
 * A paged source over `ids`, page size `size`. Cursor is the next start index (as a string). Records
 * every (cursor, window) it is asked for, so window-pinning can be asserted.
 */
function pagedSource(ids: string[], size: number, effective?: Partial<AuditExportPage['effective']>) {
  const calls: Array<{ cursor: string | null; window: { timeFrom: Date; timeTo: Date } | null }> = [];
  const fetchPage: AuditExportFetchPage = async ({ cursor, window }) => {
    calls.push({ cursor, window });
    const start = cursor ? Number(cursor) : 0;
    const slice = ids.slice(start, start + size);
    const end = start + slice.length;
    const nextCursor = end < ids.length ? String(end) : null;
    return {
      items: slice.map(ev),
      nextCursor,
      effective: { queryScope: 'LAB', phi: false, timeFrom: T_FROM, timeTo: T_TO, ...effective },
    };
  };
  return { fetchPage, calls };
}

describe('P2-9A assembler — bounded keyset assembly', () => {
  it('produces exact ordered output across pages with no duplicate/skipped rows', async () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const { fetchPage } = pagedSource(ids, 2);
    const out = await assembleBoundedAuditExport(fetchPage, { cap: 100, maxPages: 50 });
    expect(out.items.map((i) => i.id)).toEqual(ids);
    expect(out.exportedCount).toBe(5);
    expect(out.truncated).toBe(false);
  });

  it('stops at the cap mid-page and reports truncated=true', async () => {
    const { fetchPage } = pagedSource(['a', 'b', 'c', 'd', 'e'], 2);
    const out = await assembleBoundedAuditExport(fetchPage, { cap: 3, maxPages: 50 });
    expect(out.items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(out.truncated).toBe(true);
  });

  it('cap exactly at a page boundary is truncated only when more rows follow', async () => {
    const more = await assembleBoundedAuditExport(pagedSource(['a', 'b', 'c', 'd'], 2).fetchPage, { cap: 2, maxPages: 50 });
    expect(more.truncated).toBe(true); // 2 taken, a 3rd/4th exist
    const exact = await assembleBoundedAuditExport(pagedSource(['a', 'b'], 2).fetchPage, { cap: 2, maxPages: 50 });
    expect(exact.truncated).toBe(false); // 2 taken, nothing follows
  });

  it('pins the page-1 window and replays it on every subsequent page', async () => {
    const { fetchPage, calls } = pagedSource(['a', 'b', 'c', 'd', 'e'], 2);
    await assembleBoundedAuditExport(fetchPage, { cap: 100, maxPages: 50 });
    expect(calls[0].window).toBeNull(); // first call resolves the window
    expect(calls.slice(1).every((c) => c.window?.timeFrom === T_FROM && c.window?.timeTo === T_TO)).toBe(true);
  });

  it('carries scope facts from the first page', async () => {
    const { fetchPage } = pagedSource(['a'], 2, { queryScope: 'CROSS_LAB', selectedLabCount: 3, phi: true });
    const out = await assembleBoundedAuditExport(fetchPage, { cap: 10, maxPages: 5 });
    expect(out.queryScope).toBe('CROSS_LAB');
    expect(out.selectedLabCount).toBe(3);
    expect(out.phi).toBe(true);
  });

  it('handles a zero-row export as count 0, not truncated', async () => {
    const { fetchPage } = pagedSource([], 2);
    const out = await assembleBoundedAuditExport(fetchPage, { cap: 10, maxPages: 5 });
    expect(out.exportedCount).toBe(0);
    expect(out.truncated).toBe(false);
  });

  it('fails safe on a non-advancing (repeated) cursor', async () => {
    const fetchPage: AuditExportFetchPage = async () => ({
      items: [ev('x')],
      nextCursor: 'STUCK', // never advances
      effective: { queryScope: 'LAB', phi: false, timeFrom: T_FROM, timeTo: T_TO },
    });
    await expect(assembleBoundedAuditExport(fetchPage, { cap: 100, maxPages: 50 })).rejects.toThrow(AuditExportAssemblyError);
  });

  it('fails safe when the page loop exceeds maxPages', async () => {
    // Always returns one row + an advancing cursor → unbounded without the backstop.
    const fetchPage: AuditExportFetchPage = async ({ cursor }) => {
      const n = cursor ? Number(cursor) : 0;
      return { items: [ev(String(n))], nextCursor: String(n + 1), effective: { queryScope: 'LAB', phi: false, timeFrom: T_FROM, timeTo: T_TO } };
    };
    await expect(assembleBoundedAuditExport(fetchPage, { cap: 100000, maxPages: 3 })).rejects.toThrow(/maximum page iterations/);
  });

  it('rejects a non-positive cap', async () => {
    const { fetchPage } = pagedSource(['a'], 2);
    await expect(assembleBoundedAuditExport(fetchPage, { cap: 0, maxPages: 5 })).rejects.toThrow(AuditExportAssemblyError);
  });
});
