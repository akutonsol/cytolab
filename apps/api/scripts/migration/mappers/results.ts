/**
 * Results chain: resultSheet → resultEntry → resultLine → report. The clinical
 * heart of the migration. Report.writtenBy is legacy free text (not a user id),
 * so writtenById stays null; the typed name survives via the report signature.
 */
import { EtlContext } from '../core/context';
import { flush } from '../core/writer';
import { cleanString, parseBool, parseDate } from '../transforms/coerce';

interface LegacyResultSheet {
  id: number;
  authorized: boolean | null;
  viewed: boolean | null;
  record_id: number;
  datecreated: Date | string | null;
  dateupdated: Date | string | null;
}

export async function resultSheetStage(ctx: EtlContext): Promise<void> {
  const { legacy, prisma, idMap, labId } = ctx;
  let count = 0;
  for await (const batch of legacy.stream<LegacyResultSheet>('result_sheet', { incremental: ctx.incremental })) {
    const ops: unknown[] = [];
    for (const row of batch) {
      const id = await idMap.getOrCreate('result_sheet', row.id);
      const data = {
        id,
        labId,
        recordId: await idMap.require('record', row.record_id),
        authorized: parseBool(row.authorized),
        viewed: parseBool(row.viewed),
        authorizedAt: parseBool(row.authorized) ? parseDate(row.datecreated) : null,
        createdAt: parseDate(row.datecreated) ?? undefined,
      };
      if (!ctx.dryRun) ops.push(prisma.resultSheet.upsert({ where: { id }, create: data, update: data }));
      count++;
    }
    await flush(ctx, ops);
  }
  ctx.recon.push({ table: 'result_sheet', source: await legacy.count('result_sheet', ctx.incremental), target: count });
}

interface LegacyResultEntry {
  id: number;
  resultsheet_id: number;
  specimen_id: number | null;
  dateupdated: Date | string | null;
}

export async function resultEntryStage(ctx: EtlContext): Promise<void> {
  const { legacy, prisma, idMap, labId } = ctx;
  let count = 0;
  for await (const batch of legacy.stream<LegacyResultEntry>('result_entry', { incremental: ctx.incremental })) {
    const ops: unknown[] = [];
    for (const row of batch) {
      const id = await idMap.getOrCreate('result_entry', row.id);
      const data = {
        id,
        labId,
        resultSheetId: await idMap.require('result_sheet', row.resultsheet_id),
        specimenId: await idMap.optional('specimen', row.specimen_id),
      };
      if (!ctx.dryRun) ops.push(prisma.resultEntry.upsert({ where: { id }, create: data, update: data }));
      count++;
    }
    await flush(ctx, ops);
  }
  ctx.recon.push({ table: 'result_entry', source: await legacy.count('result_entry', ctx.incremental), target: count });
}

interface LegacyResultLine {
  id: number;
  abbreviation: string | null;
  result: string | null;
  findings: string | null;
  abnormalfinding: boolean | null;
  resultentry_id: number;
  dateupdated: Date | string | null;
}

export async function resultLineStage(ctx: EtlContext): Promise<void> {
  const { legacy, prisma, idMap, labId } = ctx;
  let count = 0;
  for await (const batch of legacy.stream<LegacyResultLine>('result_line', { incremental: ctx.incremental })) {
    const ops: unknown[] = [];
    for (const row of batch) {
      const id = await idMap.getOrCreate('result_line', row.id);
      const data = {
        id,
        labId,
        resultEntryId: await idMap.require('result_entry', row.resultentry_id),
        abbreviation: cleanString(row.abbreviation),
        result: cleanString(row.result),
        findings: cleanString(row.findings),
        abnormalFinding: parseBool(row.abnormalfinding),
      };
      if (!ctx.dryRun) ops.push(prisma.resultLine.upsert({ where: { id }, create: data, update: data }));
      count++;
    }
    await flush(ctx, ops);
    if (count % 20000 === 0) ctx.log(`  result_line: ${count} processed`);
  }
  ctx.recon.push({ table: 'result_line', source: await legacy.count('result_line', ctx.incremental), target: count });
}

interface LegacyReport {
  id: number;
  authorizerreference: number | null;
  content: string | null;
  digitalsignature: string | null;
  medicalentry: string | null;
  writtenby: string | null;
  resultsheet_id: number;
  datecreated: Date | string | null;
  dateupdated: Date | string | null;
}

export async function reportStage(ctx: EtlContext): Promise<void> {
  const { legacy, prisma, idMap, labId } = ctx;
  let count = 0;
  for await (const batch of legacy.stream<LegacyReport>('report', { incremental: ctx.incremental })) {
    const ops: unknown[] = [];
    for (const row of batch) {
      const id = await idMap.getOrCreate('report', row.id);
      const data = {
        id,
        labId,
        resultSheetId: await idMap.require('result_sheet', row.resultsheet_id),
        authorizerReference: row.authorizerreference != null ? String(row.authorizerreference) : null,
        content: cleanString(row.content),
        digitalSignature: cleanString(row.digitalsignature),
        medicalEntry: cleanString(row.medicalentry),
        // Legacy writtenby is free text (a typed name), not a user id — keep it in
        // the report signature, leave the relation null.
        signature: cleanString(row.writtenby),
        releasedAt: parseDate(row.datecreated) ?? undefined,
      };
      if (!ctx.dryRun) ops.push(prisma.report.upsert({ where: { id }, create: data, update: data }));
      count++;
    }
    await flush(ctx, ops);
  }
  ctx.recon.push({ table: 'report', source: await legacy.count('report', ctx.incremental), target: count });
}
