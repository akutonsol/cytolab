/**
 * Program 6 · Phase 6A — persisted-truth acceptance for the AI model registry, versioning & lifecycle.
 *
 * Boots the REAL AppModule DI graph and drives the REAL AiRegistryService lab-scoped, asserting persisted
 * DATABASE truth (no mocks, no faked state): permission catalogue + no-default-grant, tenant scoping + cross-lab
 * fail-closed, per-lab key uniqueness, per-model semver uniqueness, permanent UUID identity, the lifecycle state
 * machine (legal / illegal / concurrent / one-event-per-transition / RETIRED terminal), the inert & empty
 * InferenceRecord shell (no status/runtime/result/confidence/prediction semantics), RESTRICT on every P6
 * provenance FK (queried from the migrated DB), and non-regression of the existing AiService/AiDraft path and the
 * unconnected Legacy Demonstration Component (AIScreeningResult). Exits non-zero on any failed assertion.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient, Prisma } from '@prisma/client';

function assertIsolatedAcceptanceDb(): void {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required (isolated acceptance/test database).');
  const name = new URL(url).pathname.replace(/^\//, '');
  if (name === 'cytolab' || !/(test|accept)/i.test(name)) throw new Error(`Refusing "${name}": not an isolated acceptance DB.`);
}

async function main() {
  assertIsolatedAcceptanceDb();
  const fixturesPath = process.env.AI_INFRA_FIXTURES_OUT
    ? path.resolve(process.env.AI_INFRA_FIXTURES_OUT)
    : path.resolve(__dirname, '../../web/acceptance/.ai-infra-fixtures.json');
  const fx = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
  const prisma = new PrismaClient(); // raw, unscoped — catalogue reads + DB-constraint truth + cross-lab checks
  const fails: string[] = [];
  const ck = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };
  const threw = async (fn: () => Promise<unknown>) => { try { await fn(); return false; } catch { return true; } };

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { NestFactory } = require('@nestjs/core');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { AppModule } = require('../src/app.module');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { AiRegistryService } = require('../src/modules/ai-registry/ai-registry.service');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { AiRegistryController } = require('../src/modules/ai-registry/ai-registry.controller');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { LabContext } = require('../src/common/tenancy/lab-context');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PERMISSIONS_KEY } = require('../src/common/decorators/require-permissions.decorator');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const svc = app.get(AiRegistryService);
    const lab = app.get(LabContext);
    const asA = <T>(fn: () => Promise<T>) => lab.runLabScoped(fx.labAId, fn) as Promise<T>;
    const asB = <T>(fn: () => Promise<T>) => lab.runLabScoped(fx.labBId, fn) as Promise<T>;

    // (A) permission catalogue — aimodel:view/manage/promote seeded.
    const perms = await prisma.permission.findMany({ where: { code: { in: ['aimodel:view', 'aimodel:manage', 'aimodel:promote'] } }, select: { code: true } });
    ck(perms.length === 3, `catalogue has aimodel:view/manage/promote (got [${perms.map((p) => p.code).join(',')}])`);

    // (B) no default-role grant — no NON-super role holds any aimodel:* permission; at least one super role exists.
    const roles = await prisma.role.findMany({ include: { permissions: { include: { permission: true } } } });
    const leaks = roles.filter((r) => !r.isSuperRole).filter((r) => r.permissions.some((rp) => rp.permission.code.startsWith('aimodel:')));
    ck(leaks.length === 0, `no default (non-super) role holds aimodel:* (offenders: [${leaks.map((r) => r.name).join(',')}])`);
    ck(roles.some((r) => r.isSuperRole), 'at least one super role exists (reaches aimodel via the guard bypass, not an explicit grant)');

    // (C) tenant-scoped + cross-lab fail-closed.
    const m = await asA(() => svc.createModel({ key: 'gate-detector', displayName: 'Gate A', task: 'demo detector' }, 'op-a'));
    ck(await threw(() => asB(() => svc.getModel(m.id))), 'cross-lab getModel fails closed (Lab B cannot read a Lab-A model)');
    const rawM = await prisma.aiModel.findUnique({ where: { id: m.id }, select: { labId: true, modelUuid: true } });
    ck(rawM?.labId === fx.labAId, 'model persisted under Lab A (labId auto-stamped)');

    // (D) model key unique per lab.
    ck(await threw(() => asA(() => svc.createModel({ key: 'gate-detector', displayName: 'dup', task: 'x' }))), 'duplicate model key rejected within a lab');

    // (E) semver unique per logical model.
    const v = await asA(() => svc.createVersion(m.id, { semverMajor: 1, semverMinor: 0, semverPatch: 0 }, 'op-a'));
    ck(await threw(() => asA(() => svc.createVersion(m.id, { semverMajor: 1, semverMinor: 0, semverPatch: 0 }))), 'duplicate semver rejected for the same model');
    await asA(() => svc.createVersion(m.id, { semverMajor: 1, semverMinor: 0, semverPatch: 1 }));
    const m2 = await asA(() => svc.createModel({ key: 'gate-detector-2', displayName: 'Gate A-2', task: 'x' }));
    let sameSemverOk = true;
    try { await asA(() => svc.createVersion(m2.id, { semverMajor: 1, semverMinor: 0, semverPatch: 0 })); } catch { sameSemverOk = false; }
    ck(sameSemverOk, 'the same semver is allowed for a DIFFERENT logical model');

    // (F) permanent UUID identity — independent of key/displayName/semver.
    const upd = await asA(() => svc.updateModel(m.id, { displayName: 'Gate A (renamed)' }));
    ck(upd.modelUuid === rawM?.modelUuid && upd.key === 'gate-detector', 'modelUuid is permanent across a rename (key unchanged)');
    ck((await asA(() => svc.getVersion(v.id))).versionUuid === v.versionUuid, 'versionUuid is permanent');

    // (G) legal lifecycle path + entry stamps + one event per transition + VALIDATION→DRAFT send-back.
    for (const to of ['VALIDATION', 'DRAFT', 'VALIDATION', 'APPROVED', 'DEPRECATED', 'RETIRED']) {
      await asA(() => svc.transitionVersion(v.id, to, 'op-a', `-> ${to}`));
    }
    const vFinal = await asA(() => svc.getVersion(v.id));
    ck(vFinal.lifecycleState === 'RETIRED', `reaches RETIRED via the legal path (got ${vFinal.lifecycleState})`);
    ck(!!(vFinal.validatedAt && vFinal.approvedAt && vFinal.deprecatedAt && vFinal.retiredAt), 'entry stamps set for each entered state');
    const evs = await prisma.aiModelLifecycleEvent.findMany({ where: { modelVersionId: v.id } });
    ck(evs.length === 6, `exactly one append-only event per successful transition (got ${evs.length})`);
    ck(evs.filter((e) => e.toState === 'DRAFT').length === 1, 'the VALIDATION→DRAFT send-back is recorded');

    // (H) illegal transition — rejected with NO state or event mutation.
    const vI = await asA(() => svc.createVersion(m2.id, { semverMajor: 2, semverMinor: 0, semverPatch: 0 }));
    ck(await threw(() => asA(() => svc.transitionVersion(vI.id, 'APPROVED'))), 'illegal DRAFT→APPROVED rejected');
    ck((await asA(() => svc.getVersion(vI.id))).lifecycleState === 'DRAFT', 'illegal transition leaves state unchanged');
    ck((await prisma.aiModelLifecycleEvent.count({ where: { modelVersionId: vI.id } })) === 0, 'illegal transition writes no event');

    // (I) concurrent transition — exactly one winner, exactly one event, no partial mutation.
    const vC = await asA(() => svc.createVersion(m2.id, { semverMajor: 3, semverMinor: 0, semverPatch: 0 }));
    const race = await Promise.allSettled([asA(() => svc.transitionVersion(vC.id, 'VALIDATION')), asA(() => svc.transitionVersion(vC.id, 'VALIDATION'))]);
    const winners = race.filter((r) => r.status === 'fulfilled').length;
    ck(winners === 1, `concurrent transition: exactly one winner (got ${winners})`);
    ck((await asA(() => svc.getVersion(vC.id))).lifecycleState === 'VALIDATION', 'concurrent transition: single consistent state');
    ck((await prisma.aiModelLifecycleEvent.count({ where: { modelVersionId: vC.id } })) === 1, 'concurrent transition: exactly one event (no partial mutation)');

    // (K) RETIRED terminal.
    let terminalOk = true;
    for (const to of ['DRAFT', 'VALIDATION', 'APPROVED', 'DEPRECATED']) if (!(await threw(() => asA(() => svc.transitionVersion(v.id, to))))) terminalOk = false;
    ck(terminalOk, 'RETIRED is terminal (every transition out of RETIRED is rejected)');

    // (L) promote authorization distinct from manage (route contract).
    ck(JSON.stringify(Reflect.getMetadata(PERMISSIONS_KEY, (AiRegistryController.prototype as any).transition)) === JSON.stringify(['aimodel:promote']), 'transition route requires aimodel:promote');
    ck(JSON.stringify(Reflect.getMetadata(PERMISSIONS_KEY, (AiRegistryController.prototype as any).createModel)) === JSON.stringify(['aimodel:manage']), 'create route requires aimodel:manage (distinct from promote)');

    // (M) InferenceRecord inert & empty; no execution/status/runtime/result/confidence/prediction semantics.
    ck((await prisma.inferenceRecord.count()) === 0, 'InferenceRecord table is empty (registering/promoting creates none)');
    ck(!Prisma.dmmf.datamodel.enums.find((e) => e.name === 'InferenceRecordStatus'), 'no InferenceRecordStatus enum exists');
    const infFields = Prisma.dmmf.datamodel.models.find((x) => x.name === 'InferenceRecord')!.fields.map((f) => f.name);
    const execish = /status|runtime|timing|latency|duration|started|finished|completed|result|output|prediction|confidence|score|progress/i;
    ck(infFields.filter((f) => execish.test(f)).length === 0, `InferenceRecord has no execution/status/runtime/result/confidence/prediction field (fields: ${infFields.join(',')})`);
    ck(!(svc.createInference || svc.runInference || svc.infer || svc.predict || svc.execute), 'the registry service exposes no inference-execution surface');

    // (N) every P6 provenance FK uses ON DELETE RESTRICT (migrated-DB truth; confdeltype 'r').
    const fks = (await prisma.$queryRawUnsafe(
      `SELECT conname, confdeltype::text AS d FROM pg_constraint WHERE contype = 'f' AND conname ~ '^(AiModel|AiModelVersion|AiModelLifecycleEvent|InferenceRecord)_.*_fkey$'`,
    )) as Array<{ conname: string; d: string }>;
    ck(fks.length >= 8 && fks.every((r) => r.d === 'r'), `all P6 provenance FKs are ON DELETE RESTRICT (${fks.length} FKs: ${fks.map((r) => `${r.conname}:${r.d}`).join(', ')})`);

    // (O) existing reporting AI path unchanged + no coupling to the registry.
    ck(!!Prisma.dmmf.datamodel.models.find((x) => x.name === 'AiDraft'), 'AiDraft model still present (reporting path intact)');
    const aiDraftCoupling = Prisma.dmmf.datamodel.models.find((x) => x.name === 'AiDraft')!.fields.filter((f) => ['AiModel', 'AiModelVersion', 'InferenceRecord'].includes(f.type));
    ck(aiDraftCoupling.length === 0, 'AiDraft has no coupling to the new registry');

    // (P) AIScreeningResult (Legacy Demonstration Component) present + unconnected to the registry (both directions).
    const screen = Prisma.dmmf.datamodel.models.find((x) => x.name === 'AIScreeningResult');
    ck(!!screen, 'AIScreeningResult present (Legacy Demonstration Component intact)');
    const screenToReg = (screen?.fields ?? []).filter((f) => ['AiModel', 'AiModelVersion', 'InferenceRecord'].includes(f.type));
    const regToScreen = Prisma.dmmf.datamodel.models.find((x) => x.name === 'InferenceRecord')!.fields.filter((f) => f.type === 'AIScreeningResult');
    ck(screenToReg.length === 0 && regToScreen.length === 0, 'AIScreeningResult is unconnected to the registry (no relation either direction)');

    if (fails.length) {
      console.error('AI-INFRA ACCEPTANCE FAILURES:\n - ' + fails.join('\n - '));
      process.exit(1);
    }
    console.log(`P6-6A registry: catalogue=3 events=${evs.length} concurrentWinners=${winners} inferenceRows=0 provenanceFKs=${fks.length}(all RESTRICT)`);
    console.log('P6-6A AI MODEL REGISTRY ACCEPTANCE: all persisted-truth assertions passed (catalogue + no-default-grant + tenancy + semver + permanent-UUID + lifecycle + concurrency + RETIRED-terminal + promote≠manage + inert-empty-shell + RESTRICT-FKs + reporting-path-intact + screening-unconnected).');
  } finally {
    await app.close().catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('assert-ai-infra-state FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
