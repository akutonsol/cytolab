/**
 * Program 6 · Phase 6D — persisted-truth acceptance for explainability.
 *
 * Boots the REAL AppModule DI graph and drives the REAL ExplainabilityService, asserting persisted DATABASE truth
 * (no mocks): additive schema (2 enums + 4 tables), artifact-set hierarchy, immutable generation/artifact identity,
 * immutable attachment to InferenceRecord, every provenance FK ON DELETE RESTRICT, coordinate-space provenance
 * (Guardrail 1), probability normalization (Σ=1±tol), region validation, deterministic generation, append-only
 * regeneration (new identities, prior untouched), validation-only inheritance, SUCCEEDED-only eligibility,
 * no-support-inference, absence of prohibited semantic + PHI columns, digest/reference-only storage, permission
 * separation + no default grant, no mutation route, and Program-5/6A/6B/6C non-regression. Exits non-zero on any
 * failed assertion. (Focused tests + strict TypeScript run as separate gate steps.)
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
  const fixturesPath = process.env.EXPLAINABILITY_FIXTURES_OUT ? path.resolve(process.env.EXPLAINABILITY_FIXTURES_OUT) : path.resolve(__dirname, '../../web/acceptance/.explainability-fixtures.json');
  const fx = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
  const prisma = new PrismaClient();
  const fails: string[] = [];
  const ck = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };
  const threw = async (fn: () => Promise<unknown>) => { try { await fn(); return false; } catch { return true; } };

  /* eslint-disable @typescript-eslint/no-var-requires */
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../src/app.module');
  const { ExplainabilityService } = require('../src/modules/explainability/explainability.service');
  const { ExplainabilityController } = require('../src/modules/explainability/explainability.controller');
  const { validateProbabilityDistribution } = require('../src/modules/explainability/explainability-artifact');
  const { PrismaService } = require('../src/database/prisma.service');
  const { AuditRecorder } = require('../src/modules/audit/audit-recorder.service');
  const { LabContext } = require('../src/common/tenancy/lab-context');
  const { PERMISSIONS_KEY } = require('../src/common/decorators/require-permissions.decorator');
  /* eslint-enable @typescript-eslint/no-var-requires */

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const svc = app.get(ExplainabilityService);
    const prismaSvc = app.get(PrismaService);
    const audit = app.get(AuditRecorder);
    const lab = app.get(LabContext);
    const asA = <T>(fn: () => Promise<T>) => lab.runLabScoped(fx.labAId, fn) as Promise<T>;
    const models = ['ExplainabilityGeneration', 'ExplainabilityArtifact', 'ExplainabilityRegion', 'ExplainabilityProbability'];

    // ── (schema) tables + enums ─────────────────────────────────────────────────────────────────────────────
    const tableRows = (await prisma.$queryRawUnsafe(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1::text[])`, models)) as Array<{ table_name: string }>;
    ck(tableRows.length === 4, `all 4 explainability tables exist (got ${tableRows.length})`);
    const enumRows = (await prisma.$queryRawUnsafe(`SELECT typname FROM pg_type WHERE typtype='e' AND typname = ANY($1::text[])`, ['ExplainabilityArtifactKind', 'ExplainabilityRegionType'])) as Array<{ typname: string }>;
    ck(enumRows.length === 2, `both explainability enums exist (got ${enumRows.length})`);

    // ── (FK RESTRICT) ───────────────────────────────────────────────────────────────────────────────────────
    const fks = (await prisma.$queryRawUnsafe(`SELECT conname, confdeltype::text AS d FROM pg_constraint WHERE contype='f' AND conname ~ '^(ExplainabilityGeneration|ExplainabilityArtifact|ExplainabilityRegion|ExplainabilityProbability)_.*_fkey$'`)) as Array<{ conname: string; d: string }>;
    ck(fks.length >= 11 && fks.every((r) => r.d === 'r'), `all 6D provenance FKs ON DELETE RESTRICT (${fks.length} FKs; non-RESTRICT: ${fks.filter((r) => r.d !== 'r').map((r) => r.conname).join(',') || 'none'})`);

    // ── (eligibility) SUCCEEDED only ────────────────────────────────────────────────────────────────────────
    ck(await threw(() => asA(() => svc.generate({ inferenceRecordId: fx.aFailedRecordId }))), 'FAILED inference record rejected');
    ck(await threw(() => asA(() => svc.generate({ inferenceRecordId: fx.aIncompleteRecordId }))), 'incomplete (no outcome) inference record rejected');

    // ── (cross-lab fail-closed) ─────────────────────────────────────────────────────────────────────────────
    ck(await threw(() => asA(() => svc.generate({ inferenceRecordId: fx.bSucceededRecordId }))), 'cross-lab inference record fails closed');

    // ── (atomic full set + hierarchy + coordinate-space + probability + region) ─────────────────────────────
    const gen = await asA(() => svc.generate({ inferenceRecordId: fx.aSucceededRecordId }));
    ck(!!gen.generationUuid && !!gen.eventId, 'generation has an immutable set identity (generationUuid + eventId)');
    ck(gen.coordinateSpace === `slide-pixel@${fx.slideWidth}x${fx.slideHeight}` && gen.slideWidthPx === fx.slideWidth && gen.slideHeightPx === fx.slideHeight, 'coordinate-space provenance snapshot recorded (Guardrail 1)');
    const artifacts = await prisma.explainabilityArtifact.findMany({ where: { generationId: gen.id } });
    ck(artifacts.length === 4 && artifacts.map((a) => a.kind).sort().join(',') === 'ATTENTION_OVERLAY,FEATURE_REGION,HEATMAP,PROBABILITY_DISTRIBUTION', `atomic full artifact set of 4 kinds (got ${artifacts.length})`);
    ck(artifacts.every((a) => a.generationId === gen.id && !!a.artifactUuid && !!a.contentDigest && /^[a-f0-9]{64}$/.test(a.contentDigest)), 'each artifact shares the set identity + carries a sha256 content digest');
    const fr = artifacts.find((a) => a.kind === 'FEATURE_REGION')!;
    ck(fr.coordinateSpace === `slide-pixel@${fx.slideWidth}x${fx.slideHeight}` && !!fr.slideId, 'geometry-bearing artifact carries coordinate-space + slide reference');
    const regions = await prisma.explainabilityRegion.findMany({ where: { artifactId: fr.id } });
    ck(regions.length > 0 && regions.every((r) => { const g = r.geometry as any; return g.x + g.w <= fx.slideWidth && g.y + g.h <= fx.slideHeight && /^region-/.test(r.categoryCode); }), 'feature regions are in-bounds + coded (no diagnosis)');
    const pd = artifacts.find((a) => a.kind === 'PROBABILITY_DISTRIBUTION')!;
    const probs = await prisma.explainabilityProbability.findMany({ where: { artifactId: pd.id } });
    ck(validateProbabilityDistribution(probs.map((p) => ({ classCode: p.classCode, value: p.value, ordinal: p.ordinal }))) === null, 'probability distribution is coded + sums to 1 ± tolerance');
    ck(artifacts.filter((a) => a.kind === 'HEATMAP' || a.kind === 'ATTENTION_OVERLAY').every((a) => /^stub:\/\/explain\//.test(a.contentRef ?? '')), 'heatmap/overlay carry an opaque reference — no raw bytes stored');

    // ── (validation-only inheritance) ───────────────────────────────────────────────────────────────────────
    const valGen = await asA(() => svc.generate({ inferenceRecordId: fx.aValidationOnlyRecordId }));
    ck(valGen.validationOnly === true, 'validation-only inherited on the generation');
    ck((await prisma.explainabilityArtifact.findMany({ where: { generationId: valGen.id } })).every((a) => a.validationOnly === true), 'validation-only inherited immutably on every artifact');

    // ── (deterministic content + append-only regeneration with NEW identities) ──────────────────────────────
    const gen2 = await asA(() => svc.generate({ inferenceRecordId: fx.aSucceededRecordId }));
    ck(gen2.generationUuid !== gen.generationUuid, 'regeneration creates a NEW generation identity');
    const digs = async (gid: string) => (await prisma.explainabilityArtifact.findMany({ where: { generationId: gid }, select: { kind: true, contentDigest: true } })).map((a) => `${a.kind}:${a.contentDigest}`).sort();
    ck(JSON.stringify(await digs(gen.id)) === JSON.stringify(await digs(gen2.id)), 'deterministic: identical content digests across regenerations');
    ck((await prisma.explainabilityGeneration.count({ where: { inferenceRecordId: fx.aSucceededRecordId } })) === 2, 'append-only: both generation sets retained (prior untouched)');

    // ── (atomicity — invalid generator output persists NOTHING) ─────────────────────────────────────────────
    const badGen = { generatorId: 'bad', generatorVersion: '0.0.0', generate: async () => [{ kind: 'PROBABILITY_DISTRIBUTION', contentDigest: 'a'.repeat(64), contentRef: null, probabilities: [{ classCode: 'x', value: 2, ordinal: 0 }] }] };
    const badSvc = new ExplainabilityService(prismaSvc, audit, badGen);
    const before = await prisma.explainabilityGeneration.count({ where: { inferenceRecordId: fx.aValidationOnlyRecordId } });
    ck(await threw(() => asA(() => badSvc.generate({ inferenceRecordId: fx.aValidationOnlyRecordId }))), 'invalid generator output is rejected');
    ck((await prisma.explainabilityGeneration.count({ where: { inferenceRecordId: fx.aValidationOnlyRecordId } })) === before, 'atomicity: invalid generation persisted NOTHING (all-or-nothing)');

    // ── (no support inference — InferenceRecord never mutated) ───────────────────────────────────────────────
    const recBefore = await prisma.inferenceRecord.findUnique({ where: { id: fx.aSucceededRecordId } });
    await asA(() => svc.generate({ inferenceRecordId: fx.aSucceededRecordId }));
    const recAfter = await prisma.inferenceRecord.findUnique({ where: { id: fx.aSucceededRecordId } });
    ck(JSON.stringify(recBefore) === JSON.stringify(recAfter), 'no support inference: the InferenceRecord is byte-identical before/after generation');

    // ── (no prohibited semantic columns; no PHI; digest/reference-only) ─────────────────────────────────────
    const phi = /patient|birth|\bdob\b|ssn|mrn|firstname|lastname|demographic|address|phone/i;
    const forbidden = /diagnos|disease|malign|benign|\bgrade\b|bethesda|correct|accuracy|clinicalConfidence|groundTruth|validated|approvedInterpretation/i;
    for (const m of models) {
      const fields = Prisma.dmmf.datamodel.models.find((x) => x.name === m)!.fields;
      ck(fields.map((f) => f.name).filter((f) => phi.test(f)).length === 0, `${m} has no PHI-bearing column`);
      ck(fields.map((f) => f.name).filter((f) => forbidden.test(f)).length === 0, `${m} has no diagnostic/correctness/accuracy/ground-truth column`);
    }

    // ── (permission separation + no default grant + no mutation route) ──────────────────────────────────────
    const perms = await prisma.permission.findMany({ where: { code: { in: ['explainability:view', 'explainability:generate', 'explainability:manage'] } }, select: { code: true } });
    ck(perms.length === 3, `catalogue has explainability:view/generate/manage (got [${perms.map((p) => p.code).join(',')}])`);
    const roles = await prisma.role.findMany({ include: { permissions: { include: { permission: true } } } });
    const leaks = roles.filter((r) => !r.isSuperRole).filter((r) => r.permissions.some((rp) => rp.permission.code.startsWith('explainability:')));
    ck(leaks.length === 0, `no default (non-super) role holds explainability:* (offenders: [${leaks.map((r) => r.name).join(',')}])`);
    ck(JSON.stringify(Reflect.getMetadata(PERMISSIONS_KEY, (ExplainabilityController.prototype as any).generate)) === JSON.stringify(['explainability:generate']), 'generate route requires explainability:generate');
    ck(JSON.stringify(Reflect.getMetadata(PERMISSIONS_KEY, (ExplainabilityController.prototype as any).listGenerations)) === JSON.stringify(['explainability:view']), 'list route requires explainability:view');
    const routes = Object.getOwnPropertyNames(ExplainabilityController.prototype).filter((n) => n !== 'constructor');
    ck(!routes.some((n) => /update|edit|delete|patch|overwrite/i.test(n)), 'no artifact-mutation route exists (artifacts immutable)');
    ck(!(svc.updateArtifact || svc.editGeneration || svc.deleteArtifact), 'no service rewrite path for artifacts');

    // ── (Program-5 / 6A / 6B / 6C structural non-regression) ────────────────────────────────────────────────
    for (const m of ['DigitalSlide', 'SlideAnnotation', 'Record', 'Patient', 'AiModelVersion', 'InferenceRecord', 'InferenceJob', 'Dataset', 'GroundTruthLabel']) {
      ck(!!Prisma.dmmf.datamodel.models.find((x) => x.name === m), `neighbour model ${m} still present (non-regression)`);
    }
    // ground truth + viewer annotation remain distinct from explainability regions
    const region = Prisma.dmmf.datamodel.models.find((x) => x.name === 'ExplainabilityRegion')!.fields.map((f) => f.name);
    ck(!region.some((f) => /label|groundTruth/i.test(f)), 'ExplainabilityRegion is distinct from SlideAnnotation/GroundTruthLabel (coded categories only)');

    if (fails.length) {
      console.error('EXPLAINABILITY ACCEPTANCE FAILURES:\n - ' + fails.join('\n - '));
      process.exit(1);
    }
    console.log(`P6-6D explainability: tables=${tableRows.length} enums=${enumRows.length} provenanceFKs=${fks.length}(all RESTRICT) artifacts=4/set coordinate-space=verified probabilities=Σ1 regions=in-bounds determinism=verified append-only=verified no-support-inference=verified`);
    console.log('P6-6D EXPLAINABILITY ACCEPTANCE: all persisted-truth assertions passed (schema + RESTRICT-FKs + artifact-set-hierarchy + immutable-identity + eligibility + validation-only-inheritance + coordinate-space-provenance + probability-normalization + region-validation + deterministic-generation + append-only-regeneration + atomic-all-or-nothing + no-support-inference + no-prohibited-semantic-columns + no-PHI + digest/reference-only + permission-separation/no-default-grant + no-mutation-route + Program-5/6A/6B/6C-non-regression).');
  } finally {
    await app.close().catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('assert-explainability-state FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
