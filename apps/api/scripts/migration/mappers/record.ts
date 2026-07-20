/**
 * Record + RecordStatusEvent mappers — the clinical case and its append-only
 * status history (180k events). Dates: legacy `datediagnosed`/`datesubmitted`
 * are dead (100% NULL); `datestatus` is the live one (mapping §5).
 */
import { EtlContext } from '../core/context';
import { flush } from '../core/writer';
import { cleanString, parseBool, parseDate } from '../transforms/coerce';
import { mapRecordStatus, mapFormType } from '../transforms/enums';

interface LegacyRecord {
  id: number;
  billed: boolean | null;
  clinicaldiagnosis: string | null;
  doctor: string | null;
  formtype: string | null;
  identifier: string | null;
  labnumber: string | null;
  medicalentry: string | null;
  urgent: boolean | null;
  status: string | null;
  datestatus: Date | string | null;
  patient_id: number;
  client_id: number | null;
  workspace_id: number | null;
  datecreated: Date | string | null;
  dateupdated: Date | string | null;
}

export async function recordStage(ctx: EtlContext): Promise<void> {
  const { legacy, prisma, idMap, labId } = ctx;
  let count = 0;
  // Legacy numbers lab cases PER CLIENT, so merging all clients into one Osieri
  // lab makes some labNumbers collide (Osieri requires them unique per lab). Keep
  // the first occurrence verbatim; disambiguate later collisions deterministically.
  const usedLabNumbers = new Set<string>();
  for await (const batch of legacy.stream<LegacyRecord>('record', { incremental: ctx.incremental })) {
    const ops: unknown[] = [];
    for (const row of batch) {
      const id = await idMap.getOrCreate('record', row.id);
      const identifier = cleanString(row.identifier) ?? `LEG-REC-${row.id}`;
      let labNumber = cleanString(row.labnumber);
      if (labNumber) {
        if (usedLabNumbers.has(labNumber)) labNumber = `${labNumber}~${row.id}`;
        usedLabNumbers.add(labNumber);
      }
      const data = {
        id,
        labId,
        identifier,
        labNumber,
        formType: mapFormType(row.formtype) as 'Gynecology' | 'NonGynecology' | null,
        doctor: cleanString(row.doctor),
        clinicalDiagnosis: cleanString(row.clinicaldiagnosis),
        medicalEntry: cleanString(row.medicalentry),
        urgent: parseBool(row.urgent),
        billed: parseBool(row.billed),
        status: mapRecordStatus(row.status) as
          | 'Pending' | 'Submitted' | 'Processing' | 'Partial' | 'Completed'
          | 'Resulted' | 'Approved' | 'Billed' | 'Paid' | 'OnHold' | 'Disabled' | 'Failed' | 'Viewed',
        dateStatus: parseDate(row.datestatus),
        patientId: await idMap.require('patient', row.patient_id),
        clientId: await idMap.optional('client', row.client_id),
        workspaceId: ctx.workspaceId,
        createdAt: parseDate(row.datecreated) ?? undefined,
      };
      if (!ctx.dryRun) {
        ops.push(
          prisma.record.upsert({ where: { labId_identifier: { labId, identifier } }, create: data, update: data }),
        );
      }
      count++;
    }
    await flush(ctx, ops);
    ctx.log(`  record: ${count} processed`);
  }
  ctx.recon.push({ table: 'record', source: await legacy.count('record', ctx.incremental), target: count });
}

interface LegacyRecordStatus {
  id: number;
  status: string | null;
  date_published: Date | string | null;
  record_id: number;
  datecreated: Date | string | null;
  dateupdated: Date | string | null;
}

export async function recordStatusEventStage(ctx: EtlContext): Promise<void> {
  const { legacy, prisma, idMap, labId } = ctx;
  let count = 0;
  for await (const batch of legacy.stream<LegacyRecordStatus>('record_status', { incremental: ctx.incremental })) {
    const ops: unknown[] = [];
    for (const row of batch) {
      const id = await idMap.getOrCreate('record_status', row.id);
      const recordId = await idMap.require('record', row.record_id);
      const data = {
        id,
        labId,
        recordId,
        status: mapRecordStatus(row.status) as
          | 'Pending' | 'Submitted' | 'Processing' | 'Partial' | 'Completed'
          | 'Resulted' | 'Approved' | 'Billed' | 'Paid' | 'OnHold' | 'Disabled' | 'Failed' | 'Viewed',
        createdAt: parseDate(row.datecreated) ?? parseDate(row.date_published) ?? undefined,
      };
      if (!ctx.dryRun) ops.push(prisma.recordStatusEvent.upsert({ where: { id }, create: data, update: data }));
      count++;
    }
    await flush(ctx, ops);
    if (count % 20000 === 0) ctx.log(`  record_status: ${count} processed`);
  }
  ctx.recon.push({
    table: 'record_status',
    source: await legacy.count('record_status', ctx.incremental),
    target: count,
  });
}
