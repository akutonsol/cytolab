/**
 * Program 6 · Phase 6B — persisted-truth acceptance for dataset governance.
 *
 * Boots the REAL AppModule DI graph and drives the REAL DatasetGovernanceService lab-scoped, asserting persisted
 * DATABASE truth (no mocks): additive schema integrity (6 tables + 5 enums), every provenance FK ON DELETE
 * RESTRICT, lab tenancy + cross-lab fail-closed, dataset-kind enforcement, pointer-only training references,
 * DRAFT→FROZEN compare-and-set + frozen immutability + correction-as-new-version, structured ground-truth labels
 * with append-only lineage, immutable purpose provenance, no PHI-bearing columns, no model-version linkage,
 * permission separation + no default grant, and Program-5/6A structural non-regression. Exits non-zero on any
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
  const fixturesPath = process.env.DATASET_FIXTURES_OUT ? path.resolve(process.env.DATASET_FIXTURES_OUT) : path.resolve(__dirname, '../../web/acceptance/.dataset-governance-fixtures.json');
  const fx = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
  const prisma = new PrismaClient();
  const fails: string[] = [];
  const ck = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };
  const threw = async (fn: () => Promise<unknown>) => { try { await fn(); return false; } catch { return true; } };

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { NestFactory } = require('@nestjs/core');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { AppModule } = require('../src/app.module');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { DatasetGovernanceService } = require('../src/modules/dataset-governance/dataset-governance.service');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { DatasetGovernanceController } = require('../src/modules/dataset-governance/dataset-governance.controller');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { LabContext } = require('../src/common/tenancy/lab-context');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PERMISSIONS_KEY } = require('../src/common/decorators/require-permissions.decorator');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const svc = app.get(DatasetGovernanceService);
    const lab = app.get(LabContext);
    const asA = <T>(fn: () => Promise<T>) => lab.runLabScoped(fx.labAId, fn) as Promise<T>;
    const asB = <T>(fn: () => Promise<T>) => lab.runLabScoped(fx.labBId, fn) as Promise<T>;
    const models = ['Dataset', 'DatasetVersion', 'DatasetSlide', 'GroundTruthLabel', 'AnnotationLineageEvent', 'TrainingDatasetReference'];
    const enums = ['DatasetKind', 'DatasetVersionState', 'DatasetPurpose', 'DatasetSlideMembership', 'AnnotationMethod'];

    // (schema) 6 governed tables + 5 enums exist (additive schema integrity).
    const tableRows = (await prisma.$queryRawUnsafe(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1::text[])`, models)) as Array<{ table_name: string }>;
    ck(tableRows.length === 6, `all 6 governed tables exist (got ${tableRows.length})`);
    const enumRows = (await prisma.$queryRawUnsafe(`SELECT typname FROM pg_type WHERE typtype='e' AND typname = ANY($1::text[])`, enums)) as Array<{ typname: string }>;
    ck(enumRows.length === 5, `all 5 governed enums exist (got ${enumRows.length})`);
    ck(models.every((m) => Prisma.dmmf.datamodel.models.find((x) => x.name === m)), 'all 6 governed models present in the datamodel');

    // (FK RESTRICT) every 6B provenance FK is ON DELETE RESTRICT.
    const fks = (await prisma.$queryRawUnsafe(`SELECT conname, confdeltype::text AS d FROM pg_constraint WHERE contype='f' AND conname ~ '^(Dataset|DatasetVersion|DatasetSlide|GroundTruthLabel|AnnotationLineageEvent|TrainingDatasetReference)_.*_fkey$'`)) as Array<{ conname: string; d: string }>;
    ck(fks.length >= 14 && fks.every((r) => r.d === 'r'), `all 6B provenance FKs ON DELETE RESTRICT (${fks.length} FKs; non-RESTRICT: ${fks.filter((r) => r.d !== 'r').map((r) => r.conname).join(',') || 'none'})`);

    // (tenancy + cross-lab fail-closed)
    const d = await asA(() => svc.createDataset({ key: 'val-set', displayName: 'Val A', kind: 'VALIDATION' }, 'op-a'));
    ck(await threw(() => asB(() => svc.getDataset(d.id))), 'cross-lab getDataset fails closed');
    ck((await prisma.dataset.findUnique({ where: { id: d.id }, select: { labId: true } }))?.labId === fx.labAId, 'dataset persisted under Lab A');
    const v = await asA(() => svc.createVersion(d.id, { purpose: 'ALGORITHM_VALIDATION' }, 'op-a'));
    ck(await threw(() => asA(() => svc.addSlide(v.id, { slideId: fx.bSlideId }))), 'cross-lab slide reference rejected (slide not in lab)');

    // (dataset-kind enforcement + pointer-only training references)
    const tref = await asA(() => svc.createDataset({ key: 'train-ref', displayName: 'T', kind: 'TRAINING_REFERENCE' }, 'op-a'));
    ck(await threw(() => asA(() => svc.createVersion(tref.id, { purpose: 'RESEARCH' }))), 'TRAINING_REFERENCE dataset rejects versions');
    ck(await threw(() => asA(() => svc.addTrainingReference(d.id, { descriptor: 'x', provenanceUri: 'ext://y' }))), 'VALIDATION dataset rejects training references');
    const ref = await asA(() => svc.addTrainingReference(tref.id, { descriptor: 'external corpus', provenanceUri: 'ext://corpus/x', contentDigest: 'a'.repeat(64) }));
    ck(!!ref && ref.provenanceUri === 'ext://corpus/x', 'training reference is a pointer (descriptor + uri + digest)');
    const trefFields = Prisma.dmmf.datamodel.models.find((x) => x.name === 'TrainingDatasetReference')!.fields.map((f) => f.name);
    ck(!trefFields.some((f) => /slide|label|bytes|pixel|image/i.test(f)), `training reference has no slide/label/bytes columns (fields: ${trefFields.join(',')})`);

    // (membership + structured labels + append-only lineage)
    await asA(() => svc.addSlide(v.id, { slideId: fx.aSlideIds[0], specimenId: fx.aSpecimenIds[0] }));
    ck(await threw(() => asA(() => svc.setLabel(v.id, { slideId: fx.aSlideIds[1], labelSchemaKey: 'dx', labelSchemaVersion: '1', labelValue: 'x' }))), 'label on a non-member slide rejected');
    await asA(() => svc.setLabel(v.id, { slideId: fx.aSlideIds[0], labelSchemaKey: 'dx', labelSchemaVersion: '1', labelValue: 'HSIL' }));
    await asA(() => svc.setLabel(v.id, { slideId: fx.aSlideIds[0], labelSchemaKey: 'dx', labelSchemaVersion: '1', labelValue: 'LSIL' }));
    const labels = await prisma.groundTruthLabel.findMany({ where: { datasetVersionId: v.id } });
    ck(labels.length === 1 && labels[0].labelValue === 'LSIL', `one label per (version,slide,schemaKey), latest value retained (got ${labels.length})`);
    const lineage = await prisma.annotationLineageEvent.count({ where: { groundTruthLabelId: labels[0]?.id } });
    ck(lineage === 2, `append-only lineage: one event per assertion (got ${lineage})`);

    // (DRAFT→FROZEN CAS + frozen immutability + correction-as-new-version)
    const frozen = await asA(() => svc.freezeVersion(v.id, 'op-a'));
    ck(frozen?.state === 'FROZEN' && !!frozen?.frozenAt && !!frozen?.manifestDigest, 'freeze → FROZEN + frozenAt + manifest digest');
    ck(await threw(() => asA(() => svc.addSlide(v.id, { slideId: fx.aSlideIds[2] }))), 'FROZEN version rejects new membership');
    ck(await threw(() => asA(() => svc.setLabel(v.id, { slideId: fx.aSlideIds[0], labelSchemaKey: 'dx', labelSchemaVersion: '1', labelValue: 'ASCUS' }))), 'FROZEN version rejects label edits');
    ck(await threw(() => asA(() => svc.freezeVersion(v.id))), 'FROZEN version cannot be re-frozen (terminal)');
    const v2 = await asA(() => svc.createVersion(d.id, { purpose: 'ALGORITHM_VALIDATION' }, 'op-a'));
    ck(v2.versionNumber === 2 && v2.state === 'DRAFT', 'correction is a NEW DRAFT version (v2)');
    // concurrent freeze → exactly one winner
    await asA(() => svc.addSlide(v2.id, { slideId: fx.aSlideIds[1] }));
    const race = await Promise.allSettled([asA(() => svc.freezeVersion(v2.id)), asA(() => svc.freezeVersion(v2.id))]);
    ck(race.filter((r) => r.status === 'fulfilled').length === 1, `concurrent freeze: exactly one winner (got ${race.filter((r) => r.status === 'fulfilled').length})`);

    // (immutable purpose; no rewrite path)
    ck(v.purpose === 'ALGORITHM_VALIDATION', 'version records an immutable purpose');
    ck(!(svc.updateVersion || svc.setPurpose || svc.editVersion), 'no service path rewrites a version / its purpose');

    // (no PHI columns; no model-version linkage)
    const phi = /patient|birth|\bdob\b|ssn|mrn|firstname|lastname|demographic|address|phone/i;
    for (const m of models) {
      const fields = Prisma.dmmf.datamodel.models.find((x) => x.name === m)!.fields;
      ck(fields.map((f) => f.name).filter((f) => phi.test(f)).length === 0, `${m} has no PHI-bearing column`);
      ck(!fields.some((f) => ['AiModel', 'AiModelVersion', 'InferenceRecord'].includes(f.type)), `${m} has no 6A model-version linkage (deferred to 6F)`);
    }

    // (permission separation + no default grant)
    const perms = await prisma.permission.findMany({ where: { code: { in: ['dataset:view', 'dataset:manage', 'dataset:freeze'] } }, select: { code: true } });
    ck(perms.length === 3, `catalogue has dataset:view/manage/freeze (got [${perms.map((p) => p.code).join(',')}])`);
    const roles = await prisma.role.findMany({ include: { permissions: { include: { permission: true } } } });
    const leaks = roles.filter((r) => !r.isSuperRole).filter((r) => r.permissions.some((rp) => rp.permission.code.startsWith('dataset:')));
    ck(leaks.length === 0, `no default (non-super) role holds dataset:* (offenders: [${leaks.map((r) => r.name).join(',')}])`);
    ck(JSON.stringify(Reflect.getMetadata(PERMISSIONS_KEY, (DatasetGovernanceController.prototype as any).freezeVersion)) === JSON.stringify(['dataset:freeze']), 'freeze route requires dataset:freeze');
    ck(JSON.stringify(Reflect.getMetadata(PERMISSIONS_KEY, (DatasetGovernanceController.prototype as any).createDataset)) === JSON.stringify(['dataset:manage']), 'create route requires dataset:manage (distinct from freeze)');

    // (Program-5 / 6A structural non-regression) — neighbours present + ground truth distinct from viewer annotation.
    for (const m of ['DigitalSlide', 'SlideAnnotation', 'Record', 'Patient', 'Specimen', 'AiModel', 'AiModelVersion', 'InferenceRecord']) {
      ck(!!Prisma.dmmf.datamodel.models.find((x) => x.name === m), `neighbour model ${m} still present (non-regression)`);
    }
    const ann = Prisma.dmmf.datamodel.models.find((x) => x.name === 'SlideAnnotation')!.fields.map((f) => f.name);
    ck(ann.includes('x') && ann.includes('y') && ann.includes('color') && !ann.some((f) => /labelSchema|groundTruth/i.test(f)), 'SlideAnnotation remains a viewer annotation, distinct from ground truth');

    if (fails.length) {
      console.error('DATASET-GOVERNANCE ACCEPTANCE FAILURES:\n - ' + fails.join('\n - '));
      process.exit(1);
    }
    console.log(`P6-6B datasets: tables=${tableRows.length} enums=${enumRows.length} provenanceFKs=${fks.length}(all RESTRICT) labels=1 lineage=2 versions=2(v1 FROZEN, v2 DRAFT)`);
    console.log('P6-6B DATASET GOVERNANCE ACCEPTANCE: all persisted-truth assertions passed (schema + RESTRICT-FKs + tenancy + cross-lab-fail-closed + kind-enforcement + pointer-only-training + DRAFT→FROZEN-CAS + frozen-immutability + correction-new-version + structured-labels + append-only-lineage + immutable-purpose + no-PHI + no-model-linkage + permission-separation + no-default-grant + Program-5/6A-non-regression).');
  } finally {
    await app.close().catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('assert-dataset-governance-state FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
