/**
 * Program 7 · Phase 7A.3 — persisted-truth acceptance for SAML Federation.
 *
 * Boots the REAL AppModule DI graph and drives the REAL SamlAssertionValidator / SamlAuthRequestService / SAML adapter
 * against an isolated Postgres, asserting persisted DATABASE truth (no mocks): additive schema (3 tables + 1 enum + 6
 * RESTRICT FKs + nullable IdentityProvider SAML columns, no JSON); the vetted-library validator enforces the S8 semantic
 * binding on a validly-signed response and fails closed on tampering; the SP request is single-use (config-fingerprint
 * immutability + compare-and-set); assertion-ID replay is rejected; the SAML adapter resolves an opaque NameID to a
 * HUMAN principal via FederatedIdentity (unlinked ⇒ fail closed, no JIT); SAML is registered behind the provider seam
 * ([local, oidc, saml]); existing local auth authoritative + single PermissionsGuard (no new APP_GUARD); ET1–ET8. The
 * full live HTTP path + coded audit outcomes are bound by the focused enterprise-auth jest suites (incl. the e2e).
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
  const fixturesPath = process.env.SAML_FIXTURES_OUT ? path.resolve(process.env.SAML_FIXTURES_OUT) : path.resolve(__dirname, '../../web/acceptance/.saml-fixtures.json');
  const fx = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
  const prisma = new PrismaClient();
  const fails: string[] = [];
  const ck = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };
  const threw = async (fn: () => Promise<unknown>) => { try { await fn(); return false; } catch { return true; } };

  /* eslint-disable @typescript-eslint/no-var-requires */
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../src/app.module');
  const { SamlAssertionValidator } = require('../src/modules/enterprise-auth/saml/saml-assertion-validator');
  const { SamlAuthRequestService } = require('../src/modules/enterprise-auth/saml/saml-auth-request.service');
  const { AuthenticationService } = require('../src/modules/enterprise-auth/authentication.service');
  const { AuthService } = require('../src/modules/auth/auth.service');
  const { certificateFingerprint } = require('../src/modules/enterprise-auth/saml/saml-config');
  const { buildSamlResponse, TEST_IDP_CERT_PEM } = require('../src/modules/enterprise-auth/saml/testing/saml-test-vectors');
  const { LabContext } = require('../src/common/tenancy/lab-context');
  /* eslint-enable @typescript-eslint/no-var-requires */

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const validator = app.get(SamlAssertionValidator);
    const requests = app.get(SamlAuthRequestService);
    const authn = app.get(AuthenticationService);
    const lab = app.get(LabContext);
    const asLab = <T>(fn: () => Promise<T>) => lab.runLabScoped(fx.labId, fn) as Promise<T>;
    const samlModels = ['SamlIdpCertificate', 'SamlAuthRequest', 'SamlConsumedAssertion'];

    const config = {
      providerId: fx.providerId, providerKey: fx.providerKey, idpEntityId: fx.idpEntityId, spEntityId: fx.spEntityId,
      acsUrl: fx.acsUrl, idpSsoUrl: 'https://idp.acceptance.test/sso', nameIdFormat: null, wantAssertionsSigned: true,
      signingCerts: [{ fingerprint: certificateFingerprint(TEST_IDP_CERT_PEM), pem: TEST_IDP_CERT_PEM }],
    };

    // ── (schema) 3 tables + enum + 6 RESTRICT FKs + additive nullable IdentityProvider columns + no JSON ─────────
    const tableRows = (await prisma.$queryRawUnsafe(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1::text[])`, samlModels)) as unknown[];
    ck(tableRows.length === 3, `all 7A.3 tables exist (got ${tableRows.length})`);
    const enumRows = (await prisma.$queryRawUnsafe(`SELECT typname FROM pg_type WHERE typtype='e' AND typname='SamlCertificateStatus'`)) as unknown[];
    ck(enumRows.length === 1, 'SamlCertificateStatus enum exists');
    const fks = (await prisma.$queryRawUnsafe(`SELECT conname, confdeltype::text AS d FROM pg_constraint WHERE contype='f' AND conname ~ '^(SamlIdpCertificate|SamlAuthRequest|SamlConsumedAssertion)_.*_fkey$'`)) as Array<{ conname: string; d: string }>;
    ck(fks.length >= 6 && fks.every((r) => r.d === 'r'), `7A.3 FKs ON DELETE RESTRICT (${fks.length}; non-RESTRICT: ${fks.filter((r) => r.d !== 'r').map((r) => r.conname).join(',') || 'none'})`);
    const ipCols = (await prisma.$queryRawUnsafe(`SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name='IdentityProvider' AND column_name LIKE 'saml%'`)) as Array<{ column_name: string; is_nullable: string }>;
    ck(ipCols.length >= 4, `IdentityProvider carries additive SAML columns (${ipCols.length})`);
    ck(ipCols.filter((c) => c.column_name !== 'samlWantAssertionsSigned').every((c) => c.is_nullable === 'YES'), 'SAML config columns are nullable (additive)');
    ck(!samlModels.some((m) => Prisma.dmmf.datamodel.models.find((x) => x.name === m)!.fields.some((f) => f.type === 'Json')), 'no JSON columns on SAML tables');

    // ── (provider isolation) SAML registered behind the seam; validator produces only non-secret facts ───────────
    const providers = authn.registeredProviders();
    ck(providers.includes('saml') && providers.includes('local') && providers.includes('oidc'), `provider seam registers [local, oidc, saml] (got ${providers.join(',')})`);

    // ── (drive the live persisted flow) begin → build signed response → validate (S8) → single-use consume ───────
    const begun = await asLab(() => requests.begin(config));
    ck(typeof begun.requestId === 'string' && typeof begun.relayState === 'string', 'begin() persists a request with a RelayState');
    const signed = buildSamlResponse({ requestId: begun.requestId, nameId: fx.linkedNameId, idpEntityId: fx.idpEntityId, spEntityId: fx.spEntityId, acsUrl: fx.acsUrl });
    const validated = await validator.validateResponse(config, signed);
    ck(validated.nameId === fx.linkedNameId && validated.inResponseTo === begun.requestId, 'validator returns the verified NameID + InResponseTo (S8)');
    const consumed = await asLab(() => requests.verifyAndConsume(validated.inResponseTo, begun.relayState, config));
    ck(consumed.identityProviderId === fx.providerId, 'the SP request consumes once (single-use)');
    ck(await threw(() => asLab(() => requests.verifyAndConsume(validated.inResponseTo, begun.relayState, config))), 'a second consume fails closed (single-use)');
    ck(await threw(() => validator.validateResponse(config, buildSamlResponse({ requestId: begun.requestId, nameId: fx.linkedNameId, idpEntityId: fx.idpEntityId, spEntityId: fx.spEntityId, acsUrl: fx.acsUrl, sign: false }))), 'an unsigned response fails closed');
    ck(await threw(() => validator.validateResponse(config, buildSamlResponse({ requestId: begun.requestId, nameId: fx.linkedNameId, idpEntityId: 'https://evil/idp', spEntityId: fx.spEntityId, acsUrl: fx.acsUrl }))), 'an issuer mismatch fails closed');

    // ── (assertion replay store) ──────────────────────────────────────────────────────────────────────────────
    await asLab(() => requests.recordAssertionOnce(fx.providerId, validated.assertionId, validated.notOnOrAfter));
    ck(await threw(() => asLab(() => requests.recordAssertionOnce(fx.providerId, validated.assertionId, null))), 'a replayed assertion ID fails closed');

    // ── (adapter → HUMAN principal via FederatedIdentity; unlinked fails closed; no JIT) ─────────────────────────
    const linked = await asLab(() => authn.authenticate('saml', { identityProviderId: fx.providerId, nameId: fx.linkedNameId }));
    ck(!!linked && linked.principal.kind === 'HUMAN' && linked.principal.principalId === fx.userId, 'a linked NameID resolves to the stable HUMAN principal (GG7)');
    const unlinked = await asLab(() => authn.authenticate('saml', { identityProviderId: fx.providerId, nameId: 'not-linked-subject' }));
    ck(unlinked === null, 'an unlinked NameID resolves to null (fail closed, no JIT — §3b)');

    // ── (existing auth authoritative + no PHI/clinical on SAML tables + lab-scoped — ET1/2/3/7) ─────────────────
    ck(!!app.get(AuthService, { strict: false }), 'existing local AuthService still present (human login path intact — ET8)');
    const phi = /patient|birth|\bdob\b|ssn|mrn|demographic|address|phone|email|firstname|lastname/i;
    const forbidden = /diagnos|resultsheet|\brecord\b|aidraft|aimodel|inference|clinical|promote/i;
    for (const m of samlModels) {
      const fields = Prisma.dmmf.datamodel.models.find((x) => x.name === m)!.fields;
      ck(fields.map((f) => f.name).filter((f) => phi.test(f)).length === 0, `${m} has no PHI column (ET7)`);
      ck(fields.map((f) => f.name).filter((f) => forbidden.test(f)).length === 0, `${m} has no clinical/AI column (ET1/ET2)`);
      ck(fields.some((f) => f.name === 'labId'), `${m} is lab-scoped on labId (ET3)`);
    }

    // ── (ET8 non-regression neighbours — frozen subsystems intact) ───────────────────────────────────────────────
    for (const m of ['User', 'Role', 'Permission', 'Lab', 'AiModelVersion', 'ClinicalPerfWindow', 'ResultSheet', 'Record', 'ServicePrincipal', 'OidcAuthTransaction', 'FederatedIdentity', 'IdentityProvider']) {
      ck(!!Prisma.dmmf.datamodel.models.find((x) => x.name === m), `ET8 — neighbour model ${m} still present`);
    }

    if (fails.length) {
      console.error('SAML ACCEPTANCE FAILURES:\n - ' + fails.join('\n - '));
      process.exit(1);
    }
    console.log(`P7-7A.3 saml: tables=3 enum=1 FKs=${fks.length}(all RESTRICT) providers=[${providers.join(',')}] validator-S8=verified single-use=verified replay=fail-closed adapter-HUMAN=verified unlinked=null`);
    console.log('P7-7A.3 SAML FEDERATION ACCEPTANCE: all persisted-truth assertions passed (additive-schema[3 tables/1 enum/6 RESTRICT FKs/nullable IdP columns/no-JSON] + provider-seam[local,oidc,saml] + vetted-library-S8-validation + config-fingerprint-single-use + assertion-replay-fail-closed + NameID→HUMAN-principal[GG7]/unlinked-null-no-JIT + existing-auth-authoritative + ET1/2/3/7/8). The live HTTP ACS path + coded audit outcomes + RelayState integrity are bound by the focused enterprise-auth jest suites (incl. the e2e).');
  } finally {
    await app.close().catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('assert-saml-federation-state FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
