/**
 * Program 7 · Phase 7A.2b — isolated fixtures for the Service-Principal OAuth acceptance gate.
 *
 * Two labs; lab A gets an active ServicePrincipal with an issued (Argon2id-hashed) credential and a Permission-catalogue
 * scope. Lets the assertion exercise credential storage, the client-credentials grant, scope enforcement, machine-
 * identity immutability, and the additive-schema / ET checks against real DB truth. No plaintext/PHI persisted (the
 * secret is materialized only into the fixtures file for the isolated assert). Guarded to refuse a non-isolated DB.
 */
import { randomUUID, randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const SLUG_A = 'p7-7a2b-svcoauth-acceptance-lab-a';
const SLUG_B = 'p7-7a2b-svcoauth-acceptance-lab-b';
const SCOPE_CODE = 'record:view';
const FIXTURES_OUT = process.env.SERVICE_OAUTH_FIXTURES_OUT
  ? path.resolve(process.env.SERVICE_OAUTH_FIXTURES_OUT)
  : path.resolve(__dirname, '../../web/acceptance/.service-oauth-fixtures.json');

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
        for (const t of ['ServicePrincipalScope', 'ServicePrincipalCredential', 'ServicePrincipal', 'User', 'Account']) {
          await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "labId" = $1`, prior.id);
        }
        await prisma.$executeRaw`DELETE FROM "Lab" WHERE id = ${prior.id}`;
      }
    }
    const A = (await prisma.lab.create({ data: { name: 'P7-7A2b SvcOAuth Lab A', slug: SLUG_A }, select: { id: true } })).id;
    const B = (await prisma.lab.create({ data: { name: 'P7-7A2b SvcOAuth Lab B', slug: SLUG_B }, select: { id: true } })).id;
    const sp = await prisma.servicePrincipal.create({ data: { labId: A, key: `svc-${randomUUID()}`, displayName: 'Acceptance Robot', isActive: true }, select: { id: true, key: true } });
    const secret = randomBytes(32).toString('base64url');
    await prisma.servicePrincipalCredential.create({ data: { labId: A, servicePrincipalId: sp.id, secretHash: await argon2.hash(secret), status: 'ACTIVE', rotatedAt: new Date() } });
    const permission = await prisma.permission.upsert({ where: { code: SCOPE_CODE }, update: {}, create: { code: SCOPE_CODE, label: 'view record' }, select: { id: true } });
    await prisma.servicePrincipalScope.create({ data: { labId: A, servicePrincipalId: sp.id, permissionId: permission.id } });

    const fixtures = { labAId: A, labBId: B, servicePrincipalId: sp.id, clientId: sp.key, clientSecret: secret, scopeCode: SCOPE_CODE };
    fs.mkdirSync(path.dirname(FIXTURES_OUT), { recursive: true });
    fs.writeFileSync(FIXTURES_OUT, JSON.stringify(fixtures, null, 2));
    console.log(`seeded service-oauth fixtures → ${FIXTURES_OUT}`);
    console.log(`  labA=${A} (active service principal + Argon2id credential + record:view scope) labB=${B}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('seed-service-principal-oauth-acceptance FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
