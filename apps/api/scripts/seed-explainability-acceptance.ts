/**
 * Program 6 · Phase 6D — isolated fixtures for the explainability acceptance gate.
 *
 * Seeds two labs, each with 6C-style InferenceRecords across the eligibility spectrum (SUCCEEDED, SUCCEEDED
 * validation-only, FAILED, incomplete) referencing Program-5 slides with known pixel dimensions, so the assertion
 * can exercise eligibility, validation-only inheritance, coordinate-space provenance, atomic generation, determinism,
 * append-only regeneration, no-support-inference, and cross-lab fail-closed. Records are created directly (the 6C
 * worker path is not exercised here). No PHI is copied into any 6D table. Guarded to refuse a non-isolated database.
 */
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient, AiModelLifecycleState, InferenceOutcome } from '@prisma/client';

const SLUG_A = 'p6d-explain-acceptance-lab-a';
const SLUG_B = 'p6d-explain-acceptance-lab-b';
const FIXTURES_OUT = process.env.EXPLAINABILITY_FIXTURES_OUT
  ? path.resolve(process.env.EXPLAINABILITY_FIXTURES_OUT)
  : path.resolve(__dirname, '../../web/acceptance/.explainability-fixtures.json');

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
        for (const t of ['ExplainabilityProbability', 'ExplainabilityRegion', 'ExplainabilityArtifact', 'ExplainabilityGeneration', 'InferenceRecord', 'AiModelVersion', 'AiModel', 'DigitalSlide', 'Specimen', 'Record', 'Patient']) {
          await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "labId" = $1`, prior.id);
        }
        await prisma.$executeRaw`DELETE FROM "Lab" WHERE id = ${prior.id}`;
      }
    }
    const mkLab = async (slug: string, name: string) => (await prisma.lab.create({ data: { name, slug }, select: { id: true } })).id;
    const mkVersion = async (labId: string, state: AiModelLifecycleState = 'APPROVED') => {
      const m = await prisma.aiModel.create({ data: { labId, key: `m-${randomUUID()}`, displayName: 'Acceptance model', task: 'demo' }, select: { id: true } });
      const v = await prisma.aiModelVersion.create({ data: { labId, modelId: m.id, semverMajor: 1, semverMinor: 0, semverPatch: 0, lifecycleState: state }, select: { id: true } });
      return v.id;
    };
    const mkSlide = async (labId: string, w: number, h: number) => {
      const p = await prisma.patient.create({ data: { labId, registrationNo: randomUUID(), firstName: 'Synthetic', lastName: 'Subject' } });
      const r = await prisma.record.create({ data: { labId, identifier: randomUUID(), patientId: p.id } });
      const spec = await prisma.specimen.create({ data: { labId, recordId: r.id, type: 'OTHER', label: 'Block A' }, select: { id: true } });
      const s = await prisma.digitalSlide.create({ data: { labId, recordId: r.id, specimenId: spec.id, slideUrl: '', sourceKind: 'DICOM', availabilityStatus: 'DRAFT', sourceWidth: w, sourceHeight: h }, select: { id: true } });
      return s.id;
    };
    const mkRecord = async (labId: string, opts: { outcome: InferenceOutcome | null; validationOnly?: boolean; slideId?: string | null }) => {
      const modelVersionId = await mkVersion(labId);
      const rec = await prisma.inferenceRecord.create({
        data: { labId, modelVersionId, subjectSlideId: opts.slideId ?? null, inputDigest: 'a'.repeat(64), resultDigest: 'b'.repeat(64), outcome: opts.outcome, validationOnly: opts.validationOnly ?? false, adapterId: 'stub', adapterVersion: '1.0.0', engineVersion: '6c.1.0' },
        select: { id: true },
      });
      return rec.id;
    };

    const A = await mkLab(SLUG_A, 'P6D Explainability Acceptance Lab A');
    const B = await mkLab(SLUG_B, 'P6D Explainability Acceptance Lab B');
    const SW = 1000, SH = 800;
    const aSlide = await mkSlide(A, SW, SH);
    const aValSlide = await mkSlide(A, SW, SH);

    const fixtures = {
      labAId: A,
      labBId: B,
      slideWidth: SW,
      slideHeight: SH,
      aSucceededRecordId: await mkRecord(A, { outcome: 'SUCCEEDED', slideId: aSlide }),
      aValidationOnlyRecordId: await mkRecord(A, { outcome: 'SUCCEEDED', validationOnly: true, slideId: aValSlide }),
      aFailedRecordId: await mkRecord(A, { outcome: 'FAILED', slideId: null }),
      aIncompleteRecordId: await mkRecord(A, { outcome: null, slideId: null }),
      bSucceededRecordId: await mkRecord(B, { outcome: 'SUCCEEDED', slideId: await mkSlide(B, SW, SH) }),
    };
    fs.mkdirSync(path.dirname(FIXTURES_OUT), { recursive: true });
    fs.writeFileSync(FIXTURES_OUT, JSON.stringify(fixtures, null, 2));
    console.log(`seeded explainability fixtures → ${FIXTURES_OUT}`);
    console.log(`  labA=${A} (SUCCEEDED + validation-only + FAILED + incomplete records; slide ${SW}x${SH}) labB=${B}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('seed-explainability-acceptance FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
