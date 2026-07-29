/**
 * Program 6 · Phase 6A — isolated fixtures for the AI-registry acceptance gate.
 *
 * Seeds exactly two labs (A and B) so the assertion can prove lab-scoped registry behaviour and cross-lab
 * fail-closed access. The registry needs no records/slides (the InferenceRecord shell is inert in 6A), so this
 * seeder is deliberately minimal. Guarded to refuse a non-isolated database.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';

const SLUG_A = 'p6-ai-acceptance-lab-a';
const SLUG_B = 'p6-ai-acceptance-lab-b';
const FIXTURES_OUT = process.env.AI_INFRA_FIXTURES_OUT
  ? path.resolve(process.env.AI_INFRA_FIXTURES_OUT)
  : path.resolve(__dirname, '../../web/acceptance/.ai-infra-fixtures.json');

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
        for (const t of ['AiModelLifecycleEvent', 'InferenceRecord', 'AiModelVersion', 'AiModel']) {
          await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "labId" = $1`, prior.id);
        }
        await prisma.$executeRaw`DELETE FROM "Lab" WHERE id = ${prior.id}`;
      }
    }
    const A = await prisma.lab.create({ data: { name: 'P6 AI Acceptance Lab A', slug: SLUG_A }, select: { id: true } });
    const B = await prisma.lab.create({ data: { name: 'P6 AI Acceptance Lab B', slug: SLUG_B }, select: { id: true } });
    const fixtures = { labAId: A.id, labBId: B.id };
    fs.mkdirSync(path.dirname(FIXTURES_OUT), { recursive: true });
    fs.writeFileSync(FIXTURES_OUT, JSON.stringify(fixtures, null, 2));
    console.log(`seeded AI-infra fixtures → ${FIXTURES_OUT}`);
    console.log(`  labA=${A.id} labB=${B.id}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('seed-ai-infra-acceptance FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
