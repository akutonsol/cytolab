/**
 * Program 6 · Phase 6E — isolated fixtures for the human-review acceptance gate.
 *
 * Seeds two labs, each with: an Account + reviewer/assignee Users (the human-ownership FK target), 6C-style
 * InferenceRecords across the eligibility spectrum (SUCCEEDED, SUCCEEDED validation-only, FAILED, incomplete) with
 * known model-version + result-digest provenance, and 6D ExplainabilityGenerations (same-record + different-record)
 * so the assertion can exercise eligibility, authenticated-human ownership, snapshot integrity, validation-only
 * inheritance, structured MODIFY findings, terminal-state boundary + governed reopen, explainability same-record
 * consistency, and cross-lab fail-closed. No PHI is copied into any 6E table. Guarded to refuse a non-isolated DB.
 */
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient, AiModelLifecycleState, InferenceOutcome } from '@prisma/client';

const SLUG_A = 'p6e-review-acceptance-lab-a';
const SLUG_B = 'p6e-review-acceptance-lab-b';
const FIXTURES_OUT = process.env.HUMAN_REVIEW_FIXTURES_OUT
  ? path.resolve(process.env.HUMAN_REVIEW_FIXTURES_OUT)
  : path.resolve(__dirname, '../../web/acceptance/.human-review-fixtures.json');

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
        for (const t of ['HumanReviewModifiedFinding', 'HumanReviewDecision', 'HumanReviewRequestEvent', 'HumanReviewRequest', 'ExplainabilityGeneration', 'InferenceRecord', 'AiModelVersion', 'AiModel', 'User', 'Account']) {
          await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "labId" = $1`, prior.id);
        }
        await prisma.$executeRaw`DELETE FROM "Lab" WHERE id = ${prior.id}`;
      }
    }
    const mkLab = async (slug: string, name: string) => (await prisma.lab.create({ data: { name, slug }, select: { id: true } })).id;
    const mkUser = async (labId: string, accountId: string) => (await prisma.user.create({ data: { labId, accountId, email: `u-${randomUUID()}@t.test`, passwordHash: 'x', firstName: 'Rev', lastName: 'Iewer' }, select: { id: true } })).id;
    const mkRecord = async (labId: string, opts: { outcome: InferenceOutcome | null; validationOnly?: boolean; lifecycle?: AiModelLifecycleState }) => {
      const m = await prisma.aiModel.create({ data: { labId, key: `m-${randomUUID()}`, displayName: 'M', task: 'demo' }, select: { id: true } });
      const v = await prisma.aiModelVersion.create({ data: { labId, modelId: m.id, semverMajor: 1, semverMinor: 0, semverPatch: 0, lifecycleState: opts.lifecycle ?? 'APPROVED' }, select: { id: true } });
      const rec = await prisma.inferenceRecord.create({ data: { labId, modelVersionId: v.id, inputDigest: 'a'.repeat(64), resultDigest: 'b'.repeat(64), outcome: opts.outcome, validationOnly: opts.validationOnly ?? false, adapterId: 'stub', adapterVersion: '1.0.0', engineVersion: '6c.1.0', modelLifecycleStateAtRun: opts.lifecycle ?? 'APPROVED' }, select: { id: true } });
      return { recordId: rec.id, modelVersionId: v.id };
    };
    const mkExplain = async (labId: string, inferenceRecordId: string) => (await prisma.explainabilityGeneration.create({ data: { labId, inferenceRecordId, generatorId: 'stub', generatorVersion: '1.0.0', validationOnly: false, eventId: randomUUID() }, select: { id: true } })).id;

    const A = await mkLab(SLUG_A, 'P6E Human Review Acceptance Lab A');
    const B = await mkLab(SLUG_B, 'P6E Human Review Acceptance Lab B');
    const accA = (await prisma.account.create({ data: { labId: A, name: 'p6e-acct-a' }, select: { id: true } })).id;
    const accB = (await prisma.account.create({ data: { labId: B, name: 'p6e-acct-b' }, select: { id: true } })).id;

    const aSucceeded = await mkRecord(A, { outcome: 'SUCCEEDED' });
    const aValidationOnly = await mkRecord(A, { outcome: 'SUCCEEDED', validationOnly: true, lifecycle: 'VALIDATION' });
    const aOther = await mkRecord(A, { outcome: 'SUCCEEDED' });

    const fixtures = {
      labAId: A,
      labBId: B,
      reviewerAId: await mkUser(A, accA),
      assigneeAId: await mkUser(A, accA),
      reviewerBId: await mkUser(B, accB), // foreign reviewer (cross-lab)
      aSucceededRecordId: aSucceeded.recordId,
      aSucceededModelVersionId: aSucceeded.modelVersionId,
      aValidationOnlyRecordId: aValidationOnly.recordId,
      aOtherRecordId: aOther.recordId,
      aFailedRecordId: (await mkRecord(A, { outcome: 'FAILED' })).recordId,
      aIncompleteRecordId: (await mkRecord(A, { outcome: null })).recordId,
      aExplainSameRecordId: await mkExplain(A, aSucceeded.recordId),
      aExplainOtherRecordId: await mkExplain(A, aOther.recordId),
      bSucceededRecordId: (await mkRecord(B, { outcome: 'SUCCEEDED' })).recordId,
    };
    fs.mkdirSync(path.dirname(FIXTURES_OUT), { recursive: true });
    fs.writeFileSync(FIXTURES_OUT, JSON.stringify(fixtures, null, 2));
    console.log(`seeded human-review fixtures → ${FIXTURES_OUT}`);
    console.log(`  labA=${A} (reviewer/assignee users; SUCCEEDED + validation-only + FAILED + incomplete records; same/other explainability) labB=${B}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('seed-human-review-acceptance FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
