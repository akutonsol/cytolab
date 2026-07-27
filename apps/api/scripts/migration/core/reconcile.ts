/**
 * Reconciliation: after a load (or in --dry-run), compare source row counts to
 * what was transformed/loaded, per table, and fail loudly on mismatch. A silent
 * undercount is the most dangerous migration failure — this makes it impossible.
 *
 * Beyond counts, a load can also pass a full referential-integrity sweep
 * (integrity.ts): every migrated foreign key must resolve to a real parent row.
 * The report is OK only when counts reconcile AND zero orphans exist.
 */
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import type { IntegrityRow } from './integrity';

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
  integrity?: IntegrityRow[];
  ok: boolean;
}

export function buildReport(rows: ReconRow[], integrity?: IntegrityRow[]): ReconReport {
  const countsOk = rows.every((r) => r.source === r.target + (r.skipped ?? 0));
  const integrityOk = (integrity ?? []).every((i) => i.orphans === 0);
  return { rows, integrity, ok: countsOk && integrityOk };
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

  const out = [header, sep, ...lines, sep];

  if (report.integrity && report.integrity.length) {
    const ihead = 'referential integrity                              orphans   status';
    out.push('', ihead, '-'.repeat(ihead.length));
    for (const i of report.integrity) {
      const status = i.orphans === 0 ? 'OK' : 'ORPHANS';
      out.push([i.relation.padEnd(48), String(i.orphans).padStart(9), '   ' + status].join(' '));
    }
    out.push('-'.repeat(ihead.length));
  }

  out.push(`RESULT: ${report.ok ? 'ALL OK' : 'MISMATCHES PRESENT'}`);
  return out.join('\n');
}

/**
 * Persist the formatted report to a durable artifact so a cutover has an audit
 * trail of exactly what reconciled (the runbook's "Verify" step). Directory is
 * `MIGRATION_REPORT_DIR` or `./migration-reports`. Returns the file path.
 * `stamp` is injected so callers control the timestamp (and tests stay
 * deterministic).
 */
export async function writeReportArtifact(report: ReconReport, stamp?: string): Promise<string> {
  const dir = process.env.MIGRATION_REPORT_DIR || join(process.cwd(), 'migration-reports');
  await mkdir(dir, { recursive: true });
  const safe = (stamp ?? new Date().toISOString()).replace(/[:.]/g, '-');
  const path = join(dir, `recon-${safe}.txt`);
  await writeFile(path, formatReport(report) + '\n', 'utf8');
  return path;
}
