/**
 * Reconciliation: after a load (or in --dry-run), compare source row counts to
 * what was transformed/loaded, per table, and fail loudly on mismatch. A silent
 * undercount is the most dangerous migration failure — this makes it impossible.
 */

export interface ReconRow {
  table: string;
  source: number;
  target: number;
  /** Rows intentionally skipped (e.g. empty legacy dates, dropped config). */
  skipped?: number;
  note?: string;
}

export interface ReconReport {
  rows: ReconRow[];
  ok: boolean;
}

export function buildReport(rows: ReconRow[]): ReconReport {
  const ok = rows.every((r) => r.source === r.target + (r.skipped ?? 0));
  return { rows, ok };
}

export function formatReport(report: ReconReport): string {
  const header = 'table                         source    target   skipped   status';
  const sep = '-'.repeat(header.length);
  const lines = report.rows.map((r) => {
    const match = r.source === r.target + (r.skipped ?? 0);
    const status = match ? 'OK' : 'MISMATCH';
    return [
      r.table.padEnd(28),
      String(r.source).padStart(8),
      String(r.target).padStart(9),
      String(r.skipped ?? 0).padStart(9),
      '   ' + status + (r.note ? `  (${r.note})` : ''),
    ].join(' ');
  });
  return [header, sep, ...lines, sep, `RESULT: ${report.ok ? 'ALL OK' : 'MISMATCHES PRESENT'}`].join('\n');
}
