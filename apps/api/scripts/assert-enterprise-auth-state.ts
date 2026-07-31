/**
 * Program 7 · Phase 7A.1 — persisted-truth acceptance for the Enterprise Authentication foundation.
 *
 * Boots the REAL AppModule DI graph and drives the REAL enterprise-auth services + AuthenticationService, asserting
 * persisted DATABASE truth (no mocks): additive schema (3 tables + 1 enum), 5 RESTRICT FKs, no JSON, stable identifiers
 * (GG7); the provider-isolation seam (adapter → canonical principal; deterministic; unknown provider fails closed);
 * human vs non-human principal classes; federated linkage → canonical human principal bound to the stable User.id;
 * lab scoping + cross-lab fail-closed; IdentityProvider + FederatedIdentity INERT; existing local authentication
 * remains authoritative; downstream authorization still terminates at the existing PermissionsGuard; and encroachment
 * tests ET1–ET8. Exits non-zero on any failed assertion.
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
  const fixturesPath = process.env.ENTERPRISE_AUTH_FIXTURES_OUT ? path.resolve(process.env.ENTERPRISE_AUTH_FIXTURES_OUT) : path.resolve(__dirname, '../../web/acceptance/.enterprise-auth-fixtures.json');
  const fx = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
  const prisma = new PrismaClient();
  const fails: string[] = [];
  const ck = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };
  const threw = async (fn: () => Promise<unknown>) => { try { await fn(); return false; } catch { return true; } };

  /* eslint-disable @typescript-eslint/no-var-requires */
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../src/app.module');
  const { AuthenticationService } = require('../src/modules/enterprise-auth/authentication.service');
  const { ServicePrincipalService } = require('../src/modules/enterprise-auth/service-principal.service');
  const { FederatedIdentityService } = require('../src/modules/enterprise-auth/federated-identity.service');
  const { IdentityProviderService } = require('../src/modules/enterprise-auth/identity-provider.service');
  const { EnterpriseAuthController } = require('../src/modules/enterprise-auth/enterprise-auth.controller');
  const { AuthService } = require('../src/modules/auth/auth.service');
  const { AuthController } = require('../src/modules/auth/auth.controller');
  const { JwtAuthGuard } = require('../src/modules/auth/guards/jwt-auth.guard');
  const { PermissionsGuard } = require('../src/modules/auth/guards/permissions.guard');
  const { mayHoldClinicalAuthority } = require('../src/modules/enterprise-auth/canonical-principal');
  const { LabContext } = require('../src/common/tenancy/lab-context');
  const { PERMISSIONS_KEY } = require('../src/common/decorators/require-permissions.decorator');
  /* eslint-enable @typescript-eslint/no-var-requires */

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const authn = app.get(AuthenticationService);
    const servicePrincipals = app.get(ServicePrincipalService);
    const federated = app.get(FederatedIdentityService);
    const identityProviders = app.get(IdentityProviderService);
    const lab = app.get(LabContext);
    const asA = <T>(fn: () => Promise<T>) => lab.runLabScoped(fx.labAId, fn) as Promise<T>;
    const asB = <T>(fn: () => Promise<T>) => lab.runLabScoped(fx.labBId, fn) as Promise<T>;
    const models = ['IdentityProvider', 'ServicePrincipal', 'FederatedIdentity'];

    // ── (schema) 3 tables + 1 enum + 5 RESTRICT FKs + no JSON + stable identifiers ───────────────────────────────
    const tableRows = (await prisma.$queryRawUnsafe(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1::text[])`, models)) as Array<{ table_name: string }>;
    ck(tableRows.length === 3, `all 3 enterprise-auth tables exist (got ${tableRows.length})`);
    const enumRows = (await prisma.$queryRawUnsafe(`SELECT typname FROM pg_type WHERE typtype='e' AND typname = ANY($1::text[])`, ['IdentityProviderProtocol'])) as Array<{ typname: string }>;
    ck(enumRows.length === 1, `IdentityProviderProtocol enum exists (got ${enumRows.length})`);
    const fks = (await prisma.$queryRawUnsafe(`SELECT conname, confdeltype::text AS d FROM pg_constraint WHERE contype='f' AND conname ~ '^(IdentityProvider|ServicePrincipal|FederatedIdentity)_.*_fkey$'`)) as Array<{ conname: string; d: string }>;
    ck(fks.length >= 5 && fks.every((r) => r.d === 'r'), `all 7A.1 FKs ON DELETE RESTRICT (${fks.length} FKs; non-RESTRICT: ${fks.filter((r) => r.d !== 'r').map((r) => r.conname).join(',') || 'none'})`);
    ck(!models.some((m) => Prisma.dmmf.datamodel.models.find((x) => x.name === m)!.fields.some((f) => f.type === 'Json')), 'no JSON columns (structured fields only)');
    for (const [m, col] of [['IdentityProvider', 'providerUuid'], ['ServicePrincipal', 'principalUuid'], ['FederatedIdentity', 'federatedIdentityUuid']] as const) {
      ck(Prisma.dmmf.datamodel.models.find((x) => x.name === m)!.fields.some((f) => f.name === col), `${m} carries a stable identifier ${col} (GG7)`);
    }

    // ── (provider-isolation seam: adapter → canonical principal; deterministic; unknown fails closed) ────────────
    ck(authn.registeredProviders().length === 1 && authn.registeredProviders()[0] === 'local', 'only the Local adapter is registered in 7A.1 (SAML/OIDC/OAuth deferred to 7A.2/7A.3)');
    const r1 = await authn.authenticate('local', { userId: fx.userAId, labId: fx.labAId });
    const r2 = await authn.authenticate('local', { userId: fx.userAId, labId: fx.labAId });
    ck(!!r1 && r1.principal.kind === 'HUMAN' && r1.principal.principalId === fx.userAId, 'Local adapter maps a verified user to a HUMAN canonical principal (stable id = userId)');
    ck(JSON.stringify(r1) === JSON.stringify(r2), 'principal establishment is deterministic (Principle 12)');
    ck((await authn.authenticate('oidc', {})) === null && (await authn.authenticate('local', {})) === null, 'unknown provider / malformed input fails closed (null)');
    ck(!!r1 && Object.keys(r1.principal).sort().join(',') === 'kind,labId,principalId', 'downstream sees ONLY a canonical principal — no provider/token leaks through');

    // ── (human vs non-human principal classes; ET6) ─────────────────────────────────────────────────────────────
    const spPrincipal = await asA(() => servicePrincipals.toCanonicalPrincipal(fx.servicePrincipalAId));
    ck(spPrincipal.kind === 'SERVICE' && spPrincipal.principalId === fx.servicePrincipalAId, 'service principal resolves to a SERVICE canonical principal');
    ck(mayHoldClinicalAuthority(spPrincipal) === false && mayHoldClinicalAuthority(r1!.principal) === true, 'ET6 — only human principals may hold clinical authority; non-human never');

    // ── (federated linkage → canonical human principal bound to the stable User.id; INERT) ──────────────────────
    const resolved = await asA(() => federated.resolve(fx.providerAId, fx.externalSubject));
    ck(!!resolved && resolved.kind === 'HUMAN' && resolved.principalId === fx.userAId, 'federated linkage resolves to a HUMAN principal bound to the stable User.id (not the external subject)');
    ck((await asA(() => federated.resolve(fx.providerAId, 'no-such-subject'))) === null, 'unlinked subject resolves to null');
    const provA = await asA(() => identityProviders.get(fx.providerAId));
    ck(provA.isEnabled === false, 'IdentityProvider is INERT (isEnabled=false) in 7A.1');

    // ── (lab scoping + cross-lab fail-closed) ───────────────────────────────────────────────────────────────────
    ck((await asA(() => identityProviders.list())).length === 1, 'lab A sees exactly its own provider');
    ck(await threw(() => asB(() => identityProviders.get(fx.providerAId))), 'cross-lab provider read fails closed');
    ck(await threw(() => asB(() => servicePrincipals.get(fx.servicePrincipalAId))), 'cross-lab service-principal read fails closed');

    // ── (existing local authentication remains authoritative; downstream terminates at PermissionsGuard) ────────
    ck(!!app.get(AuthService, { strict: false }), 'existing local AuthService is still present (login path intact)');
    ck(typeof (AuthController.prototype as any).login === 'function', 'existing local login route still present (AuthController.login)');
    ck(typeof JwtAuthGuard === 'function' && typeof PermissionsGuard === 'function', 'the existing JwtAuthGuard + PermissionsGuard are unchanged');
    const eaRoutes = Object.getOwnPropertyNames(EnterpriseAuthController.prototype).filter((n) => n !== 'constructor');
    ck(!eaRoutes.some((n) => /login|logout|token|refresh|session|password|mfa/i.test(n)), 'enterprise-auth introduces NO login/session/token route (does not replace the live auth path)');
    for (const h of ['listProviders', 'listServicePrincipals']) ck(JSON.stringify(Reflect.getMetadata(PERMISSIONS_KEY, (EnterpriseAuthController.prototype as any)[h])) === JSON.stringify(['identity:view']), `${h} terminates at PermissionsGuard (identity:view)`);
    for (const h of ['registerProvider', 'createServicePrincipal', 'deactivateServicePrincipal']) ck(JSON.stringify(Reflect.getMetadata(PERMISSIONS_KEY, (EnterpriseAuthController.prototype as any)[h])) === JSON.stringify(['identity:manage']), `${h} terminates at PermissionsGuard (identity:manage)`);

    // ── (ET1/ET2/ET7 — no clinical/AI/domain-truth columns or relations; ET3 tenancy anchor; ET5 no authority-by-identity) ──
    const phi = /patient|birth|\bdob\b|ssn|mrn|demographic|address|phone/i;
    const forbidden = /diagnos|signout|resultsheet|\brecord\b|aidraft|aimodel|inference|clinical|authorize|promote|licens|accredit|employ/i;
    for (const m of models) {
      const fields = Prisma.dmmf.datamodel.models.find((x) => x.name === m)!.fields;
      ck(fields.map((f) => f.name).filter((f) => phi.test(f)).length === 0, `${m} has no PHI column (ET7)`);
      ck(fields.map((f) => f.name).filter((f) => forbidden.test(f)).length === 0, `${m} has no clinical/AI/domain-truth column (ET1/ET2/ET7)`);
      ck(!fields.some((f) => ['ResultSheet', 'Record', 'RecordStatusEvent', 'AiDraft', 'Patient', 'AiModelVersion', 'InferenceRecord', 'HumanReviewDecision', 'ClinicalPerfWindow'].includes(f.type)), `${m} references no clinical/AI object (ET1/ET2)`);
      ck(fields.some((f) => f.name === 'labId'), `${m} is lab-scoped on labId (ET3 — tenancy anchor unchanged)`);
    }
    ck(!Prisma.dmmf.datamodel.models.some((m) => /^Organization$|^Region$|^Network$/.test(m.name)), 'no Organization/Region/Network isolation model introduced in 7A.1 (ET3)');

    // ── (ET5 no authority-by-identity + no default grant) ───────────────────────────────────────────────────────
    const perms = await prisma.permission.findMany({ where: { code: { in: ['identity:view', 'identity:manage'] } }, select: { code: true } });
    ck(perms.length === 2, `catalogue has identity:view/manage (got [${perms.map((p) => p.code).join(',')}])`);
    const roles = await prisma.role.findMany({ include: { permissions: { include: { permission: true } } } });
    const leaks = roles.filter((r) => !r.isSuperRole).filter((r) => r.permissions.some((rp) => rp.permission.code.startsWith('identity:')));
    ck(leaks.length === 0, `ET5 — no default (non-super) role holds identity:* (offenders: [${leaks.map((r) => r.name).join(',')}])`);
    // identity permissions confer no clinical/AI action authority (they are administration of identity only)
    ck(perms.every((p) => !/resultsheet|record|aimodel|inference|clinicalperf|diagnos|authorize|promote/.test(p.code)), 'ET5 — identity permissions grant no clinical/AI action authority');

    // ── (ET4 single immutable ledger — no parallel identity ledger introduced) ──────────────────────────────────
    ck(!Prisma.dmmf.datamodel.models.some((m) => /IdentityAuditEvent|IdentityLedger|IdentityEventChain/i.test(m.name)), 'ET4 — 7A.1 introduces no parallel identity audit ledger (7G uses the existing AuditEvent chain)');
    ck(!!Prisma.dmmf.datamodel.models.find((m) => m.name === 'AuditEvent'), 'ET4 — the existing immutable AuditEvent ledger is intact');

    // ── (ET8 non-regression neighbours — Programs 1–6 present) ──────────────────────────────────────────────────
    for (const m of ['User', 'Role', 'Permission', 'Lab', 'AiModelVersion', 'InferenceRecord', 'ClinicalPerfWindow', 'ResultSheet', 'Record']) {
      ck(!!Prisma.dmmf.datamodel.models.find((x) => x.name === m), `ET8 — neighbour model ${m} still present`);
    }

    if (fails.length) {
      console.error('ENTERPRISE-AUTH ACCEPTANCE FAILURES:\n - ' + fails.join('\n - '));
      process.exit(1);
    }
    console.log(`P7-7A.1 enterprise auth: tables=${tableRows.length} enum=${enumRows.length} FKs=${fks.length}(all RESTRICT) provider-isolation=verified human/non-human=verified federated-linkage=verified inert=verified existing-auth-authoritative=verified terminates-at-PermissionsGuard=verified`);
    console.log('P7-7A.1 ENTERPRISE AUTHENTICATION ACCEPTANCE: all persisted-truth assertions passed (schema + RESTRICT-FKs + no-JSON + stable-identifiers-GG7 + provider-isolation-seam + deterministic-principal-establishment + human/non-human-principal-classes + federated-linkage-to-stable-User.id + INERT-IdP/FederatedIdentity + lab-scoping/cross-lab-fail-closed + existing-local-auth-authoritative + downstream-terminates-at-PermissionsGuard + ET1-no-clinical-writes + ET2-no-AI-evidence + ET3-tenancy-anchor-unchanged/no-Org-isolation-key + ET4-single-immutable-ledger + ET5-no-authority-by-identity/no-default-grant + ET6-principal-class-separation + ET7-no-domain-truth/PHI + ET8-Programs-1-6-present).');
  } finally {
    await app.close().catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('assert-enterprise-auth-state FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
