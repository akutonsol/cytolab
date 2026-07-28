import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { createTestPrisma } from '@test/test-database';
import { VL_WHOLE_SLIDE_MICROSCOPY_SOP_CLASS_UID } from './dicom-conformance';

/**
 * Program 5C · C1 — tenant-safe DICOM identity against the REAL test DB. Proves the series-grain uniqueness
 * (`@@unique([labId, studyInstanceUID, seriesInstanceUID])`): the same Study+Series is allowed across two
 * different labs (a DICOM UID is NOT a tenant key), while a duplicate within one lab is rejected. Also proves
 * the PHI boundary structurally — the persisted model exposes no prohibited patient/PHI columns.
 */
const prisma = createTestPrisma();
const WSI = VL_WHOLE_SLIDE_MICROSCOPY_SOP_CLASS_UID;
const TS = '1.2.840.10008.1.2.1';
const labIds: string[] = [];

async function mkSlide(labId: string): Promise<string> {
  const p = await prisma.patient.create({ data: { labId, registrationNo: randomUUID(), firstName: 'C1', lastName: 'DICOM' } });
  const r = await prisma.record.create({ data: { labId, identifier: randomUUID(), patientId: p.id } });
  const s = await prisma.digitalSlide.create({ data: { labId, recordId: r.id, slideUrl: '', sourceKind: 'DICOM', availabilityStatus: 'DRAFT' } });
  return s.id;
}
async function mkLab(): Promise<string> {
  const lab = await prisma.lab.create({ data: { name: 'c1', slug: `c1-${randomUUID()}` } });
  labIds.push(lab.id);
  return lab.id;
}

afterAll(async () => {
  for (const labId of labIds) {
    await prisma.$executeRaw`DELETE FROM "SlideDicomMetadata" WHERE "labId" = ${labId}`;
    await prisma.$executeRaw`DELETE FROM "DigitalSlide" WHERE "labId" = ${labId}`;
    await prisma.$executeRaw`DELETE FROM "Record" WHERE "labId" = ${labId}`;
    await prisma.$executeRaw`DELETE FROM "Patient" WHERE "labId" = ${labId}`;
    await prisma.$executeRaw`DELETE FROM "Lab" WHERE id = ${labId}`;
  }
  await prisma.$disconnect();
});

const STUDY = '1.2.826.0.1.3680043.2.9999.7';
const SERIES = '1.2.826.0.1.3680043.2.9999.7.1';

it('allows the same Study+Series in two DIFFERENT labs (UID is not a tenant key)', async () => {
  const labA = await mkLab();
  const labB = await mkLab();
  const sA = await mkSlide(labA);
  const sB = await mkSlide(labB);
  await prisma.slideDicomMetadata.create({ data: { labId: labA, slideId: sA, studyInstanceUID: STUDY, seriesInstanceUID: SERIES, sopClassUID: WSI, transferSyntaxUID: TS, conformanceStatus: 'VALID' } });
  await expect(
    prisma.slideDicomMetadata.create({ data: { labId: labB, slideId: sB, studyInstanceUID: STUDY, seriesInstanceUID: SERIES, sopClassUID: WSI, transferSyntaxUID: TS, conformanceStatus: 'VALID' } }),
  ).resolves.toBeTruthy();
});

it('rejects a duplicate Study+Series within the SAME lab (series-grain unique)', async () => {
  const lab = await mkLab();
  const s1 = await mkSlide(lab);
  const s2 = await mkSlide(lab);
  await prisma.slideDicomMetadata.create({ data: { labId: lab, slideId: s1, studyInstanceUID: STUDY, seriesInstanceUID: SERIES, sopClassUID: WSI, transferSyntaxUID: TS, conformanceStatus: 'VALID' } });
  await expect(
    prisma.slideDicomMetadata.create({ data: { labId: lab, slideId: s2, studyInstanceUID: STUDY, seriesInstanceUID: SERIES, sopClassUID: WSI, transferSyntaxUID: TS, conformanceStatus: 'VALID' } }),
  ).rejects.toMatchObject({ code: 'P2002' });
});

it('persists NO prohibited PHI columns and no raw-header blob (structural PHI boundary)', () => {
  const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'SlideDicomMetadata')!;
  const fields = new Set(model.fields.map((f) => f.name.toLowerCase()));
  for (const banned of ['patientname', 'patientid', 'patientbirthdate', 'patientsex', 'studydate', 'referringphysicianname', 'institutionname', 'rawtags', 'rawheader', 'headers', 'rawdataset'])
    expect(fields.has(banned)).toBe(false);
  // and it DOES carry the allowlisted identity/conformance fields
  for (const req of ['studyinstanceuid', 'seriesinstanceuid', 'sopclassuid', 'transfersyntaxuid', 'conformancestatus'])
    expect(fields.has(req)).toBe(true);
});
