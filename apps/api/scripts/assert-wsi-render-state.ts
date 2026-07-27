/**
 * P5-4 Phase B Part 1B — DB-truth assertion for the worker-enabled full-render gate.
 *
 * Reads the published slide/generation the render gate produced (.render-result.json) and asserts, against
 * PERSISTED backend truth, that a REAL worker generation was produced and genuinely published:
 *   - the DigitalSlide is PUBLISHED and publishedGenerationId points at the READY→PUBLISHED generation
 *   - that DerivativeGeneration is status=PUBLISHED, sealed=true, verified=true
 *   - real derivative assets exist (DZI_DESCRIPTOR + TILE_PYRAMID + MANIFEST) — i.e. the worker actually tiled
 *   - the source ingestion is VERIFIED
 *
 * Isolated-DB only. Exit 0 on all-pass, 1 otherwise.
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
  const resultPath = process.env.RENDER_RESULT_PATH ? path.resolve(process.env.RENDER_RESULT_PATH) : path.resolve(__dirname, '../../web/acceptance/.render-result.json');
  const { slideId, generationId } = JSON.parse(fs.readFileSync(resultPath, 'utf8')) as { slideId: string; generationId: string };
  if (!slideId || !generationId) throw new Error('missing slideId/generationId in render result file');

  const prisma = new PrismaClient();
  const fails: string[] = [];
  try {
    const slide = await prisma.digitalSlide.findUnique({ where: { id: slideId }, select: { availabilityStatus: true, publishedGenerationId: true } });
    if (!slide) throw new Error(`slide ${slideId} not found`);
    const gen = await prisma.derivativeGeneration.findUnique({ where: { id: generationId }, select: { status: true, sealed: true, verified: true } });
    const ingestion = await prisma.slideIngestion.findFirst({ where: { slideId }, select: { status: true } });
    const roles = (await prisma.slideAsset.findMany({ where: { generationId }, select: { role: true } })).map((a) => a.role);

    console.log(`slide.availabilityStatus=${slide.availabilityStatus} publishedGenerationId=${slide.publishedGenerationId ?? 'null'}`);
    console.log(`gen.status=${gen?.status} sealed=${gen?.sealed} verified=${gen?.verified}`);
    console.log(`ingestion.status=${ingestion?.status ?? 'MISSING'} assets=[${roles.join(', ')}]`);

    if (slide.availabilityStatus !== 'PUBLISHED') fails.push(`slide not PUBLISHED (${slide.availabilityStatus})`);
    if (slide.publishedGenerationId !== generationId) fails.push(`publishedGenerationId (${slide.publishedGenerationId ?? 'null'}) != published generation ${generationId}`);
    if (!gen || gen.status !== 'PUBLISHED') fails.push(`generation not PUBLISHED (${gen?.status ?? 'MISSING'})`);
    if (!gen?.sealed || !gen?.verified) fails.push(`generation not sealed+verified (sealed=${gen?.sealed} verified=${gen?.verified})`);
    if (ingestion?.status !== 'VERIFIED') fails.push(`ingestion not VERIFIED (${ingestion?.status ?? 'MISSING'})`);
    for (const need of ['DZI_DESCRIPTOR', 'TILE_PYRAMID', 'MANIFEST']) {
      if (!roles.includes(need as never)) fails.push(`missing ${need} asset (worker did not produce a real ${need})`);
    }
  } finally {
    await prisma.$disconnect();
  }

  if (fails.length) { console.error('RENDER DB-TRUTH ASSERTION FAILED:\n  - ' + fails.join('\n  - ')); process.exit(1); }
  console.log('RENDER DB-TRUTH ASSERTIONS PASSED: real worker generation → PUBLISHED / sealed+verified / real assets');
}

main().catch((e) => { console.error('assert-wsi-render-state ERROR:', e instanceof Error ? e.message : e); process.exit(1); });
