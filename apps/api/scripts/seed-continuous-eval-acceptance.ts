/**
 * Program 6 · Phase 6G — isolated fixtures for the continuous-evaluation acceptance gate.
 *
 * Seeds two labs, each with: AI model versions across the lifecycle (APPROVED/VALIDATION/DEPRECATED/DRAFT/RETIRED),
 * InferenceRecords over a known time window (with outcomes + durationMs + validationOnly cohorts), and a same-model-
 * version 6F ValidationRun baseline (+ a foreign-model baseline), so the assertion can exercise eligibility,
 * membership snapshot, cohort separation, observed/synthetic/unavailable provenance, empty/sparse windows, baseline
 * compatibility, determinism, atomicity, advisory recommendations, and cross-lab fail-closed. No PHI is copied into
 * any 6G table. Guarded to refuse a non-isolated database.
 */
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient, AiModelLifecycleState, InferenceOutcome } from '@prisma/client';

const SLUG_A = 'p6g-eval-acceptance-lab-a';
const SLUG_B = 'p6g-eval-acceptance-lab-b';
const FIXTURES_OUT = process.env.CONTINUOUS_EVAL_FIXTURES_OUT
  ? path.resolve(process.env.CONTINUOUS_EVAL_FIXTURES_OUT)
  : path.resolve(__dirname, '../../web/acceptance/.continuous-eval-fixtures.json');
const WSTART = '2026-06-01T00:00:00.000Z';
const WEND = '2026-06-02T00:00:00.000Z';
const IN_WINDOW = new Date('2026-06-01T12:00:00.000Z');

function assertIsolatedAcceptanceDb(): void {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required (isolated acceptance/test database).');
  const name = new URL(url).pathname.replace(/^\//, '');
  if (name === 'cytolab' || !/(test|accept)/i.test(name)) throw new Error(`Refusing "${name}": not an isolated acceptance DB.`);
}

async function main() {
  assertIsolatedAcceptanceDb();
  const prisma = new PrismaClient();
  try {
    for (const slug of [SLUG_A, SLUG_B]) {
      const prior = await prisma.lab.findUnique({ where: { slug }, select: { id: true } });
      if (prior) {
        for (const t of ['EvaluationRecommendationEvidence', 'EvaluationRecommendation', 'EvaluationMetric', 'EvaluationWindowMember', 'EvaluationWindow', 'ValidationCurvePoint', 'ValidationConfusionCell', 'ValidationMetric', 'ValidationRun', 'DatasetVersion', 'Dataset', 'InferenceRecord', 'AiModelVersion', 'AiModel']) {
          await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "labId" = $1`, prior.id);
        }
        await prisma.$executeRaw`DELETE FROM "Lab" WHERE id = ${prior.id}`;
      }
    }
    const mkLab = async (slug: string, name: string) => (await prisma.lab.create({ data: { name, slug }, select: { id: true } })).id;
    const mkVersion = async (labId: string, state: AiModelLifecycleState) => {
      const m = await prisma.aiModel.create({ data: { labId, key: `m-${randomUUID()}`, displayName: 'M', task: 'demo' }, select: { id: true, modelUuid: true } });
      const v = await prisma.aiModelVersion.create({ data: { labId, modelId: m.id, semverMajor: 1, semverMinor: 0, semverPatch: 0, lifecycleState: state, artifactDigest: 'a'.repeat(64) }, select: { id: true, versionUuid: true } });
      return { id: v.id, versionUuid: v.versionUuid, modelUuid: m.modelUuid };
    };
    const mkInferences = async (labId: string, modelVersionId: string, count: number, failCount: number, validationOnly: boolean) => {
      for (let i = 0; i < count; i++) {
        const outcome: InferenceOutcome = i < failCount ? 'FAILED' : 'SUCCEEDED';
        await prisma.inferenceRecord.create({ data: { labId, modelVersionId, inputDigest: 'a'.repeat(64), outcome, validationOnly, durationMs: 100 + i, adapterId: 'stub', adapterVersion: '1.0.0', engineVersion: '6c.1.0', createdAt: IN_WINDOW } });
      }
    };
    const mkValidationRun = async (labId: string, mv: { id: string; versionUuid: string; modelUuid: string }) => {
      const d = await prisma.dataset.create({ data: { labId, key: `k-${randomUUID()}`, displayName: 'D', kind: 'VALIDATION' }, select: { id: true } });
      const dv = await prisma.datasetVersion.create({ data: { labId, datasetId: d.id, versionNumber: 1, state: 'FROZEN', purpose: 'ALGORITHM_VALIDATION', manifestDigest: 'm'.repeat(64), frozenAt: new Date() }, select: { id: true } });
      const vr = await prisma.validationRun.create({ data: { labId, modelVersionId: mv.id, datasetVersionId: dv.id, groundTruthDigest: 'g'.repeat(64), modelVersionUuid: mv.versionUuid, modelUuid: mv.modelUuid, modelLifecycleStateAtRun: 'APPROVED', validatorId: 'stub', validatorVersion: '1.0.0', computationVersion: '6f.1.0', metricSchemaVersion: 'validation-metrics-1.0', calculationId: 'c'.repeat(64), eventId: randomUUID() }, select: { id: true } });
      return vr.id;
    };

    const A = await mkLab(SLUG_A, 'P6G Eval Acceptance Lab A');
    const B = await mkLab(SLUG_B, 'P6G Eval Acceptance Lab B');
    const approved = await mkVersion(A, 'APPROVED');
    const deprecated = await mkVersion(A, 'DEPRECATED');
    const other = await mkVersion(A, 'APPROVED');
    // Populate the approved version's inference stream: 40 (10 failed) non-validation + 2 validation-only + a high-failure set is separate.
    await mkInferences(A, approved.id, 40, 10, false);
    await mkInferences(A, approved.id, 2, 0, true);
    await mkInferences(A, deprecated.id, 40, 32, false); // 0.8 failure → advisory recommendation

    const fixtures = {
      labAId: A,
      labBId: B,
      windowStart: WSTART,
      windowEnd: WEND,
      emptyWindowStart: '2020-01-01T00:00:00.000Z',
      emptyWindowEnd: '2020-01-02T00:00:00.000Z',
      approvedVersion: approved,
      deprecatedVersion: deprecated, // high-failure stream → recommendation
      validationVersion: await mkVersion(A, 'VALIDATION'),
      draftVersion: await mkVersion(A, 'DRAFT'),
      retiredVersion: await mkVersion(A, 'RETIRED'),
      goodBaselineId: await mkValidationRun(A, approved),
      foreignBaselineId: await mkValidationRun(A, other),
      bApprovedVersion: await mkVersion(B, 'APPROVED'),
    };
    fs.mkdirSync(path.dirname(FIXTURES_OUT), { recursive: true });
    fs.writeFileSync(FIXTURES_OUT, JSON.stringify(fixtures, null, 2));
    console.log(`seeded continuous-eval fixtures → ${FIXTURES_OUT}`);
    console.log(`  labA=${A} (model versions across lifecycle; inference streams; same/foreign baselines) labB=${B}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('seed-continuous-eval-acceptance FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
