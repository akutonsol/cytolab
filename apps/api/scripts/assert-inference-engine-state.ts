/**
 * Program 6 · Phase 6C — persisted-truth acceptance for the inference execution engine.
 *
 * Boots the REAL AppModule DI graph and drives the REAL InferenceEngineService, asserting persisted DATABASE truth
 * (no mocks): additive schema (2 tables + 2 enums + additively-extended InferenceRecord), the raw-SQL active-job
 * partial unique index (tuple + predicate), every provenance FK ON DELETE RESTRICT, preserved 6A-era columns,
 * no PHI, model eligibility (VALIDATION/APPROVED only), immutable validation-only provenance, active-job
 * idempotency + freeing after terminalization, lab tenancy + cross-lab fail-closed, immutable single-write
 * evidence + append-only audit, deterministic adapter output + immutable config digest, digest/reference result
 * boundary, adapter-failure isolation (recorded, never thrown), reclaim → TIMED_OUT with no retry, permission
 * separation + no default grant, worker disabled by default, and no dataset/automatic/clinical coupling. Exits
 * non-zero on any failed assertion. (Focused tests + strict TypeScript run as separate gate steps.)
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { PrismaClient, Prisma } from '@prisma/client';

function assertIsolatedAcceptanceDb(): void {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required (isolated acceptance/test database).');
  const name = new URL(url).pathname.replace(/^\//, '');
  if (name === 'cytolab' || !/(test|accept)/i.test(name)) throw new Error(`Refusing "${name}": not an isolated acceptance DB.`);
}

async function main() {
  assertIsolatedAcceptanceDb();
  const fixturesPath = process.env.INFERENCE_FIXTURES_OUT ? path.resolve(process.env.INFERENCE_FIXTURES_OUT) : path.resolve(__dirname, '../../web/acceptance/.inference-engine-fixtures.json');
  const fx = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
  const prisma = new PrismaClient();
  const fails: string[] = [];
  const ck = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };
  const threw = async (fn: () => Promise<unknown>) => { try { await fn(); return false; } catch { return true; } };

  /* eslint-disable @typescript-eslint/no-var-requires */
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../src/app.module');
  const { InferenceEngineService } = require('../src/modules/inference-engine/inference-engine.service');
  const { InferenceLeaseService } = require('../src/modules/inference-engine/inference-lease.service');
  const { InferenceEngineController } = require('../src/modules/inference-engine/inference-engine.controller');
  const { StubInferenceAdapter } = require('../src/modules/inference-engine/inference-adapter');
  const { loadInferenceConfig } = require('../src/modules/inference-engine/inference-config');
  const { PrismaService } = require('../src/database/prisma.service');
  const { AuditRecorder } = require('../src/modules/audit/audit-recorder.service');
  const { LabContext } = require('../src/common/tenancy/lab-context');
  const { PERMISSIONS_KEY } = require('../src/common/decorators/require-permissions.decorator');
  /* eslint-enable @typescript-eslint/no-var-requires */

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const svc = app.get(InferenceEngineService);
    const lease = app.get(InferenceLeaseService);
    const prismaSvc = app.get(PrismaService);
    const audit = app.get(AuditRecorder);
    const lab = app.get(LabContext);
    const asA = <T>(fn: () => Promise<T>) => lab.runLabScoped(fx.labAId, fn) as Promise<T>;
    const digest = (s: string) => createHash('sha256').update(s).digest('hex');

    // ── (schema) new tables + enums + additively-extended record ────────────────────────────────────────────
    const tableRows = (await prisma.$queryRawUnsafe(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1::text[])`, ['InferenceJob', 'InferenceEvent'])) as Array<{ table_name: string }>;
    ck(tableRows.length === 2, `both 6C tables exist (got ${tableRows.length})`);
    const enumRows = (await prisma.$queryRawUnsafe(`SELECT typname FROM pg_type WHERE typtype='e' AND typname = ANY($1::text[])`, ['InferenceJobStatus', 'InferenceOutcome'])) as Array<{ typname: string }>;
    ck(enumRows.length === 2, `both 6C enums exist (got ${enumRows.length})`);
    const recFields = Prisma.dmmf.datamodel.models.find((x) => x.name === 'InferenceRecord')!.fields.map((f) => f.name);
    for (const f of ['id', 'recordUuid', 'labId', 'modelVersionId', 'subjectSlideId', 'inputDigest', 'requestedAt', 'createdAt']) ck(recFields.includes(f), `6A-era InferenceRecord column preserved: ${f}`);
    for (const f of ['jobId', 'adapterId', 'adapterVersion', 'engineVersion', 'configDigest', 'modelLifecycleStateAtRun', 'validationOnly', 'outcome', 'resultDigest', 'resultRef', 'startedAt', 'finishedAt', 'durationMs']) ck(recFields.includes(f), `6C additive evidence column present: ${f}`);

    // ── (raw partial unique index) existence + tuple + predicate ─────────────────────────────────────────────
    const idx = (await prisma.$queryRawUnsafe(`SELECT indexdef FROM pg_indexes WHERE indexname='InferenceJob_active_subject_input_key'`)) as Array<{ indexdef: string }>;
    ck(idx.length === 1, 'active-job partial unique index exists (raw migration-only invariant installed by the gate)');
    const def = idx[0]?.indexdef ?? '';
    ck(/UNIQUE INDEX/i.test(def), 'active-job index is UNIQUE');
    ck(/"modelVersionId"/.test(def) && /COALESCE\("subjectSlideId",\s*''[^)]*\)/i.test(def) && /"inputDigest"/.test(def), `index tuple = (modelVersionId, COALESCE(subjectSlideId,''), inputDigest) [def: ${def}]`);
    ck(/WHERE\b/i.test(def) && /QUEUED/.test(def) && /RUNNING/.test(def) && !/SUCCEEDED|FAILED|TIMED_OUT/.test(def), 'index predicate limited to QUEUED/RUNNING');

    // ── (FK RESTRICT) every 6C provenance FK is ON DELETE RESTRICT ───────────────────────────────────────────
    const fks = (await prisma.$queryRawUnsafe(`SELECT conname, confdeltype::text AS d FROM pg_constraint WHERE contype='f' AND conname ~ '^(InferenceJob|InferenceEvent|InferenceRecord)_.*_fkey$'`)) as Array<{ conname: string; d: string }>;
    ck(fks.length >= 6 && fks.every((r) => r.d === 'r'), `all 6C provenance FKs ON DELETE RESTRICT (${fks.length} FKs; non-RESTRICT: ${fks.filter((r) => r.d !== 'r').map((r) => r.conname).join(',') || 'none'})`);

    // ── (eligibility) DRAFT/DEPRECATED/RETIRED rejected; VALIDATION/APPROVED allowed ─────────────────────────
    for (const s of ['draft', 'deprecated', 'retired'] as const) {
      ck(await threw(() => asA(() => svc.dispatch({ modelVersionId: fx.versions[s], inputRef: `r-${s}` }))), `${s} model version rejected for inference`);
    }
    const valJob = await asA(() => svc.dispatch({ modelVersionId: fx.versions.validation, inputRef: 'r-val' }));
    const appJob = await asA(() => svc.dispatch({ modelVersionId: fx.versions.approved, subjectSlideId: fx.aSlideIds[0], inputRef: 'r-app', config: { threshold: 0.5, mode: 'demo' } }));
    ck(!!valJob && !!appJob, 'VALIDATION and APPROVED dispatch accepted');

    // ── (cross-lab fail-closed) ─────────────────────────────────────────────────────────────────────────────
    ck(await threw(() => asA(() => svc.getJob(fx.bApprovedVersionId))), 'cross-lab getJob fails closed (unknown id)');
    ck(await threw(() => asA(() => svc.dispatch({ modelVersionId: fx.bApprovedVersionId, inputRef: 'x' }))), 'dispatch of a cross-lab model version fails closed');
    ck(await threw(() => asA(() => svc.dispatch({ modelVersionId: fx.versions.approved, subjectSlideId: fx.bSlideId, inputRef: 'x2' }))), 'dispatch referencing a cross-lab slide fails closed');

    // ── (idempotency) one active inference per (version, subject, input) ─────────────────────────────────────
    ck(await threw(() => asA(() => svc.dispatch({ modelVersionId: fx.versions.approved, subjectSlideId: fx.aSlideIds[0], inputRef: 'r-app', config: { threshold: 0.5, mode: 'demo' } }))), 'duplicate active dispatch rejected (partial-unique idempotency)');

    // ── (execute) drain → immutable evidence once + append-only event + deterministic contract ──────────────
    const cfgDigestBefore = (await prisma.inferenceJob.findUnique({ where: { id: appJob.id }, select: { configDigest: true } }))?.configDigest;
    await svc.drain('acc-w1'); // system path: process my queued jobs (approved + validation)
    const appRow = await prisma.inferenceJob.findUnique({ where: { id: appJob.id } });
    ck(appRow?.status === 'SUCCEEDED' && !!appRow?.finishedAt && appRow?.leaseExpiresAt === null, 'approved job terminalised SUCCEEDED, lease released');
    const recs = await prisma.inferenceRecord.findMany({ where: { jobId: appJob.id } });
    ck(recs.length === 1, `immutable InferenceRecord written EXACTLY once (got ${recs.length})`);
    const rec = recs[0];
    ck(rec?.adapterId === 'stub' && rec?.adapterVersion === '1.0.0' && /^6c\./.test(rec?.engineVersion ?? ''), 'deterministic contract: adapterId/adapterVersion/engineVersion recorded');
    ck(!!rec?.configDigest && /^[a-f0-9]{64}$/.test(rec.configDigest) && rec.configDigest === cfgDigestBefore, 'immutable config digest recorded on the evidence (Guardrail 1)');
    ck(rec?.modelLifecycleStateAtRun === 'APPROVED' && rec?.validationOnly === false, 'APPROVED run: eligibility provenance recorded, not validation-only');
    ck(/^[a-f0-9]{64}$/.test(rec?.resultDigest ?? '') && /^stub:\/\/inference\//.test(rec?.resultRef ?? ''), 'result is digest + opaque reference only (no bytes/PHI/diagnosis)');
    ck((rec?.durationMs ?? 0) >= 0 && !!rec?.startedAt && !!rec?.finishedAt, 'timing captured (startedAt/finishedAt/durationMs)');
    // deterministic adapter: recomputing the stub over the same (version,input,config) yields the same digest (Guardrail 2)
    const restated = await new StubInferenceAdapter().execute({ modelVersionId: rec!.modelVersionId, inputDigest: rec!.inputDigest, configDigest: rec!.configDigest });
    ck(restated.resultDigest === rec?.resultDigest, 'stub adapter is deterministic (identical version+input+config → identical digest)');
    const evs = await prisma.inferenceEvent.findMany({ where: { jobId: appJob.id } });
    ck(evs.length === 1 && evs[0].toStatus === 'SUCCEEDED' && evs[0].fromStatus === 'RUNNING' && !!evs[0].eventId, 'append-only event: exactly one terminal transition with an eventId');

    // ── (validation-only provenance is immutable) ───────────────────────────────────────────────────────────
    const valRec = await prisma.inferenceRecord.findFirst({ where: { jobId: valJob.id } });
    ck(valRec?.validationOnly === true && valRec?.modelLifecycleStateAtRun === 'VALIDATION', 'VALIDATION run recorded validation-only (immutable provenance)');

    // ── (idempotency frees after terminalization) + immutable config digest stable across re-dispatch ────────
    const appJob2 = await asA(() => svc.dispatch({ modelVersionId: fx.versions.approved, subjectSlideId: fx.aSlideIds[0], inputRef: 'r-app', config: { mode: 'demo', threshold: 0.5 } }));
    ck(appJob2.id !== appJob.id, 're-dispatch of the same tuple is permitted after terminalization');
    ck(appJob2.configDigest === cfgDigestBefore, 'config digest is deterministic regardless of key order (immutable/stable)');
    await svc.drain('acc-w1');
    ck((await prisma.inferenceRecord.count({ where: { subjectSlideId: fx.aSlideIds[0] } })) === 2, 'a distinct second immutable record exists for the re-dispatched tuple');

    // ── (failure isolation) throwing adapter → FAILED evidence, never thrown ─────────────────────────────────
    const throwing = { adapterId: 'boom', adapterVersion: '9.9.9', execute: async () => { throw new Error('adapter exploded'); } };
    const failSvc = new InferenceEngineService(prismaSvc, audit, lease, throwing);
    const failJob = await asA(() => failSvc.dispatch({ modelVersionId: fx.versions.approved, subjectSlideId: fx.aSlideIds[1], inputRef: 'r-fail' }));
    const failOutcomes = await failSvc.drain('acc-fail'); // must NOT throw
    ck(failOutcomes.find((o: { jobId: string; outcome: string }) => o.jobId === failJob.id)?.outcome === 'FAILED', 'adapter failure terminalises as FAILED without escaping');
    const failRec = await prisma.inferenceRecord.findFirst({ where: { jobId: failJob.id } });
    ck(failRec?.outcome === 'FAILED' && failRec?.resultDigest === null, 'FAILED evidence recorded with no result digest');
    ck((await prisma.inferenceJob.findUnique({ where: { id: failJob.id }, select: { errorCode: true } }))?.errorCode === 'ADAPTER_ERROR', 'FAILED job carries a stable error code (no PHI)');
    ck((await prisma.inferenceEvent.count({ where: { jobId: failJob.id, toStatus: 'FAILED' } })) === 1, 'one append-only FAILED transition event');

    // ── (reclaim) expired RUNNING lease → TIMED_OUT, no retry (manual dispatch only) ─────────────────────────
    const stuck = await asA(() => svc.dispatch({ modelVersionId: fx.versions.approved, subjectSlideId: fx.aSlideIds[2], inputRef: 'r-stuck' }));
    await prisma.$executeRawUnsafe(`UPDATE "InferenceJob" SET status='RUNNING', "workerId"='dead', "startedAt"=now(), "leaseExpiresAt"=now() - interval '1 minute' WHERE id=$1`, stuck.id);
    const labJobsBefore = await prisma.inferenceJob.count({ where: { labId: fx.labAId } });
    const reclaimed = await svc.reclaimExpired();
    ck(reclaimed >= 1 && (await prisma.inferenceJob.findUnique({ where: { id: stuck.id }, select: { status: true } }))?.status === 'TIMED_OUT', 'expired RUNNING lease reclaimed → TIMED_OUT');
    ck((await prisma.inferenceJob.count({ where: { labId: fx.labAId } })) === labJobsBefore, 'reclaim enqueues NO retry (manual dispatch only)');

    // ── (immutability / no rewrite path) ────────────────────────────────────────────────────────────────────
    ck(!(svc.updateRecord || svc.setResult || svc.editRecord || svc.updateJob), 'no service path rewrites the immutable record');

    // ── (no PHI + no dataset/automatic/clinical coupling) ────────────────────────────────────────────────────
    const phi = /patient|birth|\bdob\b|ssn|mrn|firstname|lastname|demographic|address|phone/i;
    for (const m of ['InferenceJob', 'InferenceEvent', 'InferenceRecord']) {
      const fields = Prisma.dmmf.datamodel.models.find((x) => x.name === m)!.fields;
      ck(fields.map((f) => f.name).filter((f) => phi.test(f)).length === 0, `${m} has no PHI-bearing column`);
      ck(!fields.some((f) => ['Dataset', 'DatasetVersion', 'DatasetSlide', 'GroundTruthLabel'].includes(f.type) || /dataset/i.test(f.name)), `${m} has no dataset coupling (dataset-driven inference is 6F, not 6C)`);
      ck(!fields.some((f) => /diagnos|disease|malign|benign|grade|bethesda|confidence|probab/i.test(f.name)), `${m} carries no diagnostic/clinical field`);
    }

    // ── (permission separation + no default grant) ──────────────────────────────────────────────────────────
    const perms = await prisma.permission.findMany({ where: { code: { in: ['inference:view', 'inference:run', 'inference:manage'] } }, select: { code: true } });
    ck(perms.length === 3, `catalogue has inference:view/run/manage (got [${perms.map((p) => p.code).join(',')}])`);
    const roles = await prisma.role.findMany({ include: { permissions: { include: { permission: true } } } });
    const leaks = roles.filter((r) => !r.isSuperRole).filter((r) => r.permissions.some((rp) => rp.permission.code.startsWith('inference:')));
    ck(leaks.length === 0, `no default (non-super) role holds inference:* (offenders: [${leaks.map((r) => r.name).join(',')}])`);
    ck(JSON.stringify(Reflect.getMetadata(PERMISSIONS_KEY, (InferenceEngineController.prototype as any).dispatch)) === JSON.stringify(['inference:run']), 'dispatch route requires inference:run');
    ck(JSON.stringify(Reflect.getMetadata(PERMISSIONS_KEY, (InferenceEngineController.prototype as any).drain)) === JSON.stringify(['inference:manage']), 'drain route requires inference:manage (distinct from run)');
    ck(JSON.stringify(Reflect.getMetadata(PERMISSIONS_KEY, (InferenceEngineController.prototype as any).listJobs)) === JSON.stringify(['inference:view']), 'list route requires inference:view');

    // ── (worker disabled by default; never under test) ──────────────────────────────────────────────────────
    ck(loadInferenceConfig({}).workerEnabled === false, 'background worker disabled by default');
    ck(loadInferenceConfig({ AI_INFERENCE_WORKER: 'true', NODE_ENV: 'test' }).workerEnabled === false, 'background worker never enabled under test');

    // ── (Program-5 / 6A / 6B structural non-regression) ─────────────────────────────────────────────────────
    for (const m of ['DigitalSlide', 'Record', 'Patient', 'Specimen', 'AiModel', 'AiModelVersion', 'AiModelLifecycleEvent', 'Dataset', 'DatasetVersion', 'SlideAnnotation']) {
      ck(!!Prisma.dmmf.datamodel.models.find((x) => x.name === m), `neighbour model ${m} still present (non-regression)`);
    }

    if (fails.length) {
      console.error('INFERENCE-ENGINE ACCEPTANCE FAILURES:\n - ' + fails.join('\n - '));
      process.exit(1);
    }
    console.log(`P6-6C inference: tables=${tableRows.length} enums=${enumRows.length} provenanceFKs=${fks.length}(all RESTRICT) partial-unique-index=verified records(APPROVED=1,VALIDATION validation-only,FAILED no-result) reclaim=TIMED_OUT(no-retry)`);
    console.log('P6-6C INFERENCE ENGINE ACCEPTANCE: all persisted-truth assertions passed (schema + raw-partial-index + RESTRICT-FKs + 6A-columns-preserved + eligibility + validation-only-provenance + idempotency + tenancy/cross-lab-fail-closed + immutable-record-once + append-only-events + deterministic-adapter + immutable-config-digest + digest/reference-results + failure-isolation + reclaim-no-retry + permission-separation/no-default-grant + worker-disabled + no-dataset/clinical-coupling + Program-5/6A/6B-non-regression).');
  } finally {
    await app.close().catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('assert-inference-engine-state FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
