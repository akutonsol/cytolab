/**
 * Program 6 · Phase 6H — isolated fixtures for the clinical-performance acceptance gate.
 *
 * Seeds two labs, each with: AI model versions across the lifecycle (APPROVED/VALIDATION/DEPRECATED/DRAFT/RETIRED),
 * 6C InferenceRecords + 6E HumanReviewDecisions over a known time window (clinical + validation-only cohorts), and a
 * same-model-version 6F ValidationRun baseline (+ a foreign-model baseline), so the assertion can exercise eligibility,
 * dual-source membership, cohort separation, observed/synthetic/unavailable provenance, empty windows, baseline
 * compatibility, determinism, atomicity, no-diagnostic-authority, and cross-lab fail-closed. No PHI in any 6H table.
 * Guarded to refuse a non-isolated database.
 */
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient, AiModelLifecycleState, HumanReviewDecisionType } from '@prisma/client';

const SLUG_A = 'p6h-clinicalperf-acceptance-lab-a';
const SLUG_B = 'p6h-clinicalperf-acceptance-lab-b';
const FIXTURES_OUT = process.env.CLINICAL_PERF_FIXTURES_OUT
  ? path.resolve(process.env.CLINICAL_PERF_FIXTURES_OUT)
  : path.resolve(__dirname, '../../web/acceptance/.clinical-perf-fixtures.json');
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
        for (const t of ['ClinicalPerfMetric', 'ClinicalPerfWindowMember', 'ClinicalPerfWindow', 'ValidationCurvePoint', 'ValidationConfusionCell', 'ValidationMetric', 'ValidationRun', 'DatasetVersion', 'Dataset', 'HumanReviewModifiedFinding', 'HumanReviewDecision', 'HumanReviewRequestEvent', 'HumanReviewRequest', 'InferenceRecord', 'AiModelVersion', 'AiModel', 'User', 'Account']) {
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
    const mkUser = async (labId: string, accountId: string) => (await prisma.user.create({ data: { labId, accountId, email: `u-${randomUUID()}@t.test`, passwordHash: 'x', firstName: 'R', lastName: 'V' }, select: { id: true } })).id;
    const mkInference = async (labId: string, mvId: string, validationOnly: boolean) => (await prisma.inferenceRecord.create({ data: { labId, modelVersionId: mvId, inputDigest: 'a'.repeat(64), outcome: 'SUCCEEDED', validationOnly, durationMs: 100, adapterId: 'stub', adapterVersion: '1.0.0', engineVersion: '6c.1.0', createdAt: IN_WINDOW }, select: { id: true } })).id;
    const mkDecision = async (labId: string, mvId: string, reviewerId: string, decision: HumanReviewDecisionType, validationOnly: boolean) => {
      const irId = await mkInference(labId, mvId, validationOnly);
      const req = await prisma.humanReviewRequest.create({ data: { labId, inferenceRecordId: irId, state: 'COMPLETED', validationOnly, completedAt: IN_WINDOW }, select: { id: true } });
      await prisma.humanReviewDecision.create({ data: { labId, requestId: req.id, inferenceRecordId: irId, reviewerUserId: reviewerId, reviewDecision: decision, validationOnly, reviewedModelVersionId: mvId, reviewedResultDigest: 'b'.repeat(64), eventId: randomUUID(), submittedAt: IN_WINDOW } });
    };
    const mkValidationRun = async (labId: string, mv: { id: string; versionUuid: string; modelUuid: string }) => {
      const d = await prisma.dataset.create({ data: { labId, key: `k-${randomUUID()}`, displayName: 'D', kind: 'VALIDATION' }, select: { id: true } });
      const dv = await prisma.datasetVersion.create({ data: { labId, datasetId: d.id, versionNumber: 1, state: 'FROZEN', purpose: 'ALGORITHM_VALIDATION', manifestDigest: 'm'.repeat(64), frozenAt: new Date() }, select: { id: true } });
      return (await prisma.validationRun.create({ data: { labId, modelVersionId: mv.id, datasetVersionId: dv.id, groundTruthDigest: 'g'.repeat(64), modelVersionUuid: mv.versionUuid, modelUuid: mv.modelUuid, modelLifecycleStateAtRun: 'APPROVED', validatorId: 'stub', validatorVersion: '1.0.0', computationVersion: '6f.1.0', metricSchemaVersion: 'validation-metrics-1.0', calculationId: 'c'.repeat(64), eventId: randomUUID() }, select: { id: true } })).id;
    };

    const A = await mkLab(SLUG_A, 'P6H Clinical Perf Acceptance Lab A');
    const B = await mkLab(SLUG_B, 'P6H Clinical Perf Acceptance Lab B');
    const accA = (await prisma.account.create({ data: { labId: A, name: 'p6h-acct-a' }, select: { id: true } })).id;
    const reviewer = await mkUser(A, accA);
    const approved = await mkVersion(A, 'APPROVED');
    const deprecated = await mkVersion(A, 'DEPRECATED');
    const other = await mkVersion(A, 'APPROVED');
    // clinical cohort: 3 ACCEPT + 1 REJECT decisions (agreement 0.75) + standalone inferences
    for (const d of ['ACCEPT', 'ACCEPT', 'ACCEPT', 'REJECT'] as const) await mkDecision(A, approved.id, reviewer, d, false);
    for (let i = 0; i < 2; i++) await mkInference(A, approved.id, false);
    // validation-only cohort (kept separate)
    await mkDecision(A, approved.id, reviewer, 'ACCEPT', true);

    const fixtures = {
      labAId: A,
      labBId: B,
      windowStart: WSTART,
      windowEnd: WEND,
      emptyWindowStart: '2020-01-01T00:00:00.000Z',
      emptyWindowEnd: '2020-01-02T00:00:00.000Z',
      approvedVersion: approved,
      deprecatedVersion: deprecated,
      validationVersion: await mkVersion(A, 'VALIDATION'),
      draftVersion: await mkVersion(A, 'DRAFT'),
      retiredVersion: await mkVersion(A, 'RETIRED'),
      goodBaselineId: await mkValidationRun(A, approved),
      foreignBaselineId: await mkValidationRun(A, other),
      bApprovedVersion: await mkVersion(B, 'APPROVED'),
    };
    fs.mkdirSync(path.dirname(FIXTURES_OUT), { recursive: true });
    fs.writeFileSync(FIXTURES_OUT, JSON.stringify(fixtures, null, 2));
    console.log(`seeded clinical-perf fixtures → ${FIXTURES_OUT}`);
    console.log(`  labA=${A} (model versions across lifecycle; 6C+6E evidence; same/foreign baselines) labB=${B}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('seed-clinical-perf-acceptance FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
