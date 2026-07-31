/**
 * Program 7 · Phase 7A.2b — persisted-truth acceptance for Service-Principal OAuth.
 *
 * Boots the REAL AppModule DI graph and drives the REAL ClientCredentialsService / credential + scope services against
 * an isolated Postgres, asserting persisted DATABASE truth (no mocks): additive schema (2 tables + 1 enum + 5 RESTRICT
 * FKs, no JSON); Argon2id hash-only storage (no plaintext persisted); the client-credentials grant issues a service
 * token (aud=service, isSuperRole=false, Permission-catalogue scopes) and fails closed (generic) for a bad secret;
 * rotation revokes the prior credential; machine-identity immutability (ServicePrincipal shape unchanged, no
 * hard-delete route); existing local auth authoritative + single PermissionsGuard; ET1–ET8. The audit outcomes + token-
 * time + crossover obligations are bound by the focused enterprise-auth jest suites. Exits non-zero on any failure.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient, Prisma } from '@prisma/client';

function assertIsolatedAcceptanceDb(): void {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required (isolated acceptance/test database).');
  const name = new URL(url).pathname.replace(/^\//, '');
  if (name === 'cytolab' || !/(test|accept)/i.test(name)) throw new Error(`Refusing "${name}": not an isolated acceptance DB.`);
}

async function main() {
  assertIsolatedAcceptanceDb();
  const fixturesPath = process.env.SERVICE_OAUTH_FIXTURES_OUT ? path.resolve(process.env.SERVICE_OAUTH_FIXTURES_OUT) : path.resolve(__dirname, '../../web/acceptance/.service-oauth-fixtures.json');
  const fx = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
  const prisma = new PrismaClient();
  const fails: string[] = [];
  const ck = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };
  const threw = async (fn: () => Promise<unknown>) => { try { await fn(); return false; } catch { return true; } };

  /* eslint-disable @typescript-eslint/no-var-requires */
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../src/app.module');
  const { ClientCredentialsService } = require('../src/modules/enterprise-auth/service-oauth/client-credentials.service');
  const { ServicePrincipalCredentialService } = require('../src/modules/enterprise-auth/service-oauth/service-principal-credential.service');
  const { ServiceTokenSigner } = require('../src/modules/enterprise-auth/service-oauth/service-token.signer');
  const { AuthService } = require('../src/modules/auth/auth.service');
  const { PermissionsGuard } = require('../src/modules/auth/guards/permissions.guard');
  const { Reflector } = require('@nestjs/core');
  const { PERMISSIONS_KEY } = require('../src/common/decorators/require-permissions.decorator');
  const { LabContext } = require('../src/common/tenancy/lab-context');
  const jwt = require('jsonwebtoken');
  /* eslint-enable @typescript-eslint/no-var-requires */

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const clientCredentials = app.get(ClientCredentialsService);
    const credentials = app.get(ServicePrincipalCredentialService);
    const signer = app.get(ServiceTokenSigner);
    const lab = app.get(LabContext);
    const asA = <T>(fn: () => Promise<T>) => lab.runLabScoped(fx.labAId, fn) as Promise<T>;
    const asB = <T>(fn: () => Promise<T>) => lab.runLabScoped(fx.labBId, fn) as Promise<T>;
    const models = ['ServicePrincipalCredential', 'ServicePrincipalScope'];

    // ── (schema) 2 tables + enum + 5 RESTRICT FKs + no JSON ────────────────────────────────────────────────────
    const tableRows = (await prisma.$queryRawUnsafe(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1::text[])`, models)) as unknown[];
    ck(tableRows.length === 2, `both 7A.2b tables exist (got ${tableRows.length})`);
    const enumRows = (await prisma.$queryRawUnsafe(`SELECT typname FROM pg_type WHERE typtype='e' AND typname='ServiceCredentialStatus'`)) as unknown[];
    ck(enumRows.length === 1, 'ServiceCredentialStatus enum exists');
    const fks = (await prisma.$queryRawUnsafe(`SELECT conname, confdeltype::text AS d FROM pg_constraint WHERE contype='f' AND conname ~ '^(ServicePrincipalCredential|ServicePrincipalScope)_.*_fkey$'`)) as Array<{ conname: string; d: string }>;
    ck(fks.length >= 5 && fks.every((r) => r.d === 'r'), `7A.2b FKs ON DELETE RESTRICT (${fks.length}; non-RESTRICT: ${fks.filter((r) => r.d !== 'r').map((r) => r.conname).join(',') || 'none'})`);
    ck(!models.some((m) => Prisma.dmmf.datamodel.models.find((x) => x.name === m)!.fields.some((f) => f.type === 'Json')), 'no JSON columns');

    // ── (Argon2id hash-only — no plaintext persisted) ─────────────────────────────────────────────────────────
    const cred = await prisma.servicePrincipalCredential.findFirst({ where: { servicePrincipalId: fx.servicePrincipalId, status: 'ACTIVE' }, select: { secretHash: true } });
    ck(!!cred && cred.secretHash.startsWith('$argon2'), 'credential stored as an Argon2id hash');
    ck(!!cred && !cred.secretHash.includes(fx.clientSecret), 'the plaintext secret is NOT persisted');

    // ── (client-credentials grant → service token; bad secret fails closed generic) ───────────────────────────
    const granted = await asA(() => clientCredentials.grant(fx.clientId, fx.clientSecret));
    ck(granted.token_type === 'Bearer' && typeof granted.access_token === 'string', 'valid credentials → a Bearer service token');
    const decoded: any = jwt.decode(granted.access_token);
    ck(decoded.aud === 'service' && decoded.scope === 'service' && decoded.type === 'access', 'token carries aud/scope/type = service (distinct from human tokens)');
    ck(decoded.isSuperRole === false && decoded.sid === undefined, 'token has isSuperRole=false and NO session id (no session)');
    ck(Array.isArray(decoded.permissions) && decoded.permissions.includes(fx.scopeCode), 'token permissions are the Permission-catalogue scopes (D5)');
    const verified = await signer.verify(granted.access_token);
    ck(verified.servicePrincipalId === fx.servicePrincipalId, 'the signer seam verifies its own token');
    ck(await threw(() => asA(() => clientCredentials.grant(fx.clientId, 'wrong-secret'))), 'a bad secret fails closed');
    ck(await threw(() => asA(() => clientCredentials.grant('unknown-client', fx.clientSecret))), 'an unknown client fails closed');

    // ── (rotation revokes the prior credential; single PermissionsGuard enforces service scopes) ──────────────
    const rotated = await asA(() => credentials.issue(fx.servicePrincipalId, null));
    ck((await prisma.servicePrincipalCredential.count({ where: { servicePrincipalId: fx.servicePrincipalId, status: 'ACTIVE' } })) === 1, 'rotation leaves exactly one ACTIVE credential');
    ck(!!rotated.secret && rotated.secret !== fx.clientSecret, 'rotation returns a NEW one-time secret');
    // the resolved permissions terminate at the EXISTING PermissionsGuard (real Reflector + real @RequirePermissions metadata)
    const guard = new PermissionsGuard(new Reflector());
    const handler = () => undefined;
    Reflect.defineMetadata(PERMISSIONS_KEY, ['record:view'], handler);
    const ctx = (perms: string[]) => ({ getHandler: () => handler, getClass: () => class {}, switchToHttp: () => ({ getRequest: () => ({ user: { kind: 'service', permissions: perms, isSuperRole: false } }) }) });
    ck(guard.canActivate(ctx(['record:view']) as any) === true, 'PermissionsGuard grants a service principal holding the scope');
    ck(await threw(async () => guard.canActivate(ctx([]) as any)), 'PermissionsGuard denies a service principal without the scope');

    // ── (cross-lab fail-closed) ───────────────────────────────────────────────────────────────────────────────
    ck(await threw(() => asB(() => credentials.issue(fx.servicePrincipalId, null))), 'cross-lab credential issuance fails closed');

    // ── (machine-identity immutability + existing-auth-authoritative + ET1/2/3/7) ─────────────────────────────
    const spScalars = Prisma.dmmf.datamodel.models.find((x) => x.name === 'ServicePrincipal')!.fields.filter((f) => f.kind === 'scalar').map((f) => f.name);
    ck(!spScalars.some((n) => /secret|hash|password/i.test(n)) && spScalars.includes('principalUuid'), 'ServicePrincipal shape unchanged (no credential state; stable principalUuid) — D1/D6');
    ck((credentials as any).delete === undefined && (credentials as any).hardDelete === undefined, 'no hard-delete route for credentials (deactivation/revocation only) — D6');
    ck(!!app.get(AuthService, { strict: false }), 'existing local AuthService still present (human login path intact)');
    const phi = /patient|birth|\bdob\b|ssn|mrn|demographic|address|phone/i;
    const forbidden = /diagnos|resultsheet|\brecord\b|aidraft|aimodel|inference|clinical|promote/i;
    for (const m of models) {
      const fields = Prisma.dmmf.datamodel.models.find((x) => x.name === m)!.fields;
      ck(fields.map((f) => f.name).filter((f) => phi.test(f)).length === 0, `${m} has no PHI column (ET7)`);
      ck(fields.map((f) => f.name).filter((f) => forbidden.test(f)).length === 0, `${m} has no clinical/AI column (ET1/ET2)`);
      ck(fields.some((f) => f.name === 'labId'), `${m} is lab-scoped on labId (ET3)`);
    }

    // ── (ET8 non-regression neighbours) ───────────────────────────────────────────────────────────────────────
    for (const m of ['User', 'Role', 'Permission', 'Lab', 'AiModelVersion', 'ClinicalPerfWindow', 'ResultSheet', 'Record', 'ServicePrincipal', 'OidcAuthTransaction']) {
      ck(!!Prisma.dmmf.datamodel.models.find((x) => x.name === m), `ET8 — neighbour model ${m} still present`);
    }

    if (fails.length) {
      console.error('SERVICE-OAUTH ACCEPTANCE FAILURES:\n - ' + fails.join('\n - '));
      process.exit(1);
    }
    console.log(`P7-7A.2b service-oauth: tables=2 enum=1 FKs=${fks.length}(all RESTRICT) argon2id-hash-only=verified grant=verified bad-secret=fail-closed rotation=verified PermissionsGuard-enforces-scopes=verified immutability=verified`);
    console.log('P7-7A.2b SERVICE-PRINCIPAL OAUTH ACCEPTANCE: all persisted-truth assertions passed (additive-schema + RESTRICT-FKs + no-JSON + Argon2id-hash-only/no-plaintext + client-credentials-grant + distinct-service-token(aud/scope/isSuperRole=false/no-sid) + Permission-catalogue-scopes + signer-seam + bad-secret/unknown-client-fail-closed + rotation-revokes-prior + single-PermissionsGuard-enforcement + cross-lab-fail-closed + machine-identity-immutability(D1/D6) + existing-local-auth-authoritative + ET1/2/3/7 + ET8-neighbours). Audit outcomes + token-time + strategy-crossover bound by the focused enterprise-auth jest suites.');
  } finally {
    await app.close().catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('assert-service-principal-oauth-state FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
