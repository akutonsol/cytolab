/**
 * Reference-table mappers: labCode, clientType, codeSheet, codeFinding.
 * Small dictionaries with no inbound FKs beyond client (labCode/clientType) —
 * loaded early so client can resolve them. Same template as patient.ts.
 */
import { EtlContext } from '../core/context';
import { cleanString } from '../transforms/coerce';
import { mapClientType } from '../transforms/enums';

interface LegacyLabCode { id: number; code: string | null; region: string | null; }

export async function labCodeStage(ctx: EtlContext): Promise<void> {
  const { legacy, prisma, idMap, labId } = ctx;
  let count = 0;
  for await (const batch of legacy.stream<LegacyLabCode>('labcode')) {
    for (const row of batch) {
      const id = await idMap.getOrCreate('labcode', row.id);
      const code = cleanString(row.code) ?? `LEG-${row.id}`;
      const data = { id, labId, code, region: cleanString(row.region) };
      if (!ctx.dryRun) {
        await prisma.labCode.upsert({ where: { labId_code: { labId, code } }, create: data, update: data });
      }
      count++;
    }
  }
  ctx.recon.push({ table: 'labcode', source: await legacy.count('labcode'), target: count });
}

interface LegacyClientType { id: number; name: string | null; type: string | null; }

export async function clientTypeStage(ctx: EtlContext): Promise<void> {
  const { legacy, prisma, idMap, labId } = ctx;
  let count = 0;
  for await (const batch of legacy.stream<LegacyClientType>('client_type')) {
    for (const row of batch) {
      const id = await idMap.getOrCreate('client_type', row.id);
      const data = {
        id,
        labId,
        name: cleanString(row.name) ?? 'Unnamed',
        type: (mapClientType(row.type) ?? 'Doctor') as 'Doctor' | 'Laboratory',
      };
      if (!ctx.dryRun) {
        // No natural unique key on ClientType; upsert by the mapped uuid.
        await prisma.clientType.upsert({ where: { id }, create: data, update: data });
      }
      count++;
    }
  }
  ctx.recon.push({ table: 'client_type', source: await legacy.count('client_type'), target: count });
}

interface LegacyCode { id: number; abbreviation: string | null; description: string | null; }

export async function codeSheetStage(ctx: EtlContext): Promise<void> {
  const { legacy, prisma, idMap, labId } = ctx;
  let count = 0;
  for await (const batch of legacy.stream<LegacyCode>('code_sheet')) {
    for (const row of batch) {
      const id = await idMap.getOrCreate('code_sheet', row.id);
      const data = {
        id,
        labId,
        abbreviation: cleanString(row.abbreviation) ?? `LEG-${row.id}`,
        description: cleanString(row.description),
      };
      if (!ctx.dryRun) await prisma.codeSheet.upsert({ where: { id }, create: data, update: data });
      count++;
    }
  }
  ctx.recon.push({ table: 'code_sheet', source: await legacy.count('code_sheet'), target: count });
}

export async function codeFindingStage(ctx: EtlContext): Promise<void> {
  const { legacy, prisma, idMap, labId } = ctx;
  let count = 0;
  for await (const batch of legacy.stream<LegacyCode>('code_finding')) {
    for (const row of batch) {
      const id = await idMap.getOrCreate('code_finding', row.id);
      const data = {
        id,
        labId,
        abbreviation: cleanString(row.abbreviation) ?? `LEG-${row.id}`,
        description: cleanString(row.description),
      };
      if (!ctx.dryRun) await prisma.codeFinding.upsert({ where: { id }, create: data, update: data });
      count++;
    }
  }
  ctx.recon.push({ table: 'code_finding', source: await legacy.count('code_finding'), target: count });
}
