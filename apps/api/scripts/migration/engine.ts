/**
 * ETL engine — the shared stage runner used by both the CLI (run.ts) and the
 * nightly scheduler (run-nightly.ts). Seeds the CytoLabs lab, then walks the
 * FK-ordered LOAD_ORDER running each stage's mapper, and returns the
 * reconciliation report.
 */
import type { PrismaClient } from '@prisma/client';
import type { LegacySource } from './core/legacy-source';
import type { IdMap } from './core/id-map';
import { EtlContext, StageFn } from './core/context';
import { buildReport, ReconReport } from './core/reconcile';
import { runIntegrityChecks } from './core/integrity';
import { LOAD_ORDER } from './mapping';
import { patientStage } from './mappers/patient';
import { labCodeStage, clientTypeStage, codeSheetStage, codeFindingStage } from './mappers/reference';
import { clientStage } from './mappers/client';
import { requisitionStage, requisitionLineStage } from './mappers/requisition';
import { recordStage, recordStatusEventStage } from './mappers/record';
import { clinicalFeaturesStage } from './mappers/clinical-features';
import { specimenStage, therapyStage } from './mappers/specimen';
import { resultSheetStage, resultEntryStage, resultLineStage, reportStage } from './mappers/results';
import { cabinetStage, userStage } from './mappers/staff';
import { seedSequencesStage } from './mappers/sequences';

// Every stage in LOAD_ORDER except lab (seeded first) and notification (dropped:
// legacy notifications are workspace-scoped free text, incompatible with Osieri's
// per-user typed model — re-derive going forward). A stage absent here is
// reported PENDING rather than silently skipped.
const STAGES: Partial<Record<(typeof LOAD_ORDER)[number], StageFn>> = {
  labCode: labCodeStage,
  clientType: clientTypeStage,
  client: clientStage,
  codeSheet: codeSheetStage,
  codeFinding: codeFindingStage,
  patient: patientStage,
  requisition: requisitionStage,
  record: recordStage,
  requisitionLine: requisitionLineStage,
  recordStatusEvent: recordStatusEventStage,
  clinicalFeatures: clinicalFeaturesStage,
  specimen: specimenStage,
  therapy: therapyStage,
  resultSheet: resultSheetStage,
  resultEntry: resultEntryStage,
  resultLine: resultLineStage,
  report: reportStage,
  cabinet: cabinetStage,
  user: userStage,
};

export interface EngineOptions {
  legacy: LegacySource;
  prisma: PrismaClient;
  idMap: IdMap;
  dryRun: boolean;
  incremental: boolean;
  log?: (msg: string) => void;
}

async function seedLab(
  ctx: Omit<EtlContext, 'labId' | 'accountId' | 'workspaceId'>,
): Promise<{ labId: string; accountId: string; workspaceId: string }> {
  if (ctx.dryRun) {
    ctx.log('lab: (dry-run) using placeholder ids');
    return { labId: 'dry-run-lab', accountId: 'dry-run-account', workspaceId: 'dry-run-workspace' };
  }
  const lab = await ctx.prisma.lab.upsert({
    where: { slug: 'cytolabs' },
    create: { name: 'CytoLabs', slug: 'cytolabs', currency: 'JMD' },
    update: {},
  });
  const account =
    (await ctx.prisma.account.findFirst({ where: { labId: lab.id } })) ??
    (await ctx.prisma.account.create({ data: { labId: lab.id, name: 'CytoLabs' } }));
  const workspace =
    (await ctx.prisma.workspace.findFirst({ where: { labId: lab.id } })) ??
    (await ctx.prisma.workspace.create({ data: { labId: lab.id, name: 'CytoLabs', accountId: account.id } }));
  ctx.log(`lab: CytoLabs ${lab.id}`);
  return { labId: lab.id, accountId: account.id, workspaceId: workspace.id };
}

/** Run the full pipeline. Returns the reconciliation report. */
export async function runEtl(opts: EngineOptions): Promise<ReconReport> {
  const log = opts.log ?? ((m: string) => console.log(m));
  const base = {
    legacy: opts.legacy,
    prisma: opts.prisma,
    idMap: opts.idMap,
    dryRun: opts.dryRun,
    incremental: opts.incremental,
    // Full loads (non-incremental) go into a freshly-reset DB -> bulk createMany.
    // Incremental deltas need per-row upsert to update existing rows.
    bulk: !opts.incremental,
    log,
    recon: [],
  };
  const seeded = await seedLab(base);
  const ctx: EtlContext = { ...base, ...seeded };

  for (const stage of LOAD_ORDER) {
    if (stage === 'lab') continue; // seeded above
    const fn = STAGES[stage];
    if (!fn) {
      log(`stage ${stage}: PENDING`);
      continue;
    }
    log(`stage ${stage}: running${opts.incremental ? ' (incremental)' : ''}${opts.dryRun ? ' (dry-run)' : ''}`);
    await fn(ctx);
  }

  // Post-load: seed app identifier counters above the imported high-water mark so
  // app-generated ids never collide with migrated ones.
  log(`stage seedSequences: running${opts.dryRun ? ' (dry-run)' : ''}`);
  await seedSequencesStage(ctx);

  // Verify every migrated FK resolves. Dry-run wrote nothing, so there is nothing
  // to check.
  let integrity;
  if (!opts.dryRun) {
    log('stage integrity: running');
    integrity = await runIntegrityChecks(opts.prisma);
  }

  return buildReport(ctx.recon, integrity);
}
