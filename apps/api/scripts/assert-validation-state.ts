/**
 * Program 6 · Phase 6F — persisted-truth acceptance for validation evidence.
 *
 * Boots the REAL AppModule DI graph and drives the REAL ValidationService, asserting persisted DATABASE truth (no
 * mocks): additive schema (4 tables + 1 enum), 9 RESTRICT FKs, immutable FROZEN-dataset × model-version linkage,
 * dataset/model/config snapshot integrity (Guardrails 1/2/5), metric provenance + schema version (Guardrails 3/7),
 * deterministic calculation id + reproducibility (Guardrail 4), structured validated metrics/cells/points with
 * confusion-matrix consistency, atomic persistence (Guardrail 6), cross-run independence (Guardrail 8), eligibility
 * enforcement, claim-boundary enforcement, NO automatic lifecycle promotion, permission separation + no default grant,
 * no evidence-mutation route, no prohibited certification/clinical-authority terminology, and no PHI columns. Exits
 * non-zero on any failed assertion.
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
  const fixturesPath = process.env.VALIDATION_FIXTURES_OUT ? path.resolve(process.env.VALIDATION_FIXTURES_OUT) : path.resolve(__dirname, '../../web/acceptance/.validation-fixtures.json');
  const fx = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
  const prisma = new PrismaClient();
  const fails: string[] = [];
  const ck = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };
  const threw = async (fn: () => Promise<unknown>) => { try { await fn(); return false; } catch { return true; } };

  /* eslint-disable @typescript-eslint/no-var-requires */
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../src/app.module');
  const { ValidationService } = require('../src/modules/validation/validation.service');
  const { ValidationController } = require('../src/modules/validation/validation.controller');
  const { PrismaService } = require('../src/database/prisma.service');
  const { AuditRecorder } = require('../src/modules/audit/audit-recorder.service');
  const { LabContext } = require('../src/common/tenancy/lab-context');
  const { PERMISSIONS_KEY } = require('../src/common/decorators/require-permissions.decorator');
  /* eslint-enable @typescript-eslint/no-var-requires */

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const svc = app.get(ValidationService);
    const prismaSvc = app.get(PrismaService);
    const audit = app.get(AuditRecorder);
    const lab = app.get(LabContext);
    const asA = <T>(fn: () => Promise<T>) => lab.runLabScoped(fx.labAId, fn) as Promise<T>;
    const models = ['ValidationRun', 'ValidationMetric', 'ValidationConfusionCell', 'ValidationCurvePoint'];

    // ── (schema) tables + enum + RESTRICT FKs ───────────────────────────────────────────────────────────────
    const tableRows = (await prisma.$queryRawUnsafe(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1::text[])`, models)) as Array<{ table_name: string }>;
    ck(tableRows.length === 4, `all 4 validation tables exist (got ${tableRows.length})`);
    const enumRows = (await prisma.$queryRawUnsafe(`SELECT typname FROM pg_type WHERE typtype='e' AND typname = ANY($1::text[])`, ['ValidationMetricKind'])) as Array<{ typname: string }>;
    ck(enumRows.length === 1, `the validation enum exists (got ${enumRows.length})`);
    const fks = (await prisma.$queryRawUnsafe(`SELECT conname, confdeltype::text AS d FROM pg_constraint WHERE contype='f' AND conname ~ '^(ValidationRun|ValidationMetric|ValidationConfusionCell|ValidationCurvePoint)_.*_fkey$'`)) as Array<{ conname: string; d: string }>;
    ck(fks.length >= 9 && fks.every((r) => r.d === 'r'), `all 6F provenance FKs ON DELETE RESTRICT (${fks.length} FKs; non-RESTRICT: ${fks.filter((r) => r.d !== 'r').map((r) => r.conname).join(',') || 'none'})`);

    // ── (eligibility + cross-lab fail-closed) ───────────────────────────────────────────────────────────────
    for (const s of ['draftVersion', 'deprecatedVersion', 'retiredVersion'] as const) {
      ck(await threw(() => asA(() => svc.runValidation({ modelVersionId: fx[s].id, datasetVersionId: fx.frozenDatasetVersionId }))), `${s} model rejected (only VALIDATION/APPROVED)`);
    }
    ck(await threw(() => asA(() => svc.runValidation({ modelVersionId: fx.approvedVersion.id, datasetVersionId: fx.draftDatasetVersionId }))), 'non-FROZEN dataset rejected');
    ck(await threw(() => asA(() => svc.runValidation({ modelVersionId: fx.bApprovedVersion.id, datasetVersionId: fx.frozenDatasetVersionId }))), 'cross-lab model version fails closed');
    ck(await threw(() => asA(() => svc.runValidation({ modelVersionId: fx.approvedVersion.id, datasetVersionId: fx.bFrozenDatasetVersionId }))), 'cross-lab dataset version fails closed');

    // ── (run: linkage + snapshots + provenance + structured metrics + consistency) ──────────────────────────
    const run = await asA(() => svc.runValidation({ modelVersionId: fx.approvedVersion.id, datasetVersionId: fx.frozenDatasetVersionId, config: { thresholds: { t: 0.5 }, metrics: { set: 'core' }, computation: { mode: 'demo' } } }));
    ck(run.modelVersionId === fx.approvedVersion.id && run.datasetVersionId === fx.frozenDatasetVersionId, 'run binds the model version × frozen dataset version');
    // Guardrail 2 — model snapshot
    ck(run.modelVersionUuid === fx.approvedVersion.versionUuid && run.modelUuid === fx.approvedVersion.modelUuid && run.modelArtifactDigest === 'a'.repeat(64) && run.modelLifecycleStateAtRun === 'APPROVED', 'model identity snapshot recorded (Guardrail 2)');
    // Guardrail 1 — dataset snapshot
    ck(run.datasetManifestDigest === 'm'.repeat(64) && /^[a-f0-9]{64}$/.test(run.groundTruthDigest), 'dataset identity + ground-truth snapshot recorded (Guardrail 1)');
    // Guardrail 5 — config snapshot
    ck([run.configDigest, run.thresholdConfigDigest, run.metricSelectionDigest, run.computationConfigDigest].every((d) => /^[a-f0-9]{64}$/.test(d ?? '')), 'config snapshot digests recorded (Guardrail 5)');
    // Guardrails 3/7/4 — provenance + schema version + calculation id
    ck(run.computationVersion === '6f.1.0' && run.metricSchemaVersion === 'validation-metrics-1.0' && /^[a-f0-9]{64}$/.test(run.calculationId), 'computation + metric-schema version + calculation id recorded (Guardrails 3/7/4)');
    // structured metrics (not JSON) + numeric bounds
    const metrics = await prisma.validationMetric.findMany({ where: { runId: run.id } });
    const cells = await prisma.validationConfusionCell.findMany({ where: { runId: run.id } });
    const points = await prisma.validationCurvePoint.findMany({ where: { runId: run.id } });
    ck(metrics.length >= 6 && cells.length === 4 && points.length >= 4, `structured evidence graph (metrics=${metrics.length}, cells=${cells.length}, points=${points.length})`);
    ck(metrics.filter((m) => m.metricKind !== 'OPERATING_THRESHOLD').every((m) => !!m.numeratorSource), 'ratio metrics carry numerator provenance (Guardrail 3)');
    ck(metrics.filter((m) => m.value != null).every((m) => m.value! >= 0 && m.value! <= 1), 'metric ratios validated in [0,1]');
    ck(cells.every((c) => Number.isInteger(c.count) && c.count >= 0), 'confusion counts are non-negative integers');
    ck(points.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1), 'curve coordinates validated in [0,1]');
    ck(!models.some((m) => Prisma.dmmf.datamodel.models.find((x) => x.name === m)!.fields.some((f) => f.type === 'Json')), 'metrics are structured child rows, NOT JSON blobs');
    // confusion-matrix consistency: sensitivity == tp/(tp+fn)
    const cell = (t: string, p: string) => cells.find((c) => c.trueClassCode === t && c.predClassCode === p)!.count;
    const tp = cell('class-a', 'class-a'), fn = cell('class-a', 'class-b');
    const sens = metrics.find((m) => m.metricKind === 'SENSITIVITY')!.value!;
    ck(Math.abs(sens - tp / (tp + fn)) < 1e-3, `sensitivity is consistent with the confusion matrix (sens=${sens}, tp/(tp+fn)=${(tp / (tp + fn)).toFixed(4)})`);

    // ── (deterministic reproducibility + cross-run independence) ────────────────────────────────────────────
    const run2 = await asA(() => svc.runValidation({ modelVersionId: fx.approvedVersion.id, datasetVersionId: fx.frozenDatasetVersionId, config: { thresholds: { t: 0.5 }, metrics: { set: 'core' }, computation: { mode: 'demo' } } }));
    ck(run2.runUuid !== run.runUuid, 'revalidation creates a NEW run');
    ck(run2.calculationId === run.calculationId, 'deterministic: identical calculation id for identical snapshot+config (Guardrail 4)');
    const sig = async (id: string) => JSON.stringify((await prisma.validationMetric.findMany({ where: { runId: id }, select: { metricKind: true, value: true, ordinal: true }, orderBy: { ordinal: 'asc' } })));
    ck((await sig(run.id)) === (await sig(run2.id)), 'deterministic: identical metric values across runs');
    const ids1 = (await prisma.validationConfusionCell.findMany({ where: { runId: run.id }, select: { id: true } })).map((r) => r.id);
    const ids2 = (await prisma.validationConfusionCell.findMany({ where: { runId: run2.id }, select: { id: true } })).map((r) => r.id);
    ck(ids1.length === 4 && ids2.length === 4 && !ids1.some((i) => ids2.includes(i)), 'cross-run independence: each run owns disjoint child entities (Guardrail 8)');

    // ── (atomic persistence — invalid evidence persists nothing) ────────────────────────────────────────────
    const badValidator = { validatorId: 'bad', validatorVersion: '0.0.0', validate: async () => ({ calculationId: 'a'.repeat(64), metrics: [{ metricKind: 'SENSITIVITY', value: 2, ordinal: 0 }], confusionCells: [{ trueClassCode: 'a', predClassCode: 'a', count: 1 }], curvePoints: [] }) };
    const badSvc = new ValidationService(prismaSvc, audit, badValidator);
    const before = await prisma.validationRun.count({ where: { labId: fx.labAId } });
    ck(await threw(() => asA(() => badSvc.runValidation({ modelVersionId: fx.approvedVersion.id, datasetVersionId: fx.frozenDatasetVersionId }))), 'invalid validator output rejected');
    ck((await prisma.validationRun.count({ where: { labId: fx.labAId } })) === before, 'atomicity: invalid run persisted NOTHING (Guardrail 6)');

    // ── (no automatic lifecycle promotion) ──────────────────────────────────────────────────────────────────
    const mvBefore = await prisma.aiModelVersion.findUnique({ where: { id: fx.validationVersion.id } });
    await asA(() => svc.runValidation({ modelVersionId: fx.validationVersion.id, datasetVersionId: fx.frozenDatasetVersionId }));
    const mvAfter = await prisma.aiModelVersion.findUnique({ where: { id: fx.validationVersion.id } });
    ck(JSON.stringify(mvBefore) === JSON.stringify(mvAfter) && mvAfter?.lifecycleState === 'VALIDATION', 'no support lifecycle promotion: the model version is byte-identical (still VALIDATION) after validation');

    // ── (claim boundary + no PHI + attached to model version + no rewrite path) ─────────────────────────────
    const phi = /patient|birth|\bdob\b|ssn|mrn|firstname|lastname|demographic|address|phone/i;
    const claim = /certified|\bapproved\b|clinicallyAccurate|fdaValidated|diagnosticQuality|provenSafe|\bdiagnosis\b|clinicalConfidence/i;
    for (const m of models) {
      const fields = Prisma.dmmf.datamodel.models.find((x) => x.name === m)!.fields;
      ck(fields.map((f) => f.name).filter((f) => phi.test(f)).length === 0, `${m} has no PHI-bearing column`);
      ck(fields.map((f) => f.name).filter((f) => claim.test(f)).length === 0, `${m} has no certification/clinical-authority column`);
    }
    const runFields = Prisma.dmmf.datamodel.models.find((x) => x.name === 'ValidationRun')!.fields;
    ck(runFields.find((f) => f.name === 'modelVersion')?.type === 'AiModelVersion' && !runFields.some((f) => ['DigitalSlide', 'Patient', 'InferenceRecord'].includes(f.type)), 'validation is attached to the model version (not slide/patient/inference)');
    ck(!(svc.updateRun || svc.editRun || svc.deleteRun || svc.promote), 'no service rewrite/promotion path');

    // ── (permission separation + no default grant + no evidence-mutation route) ─────────────────────────────
    const perms = await prisma.permission.findMany({ where: { code: { in: ['validation:view', 'validation:run', 'validation:manage'] } }, select: { code: true } });
    ck(perms.length === 3, `catalogue has validation:view/run/manage (got [${perms.map((p) => p.code).join(',')}])`);
    const roles = await prisma.role.findMany({ include: { permissions: { include: { permission: true } } } });
    const leaks = roles.filter((r) => !r.isSuperRole).filter((r) => r.permissions.some((rp) => rp.permission.code.startsWith('validation:')));
    ck(leaks.length === 0, `no default (non-super) role holds validation:* (offenders: [${leaks.map((r) => r.name).join(',')}])`);
    ck(JSON.stringify(Reflect.getMetadata(PERMISSIONS_KEY, (ValidationController.prototype as any).runValidation)) === JSON.stringify(['validation:run']), 'run route requires validation:run');
    ck(JSON.stringify(Reflect.getMetadata(PERMISSIONS_KEY, (ValidationController.prototype as any).listRuns)) === JSON.stringify(['validation:view']), 'list route requires validation:view');
    const routes = Object.getOwnPropertyNames(ValidationController.prototype).filter((n) => n !== 'constructor');
    ck(!routes.some((n) => /update|edit|delete|patch|promote|approve|certify|overwrite/i.test(n)), 'no evidence-mutation or lifecycle-promotion route');

    // ── (non-regression neighbours) ─────────────────────────────────────────────────────────────────────────
    for (const m of ['AiModelVersion', 'DatasetVersion', 'GroundTruthLabel', 'InferenceRecord', 'ExplainabilityGeneration', 'HumanReviewDecision', 'ResultSheet', 'Record']) {
      ck(!!Prisma.dmmf.datamodel.models.find((x) => x.name === m), `neighbour model ${m} still present (non-regression)`);
    }

    if (fails.length) {
      console.error('VALIDATION ACCEPTANCE FAILURES:\n - ' + fails.join('\n - '));
      process.exit(1);
    }
    console.log(`P6-6F validation: tables=${tableRows.length} enum=${enumRows.length} provenanceFKs=${fks.length}(all RESTRICT) linkage=frozen-dataset×model snapshots=verified metric-provenance=verified determinism=verified cross-run-independence=verified atomicity=verified no-lifecycle-promotion=verified`);
    console.log('P6-6F VALIDATION ACCEPTANCE: all persisted-truth assertions passed (schema + RESTRICT-FKs + frozen-dataset×model-linkage + dataset/model/config-snapshots + metric-provenance + metric-schema-version + calculation-id + structured-metrics + validated-bounds + confusion-consistency + determinism + cross-run-independence + atomicity + eligibility + claim-boundary + no-lifecycle-promotion + permission-separation/no-default-grant + no-mutation-route + no-clinical-terminology/PHI + Program-5/6A-6E-non-regression).');
  } finally {
    await app.close().catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('assert-validation-state FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
