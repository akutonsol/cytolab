/**
 * Requisition + RequisitionLine mappers. Legacy `requsition` has no reference
 * number or client column — referenceNo is generated verbatim-stable from the
 * legacy id, and the client is resolved from the paired workspace. RequisitionLine
 * runs AFTER record (it optionally links a record).
 */
import { EtlContext } from '../core/context';
import { flush } from '../core/writer';
import { cleanString, parseBool, parseDate } from '../transforms/coerce';
import { toCents } from '../transforms/money';
import { mapRequisitionStatus, mapFormType } from '../transforms/enums';

interface LegacyRequisition {
  id: number;
  status: string | null;
  amount: number | null;
  datereceived: Date | string | null;
  workspace_id: number | null;
  datecreated: Date | string | null;
  dateupdated: Date | string | null;
}

export async function requisitionStage(ctx: EtlContext): Promise<void> {
  const { legacy, prisma, idMap, labId } = ctx;
  let count = 0;
  for await (const batch of legacy.stream<LegacyRequisition>('requsition', { incremental: ctx.incremental })) {
    const ops: unknown[] = [];
    for (const row of batch) {
      const id = await idMap.getOrCreate('requsition', row.id);
      const referenceNo = `LEG-REQ-${row.id}`;
      const data = {
        id,
        labId,
        referenceNo,
        status: mapRequisitionStatus(row.status) as 'Pending' | 'Active' | 'Partial' | 'Completed' | 'Disabled',
        amount: toCents(row.amount),
        clientId: await idMap.optional('workspace', row.workspace_id),
        workspaceId: ctx.workspaceId,
        dateReceived: parseDate(row.datereceived),
        createdAt: parseDate(row.datecreated) ?? undefined,
      };
      if (!ctx.dryRun) {
        ops.push(
          prisma.requisition.upsert({ where: { labId_referenceNo: { labId, referenceNo } }, create: data, update: data }),
        );
      }
      count++;
    }
    await flush(ctx, ops);
  }
  ctx.recon.push({ table: 'requsition', source: await legacy.count('requsition', ctx.incremental), target: count });
}

interface LegacyRequisitionLine {
  id: number;
  amount: number | null;
  description: string | null;
  form: string | null;
  iscompleted: boolean | null;
  isurgent: boolean | null;
  record_id: number | null;
  requisition_id: number;
  dateupdated: Date | string | null;
}

export async function requisitionLineStage(ctx: EtlContext): Promise<void> {
  const { legacy, prisma, idMap, labId } = ctx;
  let count = 0;
  for await (const batch of legacy.stream<LegacyRequisitionLine>('requisition_line', { incremental: ctx.incremental })) {
    const ops: unknown[] = [];
    for (const row of batch) {
      const id = await idMap.getOrCreate('requisition_line', row.id);
      const referenceNo = `LEG-RL-${row.id}`;
      const data = {
        id,
        labId,
        requisitionId: await idMap.require('requsition', row.requisition_id),
        referenceNo,
        formType: (mapFormType(row.form) ?? 'Gynecology') as 'Gynecology' | 'NonGynecology',
        isUrgent: parseBool(row.isurgent),
        isCompleted: parseBool(row.iscompleted),
        notes: cleanString(row.description),
        amount: toCents(row.amount),
        recordId: await idMap.optional('record', row.record_id),
      };
      if (!ctx.dryRun) {
        ops.push(
          prisma.requisitionLine.upsert({ where: { labId_referenceNo: { labId, referenceNo } }, create: data, update: data }),
        );
      }
      count++;
    }
    await flush(ctx, ops);
  }
  ctx.recon.push({
    table: 'requisition_line',
    source: await legacy.count('requisition_line', ctx.incremental),
    target: count,
  });
}
