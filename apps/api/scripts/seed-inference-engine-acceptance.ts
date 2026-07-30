/**
 * Program 6 · Phase 6C — isolated fixtures for the inference-engine acceptance gate.
 *
 * Seeds two labs, each with AI model versions across the full lifecycle (DRAFT/VALIDATION/APPROVED/DEPRECATED/
 * RETIRED) and a few Program-5 slides, so the assertion can exercise eligibility, validation-only provenance,
 * lab-scoped dispatch + cross-lab fail-closed, idempotency, execution → immutable evidence + append-only audit,
 * failure isolation, and reclaim. No PHI beyond fictional synthetic names on the Program-5 side (never copied into
 * any 6C table). Guarded to refuse a non-isolated database.
 */
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient, AiModelLifecycleState } from '@prisma/client';

const SLUG_A = 'p6c-inf-acceptance-lab-a';
const SLUG_B = 'p6c-inf-acceptance-lab-b';
const FIXTURES_OUT = process.env.INFERENCE_FIXTURES_OUT
  ? path.resolve(process.env.INFERENCE_FIXTURES_OUT)
  : path.resolve(__dirname, '../../web/acceptance/.inference-engine-fixtures.json');

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
        for (const t of ['InferenceEvent', 'InferenceRecord', 'InferenceJob', 'AiModelLifecycleEvent', 'AiModelVersion', 'AiModel', 'DigitalSlide', 'Specimen', 'Record', 'Patient']) {
          await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "labId" = $1`, prior.id);
        }
        await prisma.$executeRaw`DELETE FROM "Lab" WHERE id = ${prior.id}`;
      }
    }
    const mkLab = async (slug: string, name: string) => (await prisma.lab.create({ data: { name, slug }, select: { id: true } })).id;
    const mkVersion = async (labId: string, state: AiModelLifecycleState) => {
      const m = await prisma.aiModel.create({ data: { labId, key: `m-${randomUUID()}`, displayName: 'Acceptance model', task: 'demo detector' }, select: { id: true } });
      const v = await prisma.aiModelVersion.create({ data: { labId, modelId: m.id, semverMajor: 1, semverMinor: 0, semverPatch: 0, lifecycleState: state }, select: { id: true } });
      return v.id;
    };
    const mkSlide = async (labId: string) => {
      const p = await prisma.patient.create({ data: { labId, registrationNo: randomUUID(), firstName: 'Synthetic', lastName: 'Subject' } });
      const r = await prisma.record.create({ data: { labId, identifier: randomUUID(), patientId: p.id } });
      const spec = await prisma.specimen.create({ data: { labId, recordId: r.id, type: 'OTHER', label: 'Block A' }, select: { id: true } });
      const s = await prisma.digitalSlide.create({ data: { labId, recordId: r.id, specimenId: spec.id, slideUrl: '', sourceKind: 'DICOM', availabilityStatus: 'DRAFT' }, select: { id: true } });
      return s.id;
    };

    const A = await mkLab(SLUG_A, 'P6C Inference Acceptance Lab A');
    const B = await mkLab(SLUG_B, 'P6C Inference Acceptance Lab B');

    const versions = {
      draft: await mkVersion(A, 'DRAFT'),
      validation: await mkVersion(A, 'VALIDATION'),
      approved: await mkVersion(A, 'APPROVED'),
      deprecated: await mkVersion(A, 'DEPRECATED'),
      retired: await mkVersion(A, 'RETIRED'),
    };
    const aSlideIds = [await mkSlide(A), await mkSlide(A), await mkSlide(A)];
    const bApprovedVersionId = await mkVersion(B, 'APPROVED');
    const bSlideId = await mkSlide(B);

    const fixtures = { labAId: A, labBId: B, versions, aSlideIds, bApprovedVersionId, bSlideId };
    fs.mkdirSync(path.dirname(FIXTURES_OUT), { recursive: true });
    fs.writeFileSync(FIXTURES_OUT, JSON.stringify(fixtures, null, 2));
    console.log(`seeded inference-engine fixtures → ${FIXTURES_OUT}`);
    console.log(`  labA=${A} (versions: draft/validation/approved/deprecated/retired; slides=${aSlideIds.length}) labB=${B}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('seed-inference-engine-acceptance FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
