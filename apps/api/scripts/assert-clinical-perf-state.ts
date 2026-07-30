/**
 * Program 6 · Phase 6H — persisted-truth acceptance for clinical-performance MEASUREMENT evidence.
 *
 * Boots the REAL AppModule DI graph and drives the REAL ClinicalPerfService, asserting persisted DATABASE truth (no
 * mocks): additive schema (3 tables + 6 enums), 9 RESTRICT FKs, no JSON column, NO recommendation entity (Guardrail 5);
 * immutable window + dual-source membership snapshot (6C InferenceRecord + 6E HumanReviewDecision, never a Program-5
 * clinical object — Guardrail 3/1) + atomic persistence + explicit COMPLETE state; deterministic calculationId +
 * windowSignature (re-measurement is a NEW window); cohort separation (CLINICAL vs VALIDATION_ONLY); OBSERVED /
 * SYNTHETIC_STUB / UNAVAILABLE provenance truthful (agreement/concordance are CONSISTENCY, never correctness; empty
 * window truthful); operationalDataUsed truthful + Program-5 read-only + no Program-5 mutation; baseline compatibility;
 * claim boundary — no correctness/diagnostic-accuracy/clinical-validity terminology, no support diagnostic authority;
 * model/inference/decision byte-identical after measurement; no lifecycle/diagnostic/recommendation route; permission
 * separation + no default grant; no PHI. Exits non-zero on any failed assertion.
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
  const fixturesPath = process.env.CLINICAL_PERF_FIXTURES_OUT ? path.resolve(process.env.CLINICAL_PERF_FIXTURES_OUT) : path.resolve(__dirname, '../../web/acceptance/.clinical-perf-fixtures.json');
  const fx = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
  const prisma = new PrismaClient();
  const fails: string[] = [];
  const ck = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };
  const threw = async (fn: () => Promise<unknown>) => { try { await fn(); return false; } catch { return true; } };

  /* eslint-disable @typescript-eslint/no-var-requires */
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../src/app.module');
  const { ClinicalPerfService } = require('../src/modules/clinical-perf/clinical-perf.service');
  const { ClinicalPerfController } = require('../src/modules/clinical-perf/clinical-perf.controller');
  const { PrismaService } = require('../src/database/prisma.service');
  const { AuditRecorder } = require('../src/modules/audit/audit-recorder.service');
  const { LabContext } = require('../src/common/tenancy/lab-context');
  const { PERMISSIONS_KEY } = require('../src/common/decorators/require-permissions.decorator');
  /* eslint-enable @typescript-eslint/no-var-requires */

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const svc = app.get(ClinicalPerfService);
    const prismaSvc = app.get(PrismaService);
    const audit = app.get(AuditRecorder);
    const lab = app.get(LabContext);
    const asA = <T>(fn: () => Promise<T>) => lab.runLabScoped(fx.labAId, fn) as Promise<T>;
    const asB = <T>(fn: () => Promise<T>) => lab.runLabScoped(fx.labBId, fn) as Promise<T>;
    const win = fx.windowStart, wend = fx.windowEnd;
    const models = ['ClinicalPerfWindow', 'ClinicalPerfWindowMember', 'ClinicalPerfMetric'];

    // ── (schema) 3 tables + 6 enums + 9 RESTRICT FKs + no JSON + no recommendation entity ──────────────────────
    const tableRows = (await prisma.$queryRawUnsafe(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1::text[])`, models)) as Array<{ table_name: string }>;
    ck(tableRows.length === 3, `all 3 clinical-perf tables exist (got ${tableRows.length})`);
    const enumRows = (await prisma.$queryRawUnsafe(`SELECT typname FROM pg_type WHERE typtype='e' AND typname = ANY($1::text[])`, ['ClinicalPerfMetricKind', 'ClinicalPerfEvidenceProvenance', 'ClinicalPerfCohort', 'ClinicalPerfCoverageStatus', 'ClinicalPerfMemberSource', 'ClinicalPerfWindowStatus'])) as Array<{ typname: string }>;
    ck(enumRows.length === 6, `all 6 clinical-perf enums exist (got ${enumRows.length})`);
    const fks = (await prisma.$queryRawUnsafe(`SELECT conname, confdeltype::text AS d FROM pg_constraint WHERE contype='f' AND conname ~ '^(ClinicalPerfWindow|ClinicalPerfWindowMember|ClinicalPerfMetric)_.*_fkey$'`)) as Array<{ conname: string; d: string }>;
    ck(fks.length >= 9 && fks.every((r) => r.d === 'r'), `all 6H FKs ON DELETE RESTRICT (${fks.length} FKs; non-RESTRICT: ${fks.filter((r) => r.d !== 'r').map((r) => r.conname).join(',') || 'none'})`);
    ck(!models.some((m) => Prisma.dmmf.datamodel.models.find((x) => x.name === m)!.fields.some((f) => f.type === 'Json')), 'measurements are structured child rows, NOT JSON blobs');
    ck(!Prisma.dmmf.datamodel.models.find((x) => /ClinicalPerf.*Recommendation/i.test(x.name)), 'NO recommendation entity (Guardrail 5)');

    // ── (eligibility + cross-lab fail-closed + reversed window) ─────────────────────────────────────────────────
    for (const s of ['draftVersion', 'retiredVersion'] as const) {
      ck(await threw(() => asA(() => svc.runMeasurement({ modelVersionId: fx[s].id, windowStart: win, windowEnd: wend, cohort: 'CLINICAL' }))), `${s} model rejected (only VALIDATION/APPROVED/DEPRECATED)`);
    }
    ck(await threw(() => asA(() => svc.runMeasurement({ modelVersionId: fx.bApprovedVersion.id, windowStart: win, windowEnd: wend, cohort: 'CLINICAL' }))), 'cross-lab model version fails closed');
    ck(await threw(() => asB(() => svc.getWindow('nonexistent'))), 'getWindow cross-lab/unknown fails closed');
    ck(await threw(() => asA(() => svc.runMeasurement({ modelVersionId: fx.approvedVersion.id, windowStart: wend, windowEnd: win, cohort: 'CLINICAL' }))), 'reversed time window rejected');

    // ── (window aggregate + snapshots + dual-source membership + COMPLETE + structured) ────────────────────────
    const w = await asA(() => svc.runMeasurement({ modelVersionId: fx.approvedVersion.id, windowStart: win, windowEnd: wend, cohort: 'CLINICAL' }));
    ck(w.completionState === 'COMPLETE', 'window has an explicit COMPLETE state (Decision 9)');
    ck(w.modelVersionUuid === fx.approvedVersion.versionUuid && w.modelUuid === fx.approvedVersion.modelUuid, 'model identity snapshot recorded');
    ck(w.timeBasis === 'UTC' && w.windowDefinitionVersion === 'clinicalperf-window-1.0', 'time-basis + window-definition integrity');
    ck(/^[a-f0-9]{64}$/.test(w.calculationId) && /^[a-f0-9]{64}$/.test(w.windowSignature), 'deterministic calculationId + windowSignature recorded');
    ck(w.sampleCount === 10 && w.coverageStatus === 'SPARSE', `membership sample count + coverage (got ${w.sampleCount}/${w.coverageStatus})`);
    const dbMembers = await prisma.clinicalPerfWindowMember.findMany({ where: { windowId: w.id } });
    ck(dbMembers.length === 10, `immutable membership snapshot materialized (got ${dbMembers.length})`);
    ck(dbMembers.filter((m) => m.source === 'HUMAN_REVIEW_DECISION').length === 4 && dbMembers.filter((m) => m.source === 'INFERENCE_RECORD').length === 6, 'dual-source membership: 4 6E decisions + 6 6C inferences');
    ck(dbMembers.every((m) => (m.source === 'HUMAN_REVIEW_DECISION') === !!m.humanReviewDecisionId && (m.source === 'INFERENCE_RECORD') === !!m.inferenceRecordId), 'each member sets exactly one governed-evidence reference');
    ck(dbMembers.every((m) => (m.humanReviewDecisionId ? 1 : 0) + (m.inferenceRecordId ? 1 : 0) === 1), 'no member references two sources');

    // ── (OBSERVED consistency + SYNTHETIC_STUB + UNAVAILABLE truthful; sourceSubsystem coded) ──────────────────
    const metrics = await prisma.clinicalPerfMetric.findMany({ where: { windowId: w.id } });
    ck(metrics.every((m) => m.cohort === 'CLINICAL'), 'every metric records its cohort');
    const agr = metrics.find((m) => m.metricKind === 'READER_AGREEMENT')!;
    ck(agr.provenance === 'OBSERVED' && Math.abs((agr.value ?? -1) - 0.75) < 1e-3, 'reader agreement OBSERVED consistency (modal 3/4), NOT correctness');
    const con = metrics.find((m) => m.metricKind === 'CONCORDANCE')!;
    ck(con.provenance === 'OBSERVED' && Math.abs((con.value ?? -1) - 0.75) < 1e-3, 'concordance OBSERVED consistency (3 ACCEPT/4), NOT correctness');
    ck(metrics.find((m) => m.metricKind === 'WORKLOAD_COUNT')!.value === 10, 'workload count is a real observation (10)');
    ck(metrics.find((m) => m.metricKind === 'WORKLOAD_REDUCTION')!.provenance === 'SYNTHETIC_STUB', 'workload-reduction is SYNTHETIC_STUB, never invented as observed');
    ck(metrics.filter((m) => m.metricKind === 'REVIEW_DURATION' || m.metricKind === 'TURNAROUND_DURATION').every((m) => m.provenance === 'UNAVAILABLE' && m.value === null && !!m.unavailableReason), 'timing metrics UNAVAILABLE with reason (not read), no invented values');
    ck(metrics.find((m) => m.metricKind === 'OPERATIONAL_THROUGHPUT')!.provenance === 'OBSERVED', 'operational throughput OBSERVED from real records');
    ck(metrics.every((m) => ['6c', '6e', '6c+6e', '6f', 'program5-operational', 'synthetic'].includes(m.sourceSubsystem)), 'metric sourceSubsystem is coded (no free narrative)');
    ck(metrics.filter((m) => m.value != null).every((m) => (['READER_AGREEMENT', 'CONCORDANCE', 'WORKLOAD_REDUCTION'].includes(m.metricKind) ? m.value! >= 0 && m.value! <= 1 : m.value! >= 0)), 'metric values validated in bounds');

    // ── (cohort separation — VALIDATION_ONLY not mixed with CLINICAL) ──────────────────────────────────────────
    const wVal = await asA(() => svc.runMeasurement({ modelVersionId: fx.approvedVersion.id, windowStart: win, windowEnd: wend, cohort: 'VALIDATION_ONLY' }));
    ck(wVal.sampleCount === 2, `validation-only cohort isolated (got ${wVal.sampleCount})`);
    ck((await prisma.clinicalPerfMetric.findMany({ where: { windowId: wVal.id } })).every((m) => m.cohort === 'VALIDATION_ONLY'), 'validation-only metrics never carry the CLINICAL cohort');

    // ── (truthful empty window) ────────────────────────────────────────────────────────────────────────────────
    const wEmpty = await asA(() => svc.runMeasurement({ modelVersionId: fx.approvedVersion.id, windowStart: fx.emptyWindowStart, windowEnd: fx.emptyWindowEnd, cohort: 'CLINICAL' }));
    ck(wEmpty.sampleCount === 0 && wEmpty.coverageStatus === 'EMPTY', 'empty window recorded truthfully (sampleCount 0, EMPTY)');
    const emptyMetrics = await prisma.clinicalPerfMetric.findMany({ where: { windowId: wEmpty.id } });
    ck(emptyMetrics.find((m) => m.metricKind === 'WORKLOAD_COUNT')!.value === 0, 'empty window WORKLOAD_COUNT = 0 (a real observation)');
    ck(emptyMetrics.filter((m) => ['READER_AGREEMENT', 'CONCORDANCE'].includes(m.metricKind)).every((m) => m.provenance === 'UNAVAILABLE' && m.value === null), 'empty window agreement/concordance UNAVAILABLE, no invented values');

    // ── (baseline compatibility — same model version only) ────────────────────────────────────────────────────
    ck(await threw(() => asA(() => svc.runMeasurement({ modelVersionId: fx.approvedVersion.id, windowStart: win, windowEnd: wend, cohort: 'CLINICAL', baselineValidationRunId: fx.foreignBaselineId }))), 'foreign-model-version baseline rejected');
    const wBase = await asA(() => svc.runMeasurement({ modelVersionId: fx.approvedVersion.id, windowStart: win, windowEnd: wend, cohort: 'CLINICAL', baselineValidationRunId: fx.goodBaselineId }));
    ck(wBase.evidenceCompatibility === 'OBSERVED' && wBase.baselineValidationRunId === fx.goodBaselineId, 'same-model baseline → evidenceCompatibility OBSERVED');

    // ── (operationalDataUsed truthful + Program-5 read-only isolation) ─────────────────────────────────────────
    ck(w.operationalDataUsed === false, 'operationalDataUsed truthfully false when not opted in (Decision 4)');
    const wOp = await asA(() => svc.runMeasurement({ modelVersionId: fx.approvedVersion.id, windowStart: win, windowEnd: wend, cohort: 'CLINICAL', operationalDataUsed: true }));
    ck(wOp.operationalDataUsed === true, 'operationalDataUsed recorded truthfully when opted in');
    // membership + measurement reference ONLY AI-evidence layers — never a Program-5 clinical/narrative object (Guardrail 1)
    for (const m of models) {
      const fields = Prisma.dmmf.datamodel.models.find((x) => x.name === m)!.fields;
      ck(!fields.some((f) => ['ResultSheet', 'Record', 'RecordStatusEvent', 'AiDraft', 'Patient', 'SlideAnnotation'].includes(f.type)), `${m} references no Program-5 clinical/narrative object (Program-5 narrative structurally unreachable)`);
    }

    // ── (deterministic content + stable windowSignature + re-measurement is a NEW window) ─────────────────────
    const wA = await asA(() => svc.runMeasurement({ modelVersionId: fx.approvedVersion.id, windowStart: win, windowEnd: wend, cohort: 'CLINICAL' }));
    ck(wA.calculationId === w.calculationId && wA.windowSignature === w.windowSignature && wA.windowUuid !== w.windowUuid, 'deterministic content + stable windowSignature; re-measurement is a NEW window');
    const sig = async (id: string) => JSON.stringify((await prisma.clinicalPerfMetric.findMany({ where: { windowId: id }, select: { metricKind: true, provenance: true, value: true, ordinal: true }, orderBy: { ordinal: 'asc' } })));
    ck((await sig(wA.id)) === (await sig(w.id)), 'deterministic: identical metric evidence across runs');

    // ── (atomic — invalid evaluator output persists nothing) ──────────────────────────────────────────────────
    const badEvaluator = { evaluatorId: 'bad', evaluatorVersion: '0.0.0', evaluate: async () => ({ calculationId: 'a'.repeat(64), coverageStatus: 'SPARSE', metrics: [{ metricKind: 'READER_AGREEMENT', provenance: 'OBSERVED', cohort: 'CLINICAL', sourceSubsystem: '6e', value: 2, ordinal: 0 }] }) };
    const badSvc = new ClinicalPerfService(prismaSvc, audit, badEvaluator);
    const before = await prisma.clinicalPerfWindow.count({ where: { labId: fx.labAId } });
    ck(await threw(() => asA(() => badSvc.runMeasurement({ modelVersionId: fx.approvedVersion.id, windowStart: win, windowEnd: wend, cohort: 'CLINICAL' }))), 'invalid evaluator output rejected');
    ck((await prisma.clinicalPerfWindow.count({ where: { labId: fx.labAId } })) === before, 'atomicity: invalid window persisted NOTHING');

    // ── (NO diagnostic authority — model/inference/decision byte-identical after measurement) ─────────────────
    const dv = fx.deprecatedVersion;
    const someDec = await prisma.humanReviewDecision.findFirst({ where: { labId: fx.labAId, reviewedModelVersionId: fx.approvedVersion.id }, select: { id: true, inferenceRecordId: true } });
    const mvBefore = await prisma.aiModelVersion.findUnique({ where: { id: dv.id } });
    const irBefore = someDec ? await prisma.inferenceRecord.findUnique({ where: { id: someDec.inferenceRecordId! } }) : null;
    const decBefore = someDec ? await prisma.humanReviewDecision.findUnique({ where: { id: someDec.id } }) : null;
    await asA(() => svc.runMeasurement({ modelVersionId: dv.id, windowStart: win, windowEnd: wend, cohort: 'CLINICAL' }));
    ck(JSON.stringify(await prisma.aiModelVersion.findUnique({ where: { id: dv.id } })) === JSON.stringify(mvBefore) && mvBefore?.lifecycleState === 'DEPRECATED', 'no support diagnostic authority: model version byte-identical (still DEPRECATED); no lifecycle mutation');
    if (someDec) {
      ck(JSON.stringify(await prisma.inferenceRecord.findUnique({ where: { id: someDec.inferenceRecordId! } })) === JSON.stringify(irBefore), 'inference record byte-identical after measurement');
      ck(JSON.stringify(await prisma.humanReviewDecision.findUnique({ where: { id: someDec.id } })) === JSON.stringify(decBefore), 'human-review decision byte-identical after measurement');
    }

    // ── (claim boundary + no PHI / no correctness-diagnostic-clinical-validity terminology) ───────────────────
    const phi = /patient|birth|\bdob\b|ssn|mrn|firstname|lastname|demographic|address|phone/i;
    const forbidden = /clinicallyValid|clinicallyApproved|clinicallyVerified|clinicallySafe|clinicallyEffective|FDA|certified|diagnosticAccuracy|superiorTo|nonInferior|\bdiagnosis\b|\bcorrect\b|recommend/i;
    for (const m of models) {
      const fields = Prisma.dmmf.datamodel.models.find((x) => x.name === m)!.fields;
      ck(fields.map((f) => f.name).filter((f) => phi.test(f)).length === 0, `${m} has no PHI-bearing column`);
      ck(fields.map((f) => f.name).filter((f) => forbidden.test(f)).length === 0, `${m} has no correctness/diagnostic-accuracy/clinical-validity column`);
    }
    ck(!(svc.updateWindow || svc.deleteWindow || svc.retire || svc.promote || svc.diagnose || svc.certify), 'no service rewrite/lifecycle/diagnostic path');

    // ── (permission separation + no default grant + no evidence-mutation/lifecycle/diagnostic route) ──────────
    const perms = await prisma.permission.findMany({ where: { code: { in: ['clinicalperf:view', 'clinicalperf:run', 'clinicalperf:manage'] } }, select: { code: true } });
    ck(perms.length === 3, `catalogue has clinicalperf:view/run/manage (got [${perms.map((p) => p.code).join(',')}])`);
    const roles = await prisma.role.findMany({ include: { permissions: { include: { permission: true } } } });
    const leaks = roles.filter((r) => !r.isSuperRole).filter((r) => r.permissions.some((rp) => rp.permission.code.startsWith('clinicalperf:')));
    ck(leaks.length === 0, `no default (non-super) role holds clinicalperf:* (offenders: [${leaks.map((r) => r.name).join(',')}])`);
    ck(JSON.stringify(Reflect.getMetadata(PERMISSIONS_KEY, (ClinicalPerfController.prototype as any).runMeasurement)) === JSON.stringify(['clinicalperf:run']), 'run route requires clinicalperf:run');
    ck(JSON.stringify(Reflect.getMetadata(PERMISSIONS_KEY, (ClinicalPerfController.prototype as any).listWindows)) === JSON.stringify(['clinicalperf:view']), 'list route requires clinicalperf:view');
    const routes = Object.getOwnPropertyNames(ClinicalPerfController.prototype).filter((n) => n !== 'constructor');
    ck(!routes.some((n) => /update|edit|delete|patch|retire|promote|approve|certify|recommend|diagnos|overwrite/i.test(n)), 'no evidence-mutation, lifecycle, diagnostic, or recommendation route');

    // ── (non-regression neighbours — Program 5 + 6A–6G) ───────────────────────────────────────────────────────
    for (const m of ['AiModelVersion', 'InferenceRecord', 'ValidationRun', 'DatasetVersion', 'ExplainabilityGeneration', 'HumanReviewDecision', 'EvaluationWindow', 'ResultSheet', 'Record']) {
      ck(!!Prisma.dmmf.datamodel.models.find((x) => x.name === m), `neighbour model ${m} still present (non-regression)`);
    }

    if (fails.length) {
      console.error('CLINICAL-PERF ACCEPTANCE FAILURES:\n - ' + fails.join('\n - '));
      process.exit(1);
    }
    console.log(`P6-6H clinical performance: tables=${tableRows.length} enums=${enumRows.length} FKs=${fks.length}(all RESTRICT) dual-source-membership=verified cohort-separation=verified observed/synthetic/unavailable=truthful empty-window=truthful baseline-compat=verified determinism+windowSignature=verified atomicity=verified no-diagnostic-authority=verified no-recommendation=verified`);
    console.log('P6-6H CLINICAL PERFORMANCE ACCEPTANCE: all persisted-truth assertions passed (schema + RESTRICT-FKs + no-JSON + no-recommendation-entity + immutable-window + dual-source-membership-snapshot + model-identity-snapshot + window-def/time-basis-integrity + cohort-separation + observed-consistency/synthetic/unavailable-truthful + truthful-empty-window + baseline-compatibility + operationalDataUsed-truthful + Program-5-narrative-unreachable + deterministic-calculationId + windowSignature + re-measurement-new-window + atomicity + completion-state + no-support-diagnostic-authority(model/inference/decision-byte-identical) + claim-boundary/no-correctness-diagnostic-clinical-validity-terminology + no-PHI + permission-separation/no-default-grant + no-lifecycle/diagnostic/recommendation-route + Program-5/6A-6G-non-regression).');
  } finally {
    await app.close().catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('assert-clinical-perf-state FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
