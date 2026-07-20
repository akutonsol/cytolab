/**
 * Specimen + Therapy mappers. Therapy's legacy hormone/radiation/surgical are
 * free-text columns → Osieri booleans by PRESENCE (any non-empty text ⇒ true);
 * descriptive text is preserved in `other`.
 */
import { EtlContext } from '../core/context';
import { cleanString, parseDate } from '../transforms/coerce';
import { mapSpecimenType } from '../transforms/enums';

interface LegacySpecimen {
  id: number;
  antiseruma: string | null;
  antiserumb: string | null;
  bloodgroup: string | null;
  datereceived: Date | string | null;
  label: string | null;
  rhsolution: string | null;
  type: string | null;
  vialcolour: number | null;
  client_id: number | null;
  record_id: number;
  datecreated: Date | string | null;
  dateupdated: Date | string | null;
}

export async function specimenStage(ctx: EtlContext): Promise<void> {
  const { legacy, prisma, idMap, labId } = ctx;
  let count = 0;
  for await (const batch of legacy.stream<LegacySpecimen>('specimen', { incremental: ctx.incremental })) {
    for (const row of batch) {
      const id = await idMap.getOrCreate('specimen', row.id);
      const data = {
        id,
        labId,
        label: cleanString(row.label),
        vialColour: row.vialcolour != null ? String(row.vialcolour) : null,
        antiserumA: cleanString(row.antiseruma),
        antiserumB: cleanString(row.antiserumb),
        rhSolution: cleanString(row.rhsolution),
        type: (mapSpecimenType(row.type) ?? 'OTHER') as
          | 'CERV_SCRAP' | 'ENDOCERV_ASP' | 'VAG_POOL' | 'URINE' | 'CSF' | 'PLEURAL_FLD'
          | 'BREAST_ASP' | 'JOINT_ASP' | 'SYNOVIAL_FLD' | 'OTHER',
        bloodGroup: cleanString(row.bloodgroup),
        recordId: await idMap.require('record', row.record_id),
        clientId: await idMap.optional('client', row.client_id),
        dateReceived: parseDate(row.datereceived),
      };
      if (!ctx.dryRun) await prisma.specimen.upsert({ where: { id }, create: data, update: data });
      count++;
    }
  }
  ctx.recon.push({ table: 'specimen', source: await legacy.count('specimen', ctx.incremental), target: count });
}

interface LegacyTherapy {
  id: number;
  hormone: string | null;
  radiation: string | null;
  surgical: string | null;
  other: string | null;
  record_id: number;
  dateupdated: Date | string | null;
}

export async function therapyStage(ctx: EtlContext): Promise<void> {
  const { legacy, prisma, idMap, labId } = ctx;
  let count = 0;
  for await (const batch of legacy.stream<LegacyTherapy>('therapy', { incremental: ctx.incremental })) {
    for (const row of batch) {
      const id = await idMap.getOrCreate('therapy', row.id);
      const recordId = await idMap.require('record', row.record_id);
      const data = {
        id,
        labId,
        recordId,
        hormone: cleanString(row.hormone) != null,
        radiation: cleanString(row.radiation) != null,
        surgical: cleanString(row.surgical) != null,
        other: cleanString(row.other),
      };
      if (!ctx.dryRun) {
        await prisma.therapy.upsert({ where: { recordId }, create: data, update: data });
      }
      count++;
    }
  }
  ctx.recon.push({ table: 'therapy', source: await legacy.count('therapy', ctx.incremental), target: count });
}
