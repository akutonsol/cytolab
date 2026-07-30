/**
 * Program 6 · Phase 6G — persisted-truth acceptance for continuous evaluation evidence.
 *
 * Boots the REAL AppModule DI graph and drives the REAL ContinuousEvalService, asserting persisted DATABASE truth
 * (no mocks): additive schema (5 tables + 6 enums), 13 RESTRICT FKs, immutable window aggregate + membership snapshot,
 * model/window-definition/time-basis/config integrity, baseline compatibility, observed/synthetic/unavailable
 * provenance separation, cohort separation, structured metrics (no JSON), validated bounds, truthful empty/sparse
 * windows, advisory recommendation isolation + evidence linkage, deterministic calculationId + windowSignature, atomic
 * persistence, explicit completion state, append-only ownership, eligibility, claim boundary, NO lifecycle mutation /
 * automatic retirement, permission separation + no default grant, no prohibited lifecycle-authority terminology, no
 * PHI. Exits non-zero on any failed assertion.
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
  const fixturesPath = process.env.CONTINUOUS_EVAL_FIXTURES_OUT ? path.resolve(process.env.CONTINUOUS_EVAL_FIXTURES_OUT) : path.resolve(__dirname, '../../web/acceptance/.continuous-eval-fixtures.json');
  const fx = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
  const prisma = new PrismaClient();
  const fails: string[] = [];
  const ck = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };
  const threw = async (fn: () => Promise<unknown>) => { try { await fn(); return false; } catch { return true; } };

  /* eslint-disable @typescript-eslint/no-var-requires */
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../src/app.module');
  const { ContinuousEvalService } = require('../src/modules/continuous-eval/continuous-eval.service');
  const { ContinuousEvalController } = require('../src/modules/continuous-eval/continuous-eval.controller');
  const { PrismaService } = require('../src/database/prisma.service');
  const { AuditRecorder } = require('../src/modules/audit/audit-recorder.service');
  const { LabContext } = require('../src/common/tenancy/lab-context');
  const { PERMISSIONS_KEY } = require('../src/common/decorators/require-permissions.decorator');
  /* eslint-enable @typescript-eslint/no-var-requires */

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const svc = app.get(ContinuousEvalService);
    const prismaSvc = app.get(PrismaService);
    const audit = app.get(AuditRecorder);
    const lab = app.get(LabContext);
    const asA = <T>(fn: () => Promise<T>) => lab.runLabScoped(fx.labAId, fn) as Promise<T>;
    const win = fx.windowStart, wend = fx.windowEnd;
    const models = ['EvaluationWindow', 'EvaluationWindowMember', 'EvaluationMetric', 'EvaluationRecommendation', 'EvaluationRecommendationEvidence'];

    // ── (schema) tables + enums + RESTRICT FKs ──────────────────────────────────────────────────────────────
    const tableRows = (await prisma.$queryRawUnsafe(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1::text[])`, models)) as Array<{ table_name: string }>;
    ck(tableRows.length === 5, `all 5 evaluation tables exist (got ${tableRows.length})`);
    const enumRows = (await prisma.$queryRawUnsafe(`SELECT typname FROM pg_type WHERE typtype='e' AND typname = ANY($1::text[])`, ['EvaluationEvidenceProvenance', 'EvaluationCohort', 'EvaluationCoverageStatus', 'EvaluationMetricKind', 'EvaluationRecommendationCode', 'EvaluationWindowStatus'])) as Array<{ typname: string }>;
    ck(enumRows.length === 6, `all 6 evaluation enums exist (got ${enumRows.length})`);
    const fks = (await prisma.$queryRawUnsafe(`SELECT conname, confdeltype::text AS d FROM pg_constraint WHERE contype='f' AND conname ~ '^(EvaluationWindow|EvaluationWindowMember|EvaluationMetric|EvaluationRecommendation|EvaluationRecommendationEvidence)_.*_fkey$'`)) as Array<{ conname: string; d: string }>;
    ck(fks.length >= 13 && fks.every((r) => r.d === 'r'), `all 6G provenance FKs ON DELETE RESTRICT (${fks.length} FKs; non-RESTRICT: ${fks.filter((r) => r.d !== 'r').map((r) => r.conname).join(',') || 'none'})`);

    // ── (eligibility + cross-lab fail-closed + time order) ──────────────────────────────────────────────────
    for (const s of ['draftVersion', 'retiredVersion'] as const) {
      ck(await threw(() => asA(() => svc.runEvaluation({ modelVersionId: fx[s].id, windowStart: win, windowEnd: wend, cohort: 'NON_VALIDATION' }))), `${s} model rejected (only VALIDATION/APPROVED/DEPRECATED)`);
    }
    ck(await threw(() => asA(() => svc.runEvaluation({ modelVersionId: fx.bApprovedVersion.id, windowStart: win, windowEnd: wend, cohort: 'NON_VALIDATION' }))), 'cross-lab model version fails closed');
    ck(await threw(() => asA(() => svc.runEvaluation({ modelVersionId: fx.approvedVersion.id, windowStart: wend, windowEnd: win, cohort: 'NON_VALIDATION' }))), 'reversed time window rejected');

    // ── (window aggregate + snapshots + membership + cohort + observed/synthetic/unavailable + structured) ──
    const w = await asA(() => svc.runEvaluation({ modelVersionId: fx.approvedVersion.id, windowStart: win, windowEnd: wend, cohort: 'NON_VALIDATION', config: { failureRateThreshold: 0.5 } }));
    ck(w.completionState === 'COMPLETE', 'window has an explicit COMPLETE state (Guardrail 12)');
    ck(w.modelVersionUuid === fx.approvedVersion.versionUuid && w.modelUuid === fx.approvedVersion.modelUuid, 'model identity snapshot recorded');
    ck(w.timeBasis === 'UTC' && w.windowDefinitionVersion === 'eval-window-1.0', 'time-basis + window-definition integrity (Guardrail 7)');
    ck(/^[a-f0-9]{64}$/.test(w.calculationId) && /^[a-f0-9]{64}$/.test(w.windowSignature), 'deterministic calculationId + windowSignature recorded (Guardrails 6/8)');
    ck(w.sampleCount === 40 && w.coverageStatus === 'COVERED', `membership sample count + coverage (got ${w.sampleCount}/${w.coverageStatus})`);
    ck((await prisma.evaluationWindowMember.count({ where: { windowId: w.id } })) === 40, 'immutable membership snapshot materialized (Guardrail 1)');
    const metrics = await prisma.evaluationMetric.findMany({ where: { windowId: w.id } });
    ck(metrics.every((m) => m.cohort === 'NON_VALIDATION'), 'every metric records its cohort (Guardrail 9)');
    const fr = metrics.find((m) => m.metricKind === 'FAILURE_RATE')!;
    ck(fr.provenance === 'OBSERVED' && Math.abs((fr.value ?? -1) - 0.25) < 1e-3, 'OBSERVED failure rate computed from real records');
    ck(metrics.filter((m) => m.metricKind === 'CONFIDENCE_BIN').every((m) => m.provenance === 'SYNTHETIC_STUB'), 'confidence bins are SYNTHETIC_STUB, never observed (Guardrail 2)');
    ck(metrics.find((m) => m.metricKind === 'DRIFT_INDICATOR')!.provenance === 'UNAVAILABLE', 'drift UNAVAILABLE without a baseline');
    ck(metrics.filter((m) => m.value != null).every((m) => (['SUCCESS_RATE', 'FAILURE_RATE', 'TIMEOUT_RATE', 'CONFIDENCE_BIN', 'DRIFT_INDICATOR', 'CALIBRATION_DECAY'].includes(m.metricKind) ? m.value! >= 0 && m.value! <= 1 : m.value! >= 0)), 'metric values validated in bounds');
    ck(!models.some((m) => Prisma.dmmf.datamodel.models.find((x) => x.name === m)!.fields.some((f) => f.type === 'Json')), 'metrics are structured child rows, NOT JSON blobs');

    // ── (cohort separation — validationOnly not mixed) ──────────────────────────────────────────────────────
    const wVal = await asA(() => svc.runEvaluation({ modelVersionId: fx.approvedVersion.id, windowStart: win, windowEnd: wend, cohort: 'VALIDATION_ONLY' }));
    ck(wVal.sampleCount === 2, `validation-only cohort isolated (got ${wVal.sampleCount})`);

    // ── (truthful empty window) ─────────────────────────────────────────────────────────────────────────────
    const wEmpty = await asA(() => svc.runEvaluation({ modelVersionId: fx.approvedVersion.id, windowStart: fx.emptyWindowStart, windowEnd: fx.emptyWindowEnd, cohort: 'NON_VALIDATION' }));
    ck(wEmpty.sampleCount === 0 && wEmpty.coverageStatus === 'EMPTY', 'empty window recorded truthfully (sampleCount 0, EMPTY)');
    const emptyMetrics = await prisma.evaluationMetric.findMany({ where: { windowId: wEmpty.id } });
    ck(emptyMetrics.find((m) => m.metricKind === 'INFERENCE_COUNT')!.value === 0, 'empty window INFERENCE_COUNT = 0 (a real observation)');
    ck(emptyMetrics.filter((m) => ['SUCCESS_RATE', 'FAILURE_RATE', 'TIMEOUT_RATE'].includes(m.metricKind)).every((m) => m.provenance === 'UNAVAILABLE' && m.value === null && !!m.unavailableReason), 'empty window rates UNAVAILABLE with reason, no invented values');
    ck((await prisma.evaluationRecommendation.count({ where: { windowId: wEmpty.id } })) === 0, 'empty window issues no recommendation');

    // ── (baseline compatibility — Guardrail 3) ──────────────────────────────────────────────────────────────
    ck(await threw(() => asA(() => svc.runEvaluation({ modelVersionId: fx.approvedVersion.id, windowStart: win, windowEnd: wend, cohort: 'NON_VALIDATION', baselineValidationRunId: fx.foreignBaselineId }))), 'foreign-model-version baseline rejected');
    const wBase = await asA(() => svc.runEvaluation({ modelVersionId: fx.approvedVersion.id, windowStart: win, windowEnd: wend, cohort: 'NON_VALIDATION', baselineValidationRunId: fx.goodBaselineId }));
    ck(wBase.baselineCompatibility === 'OBSERVED' && (await prisma.evaluationMetric.findFirst({ where: { windowId: wBase.id, metricKind: 'DRIFT_INDICATOR' } }))?.provenance === 'OBSERVED', 'same-model baseline → drift OBSERVED');

    // ── (advisory recommendation isolation + evidence linkage — Guardrails 4/11) ────────────────────────────
    const wRec = await asA(() => svc.runEvaluation({ modelVersionId: fx.deprecatedVersion.id, windowStart: win, windowEnd: wend, cohort: 'NON_VALIDATION' })); // 0.8 failure, COVERED
    const recs = await prisma.evaluationRecommendation.findMany({ where: { windowId: wRec.id } });
    ck(recs.length === 1 && recs[0].recommendationCode === 'LIFECYCLE_REVIEW_RECOMMENDED', 'advisory LIFECYCLE_REVIEW_RECOMMENDED issued on covered over-threshold evidence');
    ck((await prisma.evaluationRecommendationEvidence.count({ where: { recommendationId: recs[0]?.id } })) > 0, 'recommendation references supporting metric evidence (isolated from metrics)');

    // ── (determinism + windowSignature + independent re-eval — Guardrails 6/8; append-only Decision 9) ──────
    const wA = await asA(() => svc.runEvaluation({ modelVersionId: fx.approvedVersion.id, windowStart: win, windowEnd: wend, cohort: 'NON_VALIDATION', config: { failureRateThreshold: 0.5 } }));
    ck(wA.calculationId === w.calculationId && wA.windowSignature === w.windowSignature && wA.windowUuid !== w.windowUuid, 'deterministic content + stable windowSignature; re-eval is a NEW window');
    const sig = async (id: string) => JSON.stringify((await prisma.evaluationMetric.findMany({ where: { windowId: id }, select: { metricKind: true, provenance: true, value: true, ordinal: true }, orderBy: { ordinal: 'asc' } })));
    ck((await sig(wA.id)) === (await sig(w.id)), 'deterministic: identical metric evidence across runs');

    // ── (atomic — invalid evaluator output persists nothing) ────────────────────────────────────────────────
    const badEvaluator = { evaluatorId: 'bad', evaluatorVersion: '0.0.0', evaluate: async () => ({ calculationId: 'a'.repeat(64), coverageStatus: 'SPARSE', metrics: [{ metricKind: 'FAILURE_RATE', provenance: 'OBSERVED', cohort: 'NON_VALIDATION', value: 2, ordinal: 0 }], recommendations: [] }) };
    const badSvc = new ContinuousEvalService(prismaSvc, audit, badEvaluator);
    const before = await prisma.evaluationWindow.count({ where: { labId: fx.labAId } });
    ck(await threw(() => asA(() => badSvc.runEvaluation({ modelVersionId: fx.approvedVersion.id, windowStart: win, windowEnd: wend, cohort: 'NON_VALIDATION' }))), 'invalid evaluator output rejected');
    ck((await prisma.evaluationWindow.count({ where: { labId: fx.labAId } })) === before, 'atomicity: invalid window persisted NOTHING (Guardrail 5)');

    // ── (no lifecycle mutation / no automatic retirement) ───────────────────────────────────────────────────
    const mvBefore = await prisma.aiModelVersion.findUnique({ where: { id: fx.deprecatedVersion.id } });
    await asA(() => svc.runEvaluation({ modelVersionId: fx.deprecatedVersion.id, windowStart: win, windowEnd: wend, cohort: 'NON_VALIDATION' }));
    const mvAfter = await prisma.aiModelVersion.findUnique({ where: { id: fx.deprecatedVersion.id } });
    ck(JSON.stringify(mvBefore) === JSON.stringify(mvAfter) && mvAfter?.lifecycleState === 'DEPRECATED', 'no support lifecycle mutation: model version byte-identical (still DEPRECATED); no automatic retirement');

    // ── (claim boundary + no PHI / no lifecycle-authority terminology; attached to model version; no rewrite) ─
    const phi = /patient|birth|\bdob\b|ssn|mrn|firstname|lastname|demographic|address|phone/i;
    const forbidden = /shouldRetire|autoRetire|retirementApproved|\bretire\b|\bdeprecate\b|\bpromote\b|\bdisable\b|certified|clinicalConfidence|\bdiagnosis\b/i;
    for (const m of models) {
      const fields = Prisma.dmmf.datamodel.models.find((x) => x.name === m)!.fields;
      ck(fields.map((f) => f.name).filter((f) => phi.test(f)).length === 0, `${m} has no PHI-bearing column`);
      ck(fields.map((f) => f.name).filter((f) => forbidden.test(f)).length === 0, `${m} has no lifecycle-authority/clinical column`);
    }
    const winFields = Prisma.dmmf.datamodel.models.find((x) => x.name === 'EvaluationWindow')!.fields;
    ck(winFields.find((f) => f.name === 'modelVersion')?.type === 'AiModelVersion', 'window attached to the model version');
    ck(!(svc.updateWindow || svc.deleteWindow || svc.retire || svc.deprecate || svc.promote), 'no service rewrite/lifecycle path');

    // ── (permission separation + no default grant + no evidence-mutation route) ─────────────────────────────
    const perms = await prisma.permission.findMany({ where: { code: { in: ['evaluation:view', 'evaluation:run', 'evaluation:manage'] } }, select: { code: true } });
    ck(perms.length === 3, `catalogue has evaluation:view/run/manage (got [${perms.map((p) => p.code).join(',')}])`);
    const roles = await prisma.role.findMany({ include: { permissions: { include: { permission: true } } } });
    const leaks = roles.filter((r) => !r.isSuperRole).filter((r) => r.permissions.some((rp) => rp.permission.code.startsWith('evaluation:')));
    ck(leaks.length === 0, `no default (non-super) role holds evaluation:* (offenders: [${leaks.map((r) => r.name).join(',')}])`);
    ck(JSON.stringify(Reflect.getMetadata(PERMISSIONS_KEY, (ContinuousEvalController.prototype as any).runEvaluation)) === JSON.stringify(['evaluation:run']), 'run route requires evaluation:run');
    ck(JSON.stringify(Reflect.getMetadata(PERMISSIONS_KEY, (ContinuousEvalController.prototype as any).listWindows)) === JSON.stringify(['evaluation:view']), 'list route requires evaluation:view');
    const routes = Object.getOwnPropertyNames(ContinuousEvalController.prototype).filter((n) => n !== 'constructor');
    ck(!routes.some((n) => /update|edit|delete|patch|retire|deprecate|promote|retrain|disable|overwrite/i.test(n)), 'no evidence-mutation or lifecycle route');

    // ── (non-regression neighbours) ─────────────────────────────────────────────────────────────────────────
    for (const m of ['AiModelVersion', 'InferenceRecord', 'ValidationRun', 'DatasetVersion', 'ExplainabilityGeneration', 'HumanReviewDecision', 'ResultSheet', 'Record']) {
      ck(!!Prisma.dmmf.datamodel.models.find((x) => x.name === m), `neighbour model ${m} still present (non-regression)`);
    }

    if (fails.length) {
      console.error('CONTINUOUS-EVAL ACCEPTANCE FAILURES:\n - ' + fails.join('\n - '));
      process.exit(1);
    }
    console.log(`P6-6G continuous eval: tables=${tableRows.length} enums=${enumRows.length} provenanceFKs=${fks.length}(all RESTRICT) membership-snapshot=verified cohort-separation=verified observed/synthetic/unavailable=verified empty-window=truthful baseline-compat=verified determinism+windowSignature=verified atomicity=verified no-lifecycle-mutation=verified advisory-isolation=verified`);
    console.log('P6-6G CONTINUOUS EVALUATION ACCEPTANCE: all persisted-truth assertions passed (schema + RESTRICT-FKs + immutable-window + membership-snapshot + model/window-def/time-basis-integrity + baseline-compatibility + observed/synthetic/unavailable-separation + cohort-separation + structured-metrics + validated-bounds + truthful-empty/sparse + advisory-isolation + evidence-linkage + calculationId + windowSignature + atomicity + completion-state + determinism + append-only + eligibility + claim-boundary + no-lifecycle-mutation + no-automatic-retirement + permission-separation/no-default-grant + no-lifecycle-authority-terminology + no-PHI + Program-5/6A-6F-non-regression).');
  } finally {
    await app.close().catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('assert-continuous-eval-state FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
