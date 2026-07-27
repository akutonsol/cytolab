/**
 * Post-load referential-integrity verification.
 *
 * Row-count reconciliation catches an undercount, but not a row that landed with
 * a foreign key pointing at nothing — exactly the failure the patient identity
 * de-dup could introduce if a duplicate were skipped WITHOUT re-pointing its
 * records at the survivor. These checks LEFT JOIN each migrated child onto its
 * parent and count the orphans; any non-zero is a hard failure.
 */
import type { PrismaClient } from '@prisma/client';

export interface IntegrityRow {
  relation: string;
  orphans: number;
}

/** (child model, non-null FK column, parent model). Table = quoted model name. */
const CHECKS: { child: string; fk: string; parent: string }[] = [
  { child: 'Record', fk: 'patientId', parent: 'Patient' },
  { child: 'Record', fk: 'clientId', parent: 'Client' },
  { child: 'RequisitionLine', fk: 'requisitionId', parent: 'Requisition' },
  { child: 'RequisitionLine', fk: 'recordId', parent: 'Record' },
  { child: 'Specimen', fk: 'recordId', parent: 'Record' },
  { child: 'Specimen', fk: 'clientId', parent: 'Client' },
  { child: 'RecordStatusEvent', fk: 'recordId', parent: 'Record' },
  { child: 'Therapy', fk: 'recordId', parent: 'Record' },
  { child: 'ResultSheet', fk: 'recordId', parent: 'Record' },
  { child: 'ResultEntry', fk: 'resultSheetId', parent: 'ResultSheet' },
  { child: 'ResultLine', fk: 'resultEntryId', parent: 'ResultEntry' },
  { child: 'Report', fk: 'resultSheetId', parent: 'ResultSheet' },
];

/** Count orphaned children for every configured relationship. */
export async function runIntegrityChecks(prisma: PrismaClient): Promise<IntegrityRow[]> {
  const out: IntegrityRow[] = [];
  for (const c of CHECKS) {
    // Identifiers are fixed literals from CHECKS above, never user input.
    const sql =
      `SELECT count(*)::int AS n FROM "${c.child}" ch ` +
      `LEFT JOIN "${c.parent}" p ON ch."${c.fk}" = p."id" ` +
      `WHERE ch."${c.fk}" IS NOT NULL AND p."id" IS NULL`;
    const rows = await prisma.$queryRawUnsafe<{ n: number }[]>(sql);
    out.push({ relation: `${c.child}.${c.fk} -> ${c.parent}`, orphans: rows[0]?.n ?? 0 });
  }
  return out;
}
