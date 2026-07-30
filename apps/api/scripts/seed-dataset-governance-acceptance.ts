/**
 * Program 6 · Phase 6B — isolated fixtures for the dataset-governance acceptance gate.
 *
 * Seeds two labs, each with a few Program-5 slides (patient → record → slide) and a specimen, so the assertion
 * can exercise lab-scoped membership, cross-lab fail-closed references, ground-truth labels, and freeze. No PHI
 * beyond fictional synthetic names on the Program-5 side (never copied into any 6B table). Guarded to refuse a
 * non-isolated database.
 */
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';

const SLUG_A = 'p6b-ds-acceptance-lab-a';
const SLUG_B = 'p6b-ds-acceptance-lab-b';
const FIXTURES_OUT = process.env.DATASET_FIXTURES_OUT
  ? path.resolve(process.env.DATASET_FIXTURES_OUT)
  : path.resolve(__dirname, '../../web/acceptance/.dataset-governance-fixtures.json');

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
        for (const t of ['AnnotationLineageEvent', 'GroundTruthLabel', 'DatasetSlide', 'TrainingDatasetReference', 'DatasetVersion', 'Dataset', 'DigitalSlide', 'Specimen', 'Record', 'Patient']) {
          await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "labId" = $1`, prior.id);
        }
        await prisma.$executeRaw`DELETE FROM "Lab" WHERE id = ${prior.id}`;
      }
    }
    const mkLab = async (slug: string, name: string) => (await prisma.lab.create({ data: { name, slug }, select: { id: true } })).id;
    const mkSlide = async (labId: string) => {
      const p = await prisma.patient.create({ data: { labId, registrationNo: randomUUID(), firstName: 'Synthetic', lastName: 'Subject' } });
      const r = await prisma.record.create({ data: { labId, identifier: randomUUID(), patientId: p.id } });
      const spec = await prisma.specimen.create({ data: { labId, recordId: r.id, type: 'OTHER', label: 'Block A' }, select: { id: true } });
      const s = await prisma.digitalSlide.create({ data: { labId, recordId: r.id, specimenId: spec.id, slideUrl: '', sourceKind: 'DICOM', availabilityStatus: 'DRAFT' }, select: { id: true } });
      return { slideId: s.id, specimenId: spec.id };
    };

    const A = await mkLab(SLUG_A, 'P6B DS Acceptance Lab A');
    const B = await mkLab(SLUG_B, 'P6B DS Acceptance Lab B');
    const aSlides = [await mkSlide(A), await mkSlide(A), await mkSlide(A)];
    const bSlide = await mkSlide(B);

    const fixtures = {
      labAId: A,
      labBId: B,
      aSlideIds: aSlides.map((s) => s.slideId),
      aSpecimenIds: aSlides.map((s) => s.specimenId),
      bSlideId: bSlide.slideId,
    };
    fs.mkdirSync(path.dirname(FIXTURES_OUT), { recursive: true });
    fs.writeFileSync(FIXTURES_OUT, JSON.stringify(fixtures, null, 2));
    console.log(`seeded dataset-governance fixtures → ${FIXTURES_OUT}`);
    console.log(`  labA=${A} (slides=${aSlides.length}) labB=${B} (slides=1)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('seed-dataset-governance-acceptance FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
