/**
 * P5-4 Phase B Part 1 — DB-truth assertion for the upload gate.
 *
 * Reads the slideId the browser gate created (.upload-result.json) and asserts, against PERSISTED backend
 * truth, that the slide came through the ingestion pipeline and stopped exactly where it should with the
 * worker off:
 *   - the DigitalSlide is DRAFT, slideUrl='' , sourceKind='UPLOAD'  (ingestion path, not legacy paste)
 *   - its SlideIngestion is VERIFIED
 *   - a SlideProcessingJob is QUEUED (worker off → it stays queued; NOT failed)
 *   - NO DerivativeGeneration exists yet and publishedGenerationId is null (not viewable)
 *
 * Isolated-DB only (same fail-closed guard). Exit 0 on all-pass, 1 otherwise.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';

function assertIsolatedAcceptanceDb(): void {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required (isolated acceptance/test database).');
  const name = new URL(url).pathname.replace(/^\//, '');
  if (name === 'cytolab' || !/(test|accept)/i.test(name)) throw new Error(`Refusing "${name}": not an isolated acceptance DB.`);
}

async function main() {
  assertIsolatedAcceptanceDb();
  const resultPath = process.env.UPLOAD_RESULT_PATH
    ? path.resolve(process.env.UPLOAD_RESULT_PATH)
    : path.resolve(__dirname, '../../web/acceptance/.upload-result.json');
  const { slideId } = JSON.parse(fs.readFileSync(resultPath, 'utf8')) as { slideId: string };
  if (!slideId) throw new Error('no slideId in upload result file');

  const prisma = new PrismaClient();
  const fails: string[] = [];
  try {
    const slide = await prisma.digitalSlide.findUnique({ where: { id: slideId }, select: { availabilityStatus: true, slideUrl: true, sourceKind: true, publishedGenerationId: true } });
    if (!slide) throw new Error(`slide ${slideId} not found`);
    const ingestion = await prisma.slideIngestion.findFirst({ where: { slideId }, select: { id: true, status: true } });
    const job = ingestion ? await prisma.slideProcessingJob.findFirst({ where: { ingestionId: ingestion.id }, select: { status: true } }) : null;
    const genCount = await prisma.derivativeGeneration.count({ where: { slideId } });

    console.log(`slide.availabilityStatus=${slide.availabilityStatus} slideUrl="${slide.slideUrl}" sourceKind=${slide.sourceKind} published=${slide.publishedGenerationId ?? 'null'}`);
    console.log(`ingestion.status=${ingestion?.status ?? 'MISSING'} job.status=${job?.status ?? 'NONE'} generations=${genCount}`);

    if (slide.availabilityStatus !== 'DRAFT') fails.push(`slide not DRAFT (${slide.availabilityStatus})`);
    if (slide.slideUrl !== '') fails.push(`slideUrl not empty — looks like the paste path was used ("${slide.slideUrl}")`);
    if (slide.sourceKind !== 'UPLOAD') fails.push(`sourceKind not UPLOAD (${slide.sourceKind})`);
    if (slide.publishedGenerationId) fails.push('publishedGenerationId is set (should be null — not viewable)');
    if (!ingestion || ingestion.status !== 'VERIFIED') fails.push(`ingestion not VERIFIED (${ingestion?.status ?? 'MISSING'})`);
    if (!job || job.status !== 'QUEUED') fails.push(`processing job not QUEUED (${job?.status ?? 'NONE'})`);
    if (genCount !== 0) fails.push(`unexpected DerivativeGeneration rows (${genCount}) — worker should be OFF`);
  } finally {
    await prisma.$disconnect();
  }

  if (fails.length) { console.error('DB-TRUTH ASSERTION FAILED:\n  - ' + fails.join('\n  - ')); process.exit(1); }
  console.log('DB-TRUTH ASSERTIONS PASSED: ingestion path → VERIFIED / DRAFT / QUEUED / not-viewable');
}

main().catch((e) => { console.error('assert-wsi-upload-state ERROR:', e instanceof Error ? e.message : e); process.exit(1); });
