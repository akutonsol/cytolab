/**
 * Program 6 · Phase 6F — isolated fixtures for the validation acceptance gate.
 *
 * Seeds two labs, each with: AI model versions across the lifecycle (VALIDATION/APPROVED/DRAFT/DEPRECATED/RETIRED)
 * with a known artifact digest, and dataset versions (FROZEN with ground-truth labels over Program-5 slides, plus a
 * DRAFT), so the assertion can exercise the FROZEN×VALIDATION/APPROVED linkage, eligibility rejection, snapshot
 * integrity, determinism, atomicity, cross-run independence, and cross-lab fail-closed. No PHI is copied into any 6F
 * table. Guarded to refuse a non-isolated database.
 */
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient, AiModelLifecycleState, DatasetVersionState } from '@prisma/client';

const SLUG_A = 'p6f-validation-acceptance-lab-a';
const SLUG_B = 'p6f-validation-acceptance-lab-b';
const FIXTURES_OUT = process.env.VALIDATION_FIXTURES_OUT
  ? path.resolve(process.env.VALIDATION_FIXTURES_OUT)
  : path.resolve(__dirname, '../../web/acceptance/.validation-fixtures.json');

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
        for (const t of ['ValidationCurvePoint', 'ValidationConfusionCell', 'ValidationMetric', 'ValidationRun', 'GroundTruthLabel', 'DatasetSlide', 'DatasetVersion', 'Dataset', 'AiModelVersion', 'AiModel', 'DigitalSlide', 'Specimen', 'Record', 'Patient']) {
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
    const mkSlide = async (labId: string) => {
      const p = await prisma.patient.create({ data: { labId, registrationNo: randomUUID(), firstName: 'Synthetic', lastName: 'Subject' } });
      const r = await prisma.record.create({ data: { labId, identifier: randomUUID(), patientId: p.id } });
      const s = await prisma.digitalSlide.create({ data: { labId, recordId: r.id, slideUrl: '', sourceKind: 'DICOM', availabilityStatus: 'DRAFT' }, select: { id: true } });
      return s.id;
    };
    const mkDatasetVersion = async (labId: string, state: DatasetVersionState) => {
      const d = await prisma.dataset.create({ data: { labId, key: `k-${randomUUID()}`, displayName: 'D', kind: 'VALIDATION' }, select: { id: true } });
      const v = await prisma.datasetVersion.create({ data: { labId, datasetId: d.id, versionNumber: 1, state, purpose: 'ALGORITHM_VALIDATION', manifestDigest: state === 'FROZEN' ? 'm'.repeat(64) : null, frozenAt: state === 'FROZEN' ? new Date() : null }, select: { id: true } });
      if (state === 'FROZEN') {
        for (let i = 0; i < 2; i++) {
          const slide = await mkSlide(labId);
          await prisma.groundTruthLabel.create({ data: { labId, datasetVersionId: v.id, slideId: slide, labelSchemaKey: 'dx', labelSchemaVersion: '1', labelValue: `class-${i}` } });
        }
      }
      return v.id;
    };

    const A = await mkLab(SLUG_A, 'P6F Validation Acceptance Lab A');
    const B = await mkLab(SLUG_B, 'P6F Validation Acceptance Lab B');

    const fixtures = {
      labAId: A,
      labBId: B,
      approvedVersion: await mkVersion(A, 'APPROVED'),
      validationVersion: await mkVersion(A, 'VALIDATION'),
      draftVersion: await mkVersion(A, 'DRAFT'),
      deprecatedVersion: await mkVersion(A, 'DEPRECATED'),
      retiredVersion: await mkVersion(A, 'RETIRED'),
      frozenDatasetVersionId: await mkDatasetVersion(A, 'FROZEN'),
      draftDatasetVersionId: await mkDatasetVersion(A, 'DRAFT'),
      bApprovedVersion: await mkVersion(B, 'APPROVED'),
      bFrozenDatasetVersionId: await mkDatasetVersion(B, 'FROZEN'),
    };
    fs.mkdirSync(path.dirname(FIXTURES_OUT), { recursive: true });
    fs.writeFileSync(FIXTURES_OUT, JSON.stringify(fixtures, null, 2));
    console.log(`seeded validation fixtures → ${FIXTURES_OUT}`);
    console.log(`  labA=${A} (model versions across lifecycle + FROZEN/DRAFT datasets) labB=${B}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('seed-validation-acceptance FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
