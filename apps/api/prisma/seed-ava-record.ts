/**
 * Seed a complete, authorized GYN test case for Ava Thompson (Lab DM26-05-040)
 * so the full PDF report can be exercised end-to-end.
 *
 * Field mapping notes (task wording → actual schema):
 *   record "status: Authorized"  → RecordStatus.Approved (+ ResultSheet.authorized)
 *   record.registeredAt          → Record.createdAt (report maps createdAt→Reg'd)
 *   record.collectionDate        → Record.specimenDate
 *   GYN pregnancies "2+0"        → GynClinicalFeatures.pregnancies = 2 (Int?)
 *   report narrative             → a Report row's `content` (what the PDF renders)
 *
 * Idempotent: skips creation if DM26-05-040 already exists, but still verifies.
 * Run: npx ts-node prisma/seed-ava-record.ts
 */
import { PrismaClient, Gender, RecordStatus, RequisitionFormType, RequisitionStatus, SpecimenType, SpecimenAdequacy, GeneralCategory, BethesdaRecommendation } from '@prisma/client';
import { buildReportDefinition, ReportDocumentData } from '../src/modules/reports/report-document';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PdfPrinter = require('pdfmake');

const prisma = new PrismaClient();
// DM26-05-040 already existed (shared demo patient across 36 records); per the
// chosen approach we create a clean case under a fresh lab number + new patient.
const LAB_NO = 'DM26-05-043';
const REG_NO = 'DEMO-Thompson-5108';
const NARRATIVE =
  'SATISFACTORY SAMPLE FOR EVALUATION. NEGATIVE FOR INTRAEPITHELIAL LESION OR MALIGNANCY (NILM). ' +
  'Endocervical/transformation zone component present. No abnormal cells identified. ' +
  'Routine screening recommended in 3 years.';

const deriveAge = (dob?: Date | null) => (dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 86_400_000)) : null);
const asDataUri = (v?: string | null) => (v && v.startsWith('data:') ? v : null);

async function main() {
  // ── Lab (Cytolab Demo, else the lab with the most records) ──────────────────
  let lab = await prisma.lab.findFirst({ where: { name: { contains: 'Cytolab Demo', mode: 'insensitive' } }, select: { id: true, name: true } });
  if (!lab) {
    const byLab = await prisma.record.groupBy({ by: ['labId'], _count: { _all: true }, orderBy: { _count: { id: 'desc' } } });
    lab = byLab[0] ? await prisma.lab.findUnique({ where: { id: byLab[0].labId }, select: { id: true, name: true } }) : null;
  }
  if (!lab) throw new Error('No lab found');
  const labId = lab.id;
  console.log(`Lab: ${lab.name} (${labId})`);

  const user = await prisma.user.findFirst({ where: { labId }, select: { id: true, firstName: true, lastName: true } });
  const client = await prisma.client.findFirst({ where: { labId, officeName: { contains: 'Kingston Medical', mode: 'insensitive' } }, select: { id: true, officeName: true } });
  console.log(`Authorizer: ${user ? `${user.firstName} ${user.lastName}` : '(none found)'}  |  Client: ${client?.officeName ?? '(Kingston Medical not found)'}`);

  let record = await prisma.record.findFirst({ where: { labId, labNumber: LAB_NO }, select: { id: true } });

  if (record) {
    console.log(`Record ${LAB_NO} already exists (${record.id}) — skipping creation, verifying only.`);
  } else {
    // ── Patient (reuse by registrationNo) ─────────────────────────────────────
    let patient = await prisma.patient.findFirst({ where: { labId, registrationNo: REG_NO }, select: { id: true } });
    if (!patient) {
      patient = await prisma.patient.create({
        data: {
          labId, registrationNo: REG_NO, firstName: 'Ava', lastName: 'Thompson',
          gender: Gender.Female, dateOfBirth: new Date('1988-03-15'), phoneNumber: '(876) 555-0142',
          clientId: client?.id ?? null,
          addresses: { create: [{ labId, line1: '45 Hope Road', city: 'Kingston 6', country: 'Jamaica' }] },
        },
        select: { id: true },
      });
      console.log('Created patient Ava Thompson.');
    } else {
      console.log('Patient Ava Thompson already existed — reusing.');
    }

    // ── Requisition (+ line linked to the record below) ───────────────────────
    const refs = await prisma.requisition.findMany({ where: { labId }, select: { referenceNo: true } });
    const nextRef = String(refs.reduce((m, r) => { const n = parseInt(r.referenceNo ?? '', 10); return Number.isFinite(n) && n > m ? n : m; }, 1454) + 1);
    const requisition = await prisma.requisition.create({
      data: { labId, referenceNo: nextRef, status: RequisitionStatus.Completed, amount: 0, clientId: client?.id ?? null, dateReceived: new Date('2026-05-10'), createdAt: new Date('2026-05-10') },
      select: { id: true },
    });

    // ── Record + specimen + GYN features + Bethesda ───────────────────────────
    const created = await prisma.record.create({
      data: {
        labId,
        identifier: `SEED-${LAB_NO}`,
        labNumber: LAB_NO,
        formType: RequisitionFormType.Gynecology,
        doctor: 'Dr. K. Brown',
        clinicalDiagnosis: 'Routine cervical screening',
        specimenDate: new Date('2026-05-10'),        // → collectionDate
        createdAt: new Date('2026-05-12'),           // → registeredAt (Reg'd)
        status: RecordStatus.Approved,
        urgent: false,
        patientId: patient.id,
        clientId: client?.id ?? null,
        specimens: { create: [{ labId, type: SpecimenType.CERV_SCRAP, label: 'Cervical Scrape', dateReceived: new Date('2026-05-12'), clientId: client?.id ?? null }] },
        gynFeatures: { create: { labId, routineCheck: true, previousCytology: false, lmp: new Date('2026-04-20'), clinicalAppearanceOfCervix: 'Clinically normal', nowPregnant: false, pregnancies: 2 } },
        bethesdaResult: { create: { labId, specimenAdequacy: SpecimenAdequacy.Satisfactory, generalCategory: GeneralCategory.NILM, organisms: [], otherNonNeoplastic: ['Reactive changes'], recommendation: BethesdaRecommendation.RoutineScreening, generatedNarrative: NARRATIVE, reportedById: user?.id ?? null } },
      },
      select: { id: true, specimens: { select: { id: true } } },
    });
    record = { id: created.id };

    await prisma.requisitionLine.create({ data: { labId, requisitionId: requisition.id, formType: RequisitionFormType.Gynecology, isCompleted: true, amount: 0, recordId: created.id } });

    // ── Authorized result sheet + entry/line + released Report ────────────────
    const sheet = await prisma.resultSheet.create({
      data: { labId, recordId: created.id, authorized: true, authorizedAt: new Date('2026-05-15T09:30:00'), authorizedById: user?.id ?? null, narrative: NARRATIVE },
      select: { id: true },
    });
    await prisma.resultEntry.create({
      data: { labId, resultSheetId: sheet.id, specimenId: created.specimens[0].id, resultLines: { create: [{ labId, abbreviation: 'NILM', result: 'Negative', findings: 'Negative for intraepithelial lesion or malignancy', abnormalFinding: false }] } },
    });
    await prisma.report.create({ data: { labId, resultSheetId: sheet.id, content: NARRATIVE, writtenById: user?.id ?? null, releasedAt: new Date('2026-05-15T09:35:00') } });
    console.log('Created requisition, record, specimen, GYN features, Bethesda result, authorized result sheet + report.');
  }

  const recordId = record.id;

  // ── VERIFY: replicate reports.service assembly and render a PDF ──────────────
  const sheet = await prisma.resultSheet.findFirst({
    where: { recordId }, orderBy: { createdAt: 'desc' },
    select: {
      authorized: true, authorizedAt: true,
      authorizedBy: { select: { firstName: true, lastName: true, signatureUrl: true, authorizerDesignation: true } },
      resultEntries: { select: { specimen: { select: { label: true, type: true } }, resultLines: { select: { abbreviation: true, result: true, findings: true, abnormalFinding: true } } } },
      reports: { orderBy: { releasedAt: 'desc' }, take: 1, select: { content: true, medicalEntry: true, writtenBy: { select: { firstName: true, lastName: true } } } },
      record: {
        select: {
          identifier: true, labNumber: true, clinicalDiagnosis: true, doctor: true, formType: true, specimenDate: true, createdAt: true,
          lab: { select: { name: true, address: true, phone: true, email: true, logoUrl: true } },
          patient: { select: { firstName: true, lastName: true, middleName: true, registrationNo: true, gender: true, bloodGroup: true, phoneNumber: true, dateOfBirth: true } },
          client: { select: { firstName: true, lastName: true, officeName: true } },
          specimens: { select: { type: true, label: true, bloodGroup: true, dateReceived: true } },
          gynFeatures: { select: { previousCytology: true, clinicalAppearanceOfCervix: true, pregnancies: true, nowPregnant: true, lmp: true, routineCheck: true } },
          assignedTo: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });
  if (!sheet) throw new Error('No result sheet for record — cannot render');
  if (!sheet.authorized) throw new Error('Result sheet not authorized');
  const r = sheet.record;
  const narrative = sheet.reports[0] ?? null;
  const authorizerName = sheet.authorizedBy ? `${sheet.authorizedBy.firstName} ${sheet.authorizedBy.lastName}`.trim() : 'Authorizer';
  const cytoWriter = narrative?.writtenBy ?? r.assignedTo ?? null;

  const data: ReportDocumentData = {
    lab: { name: r.lab.name, address: r.lab.address, phone: r.lab.phone, email: r.lab.email, logoDataUri: asDataUri(r.lab.logoUrl) },
    record: { identifier: r.identifier, labNumber: r.labNumber, clinicalDiagnosis: r.clinicalDiagnosis, referringDoctor: r.doctor, isGyn: r.formType === 'Gynecology', collectionDate: r.specimenDate, registeredAt: r.createdAt },
    gyn: r.formType === 'Gynecology' ? { previousCytology: r.gynFeatures?.previousCytology ?? false, clinicalAppearanceOfCervix: r.gynFeatures?.clinicalAppearanceOfCervix ?? null, pregnancies: r.gynFeatures?.pregnancies ?? null, nowPregnant: r.gynFeatures?.nowPregnant ?? false, lmp: r.gynFeatures?.lmp ?? null, routineCheck: r.gynFeatures?.routineCheck ?? false } : null,
    cytotechnologist: cytoWriter ? `${cytoWriter.firstName} ${cytoWriter.lastName}`.trim() : null,
    patient: { firstName: r.patient.firstName, lastName: r.patient.lastName, middleName: r.patient.middleName, registrationNo: r.patient.registrationNo, age: deriveAge(r.patient.dateOfBirth), gender: r.patient.gender ?? null, bloodGroup: r.patient.bloodGroup, phoneNumber: r.patient.phoneNumber, dateOfBirth: r.patient.dateOfBirth },
    client: r.client,
    specimens: r.specimens,
    entries: sheet.resultEntries.map((e) => ({ specimenLabel: e.specimen?.label ?? e.specimen?.type ?? null, lines: e.resultLines })),
    narrative: narrative ? { content: narrative.content, medicalEntry: narrative.medicalEntry } : null,
    authorizer: { name: authorizerName, designation: sheet.authorizedBy?.authorizerDesignation ?? null, signedAt: sheet.authorizedAt ?? new Date(), signatureDataUri: asDataUri(sheet.authorizedBy?.signatureUrl) },
  };

  const printer = new PdfPrinter({ Helvetica: { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' } });
  const bytes: number = await new Promise((resolve, reject) => {
    const doc = printer.createPdfKitDocument(buildReportDefinition(data));
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks).length));
    doc.on('error', reject);
    doc.end();
  });

  console.log('\n── VERIFICATION ─────────────────────────────');
  console.log(`Record ID       : ${recordId}`);
  console.log(`Lab Number      : ${data.record.labNumber}`);
  console.log(`Patient         : ${data.patient.firstName} ${data.patient.lastName}  (${data.patient.gender}, age ${data.patient.age})`);
  console.log(`Form / GYN sect.: ${data.record.isGyn ? 'GYN — features present: ' + JSON.stringify({ appearance: data.gyn?.clinicalAppearanceOfCervix, pregnancies: data.gyn?.pregnancies, routine: data.gyn?.routineCheck }) : 'NON-GYN'}`);
  console.log(`Authorized      : ${sheet.authorized} by ${authorizerName} at ${sheet.authorizedAt?.toISOString()}`);
  console.log(`Narrative (NILM): ${data.narrative?.content ? '"' + data.narrative.content.slice(0, 60) + '..."' : 'MISSING'}`);
  console.log(`PDF rendered    : ${bytes > 0 ? `OK — ${bytes} bytes` : 'FAILED'}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
