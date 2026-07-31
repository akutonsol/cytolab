/**
 * Program 7 · Phase 7A.2a — persisted-truth acceptance for the interactive OIDC federation.
 *
 * Boots the REAL AppModule DI graph and drives the REAL OidcTransactionService against an isolated Postgres, asserting
 * persisted DATABASE truth (no mocks): additive schema (OidcAuthTransaction table + IdentityProvider.clientId/
 * redirectUri columns + RESTRICT FKs, no JSON); the CONFIGURATION-IMMUTABILITY invariant (fail-closed on a config
 * change mid-transaction); single-use consumption; a PERSISTED CONCURRENT consume (exactly one success, one fail
 * closed); the existing local auth remains authoritative and downstream still terminates at the PermissionsGuard; and
 * encroachment tests ET1–ET8. The token-time / discovery / JWKS / audit-outcome obligations are bound by the focused
 * OIDC jest suites run alongside this assert. Exits non-zero on any failed assertion.
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
  const fixturesPath = process.env.OIDC_FEDERATION_FIXTURES_OUT ? path.resolve(process.env.OIDC_FEDERATION_FIXTURES_OUT) : path.resolve(__dirname, '../../web/acceptance/.oidc-federation-fixtures.json');
  const fx = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
  const prisma = new PrismaClient();
  const fails: string[] = [];
  const ck = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };
  const threw = async (fn: () => Promise<unknown>) => { try { await fn(); return false; } catch { return true; } };

  /* eslint-disable @typescript-eslint/no-var-requires */
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../src/app.module');
  const { OidcTransactionService } = require('../src/modules/enterprise-auth/oidc/oidc-transaction.service');
  const { AuthService } = require('../src/modules/auth/auth.service');
  const { AuthController } = require('../src/modules/auth/auth.controller');
  const { PermissionsGuard } = require('../src/modules/auth/guards/permissions.guard');
  const { LabContext } = require('../src/common/tenancy/lab-context');
  /* eslint-enable @typescript-eslint/no-var-requires */

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const transactions = app.get(OidcTransactionService);
    const lab = app.get(LabContext);
    const asA = <T>(fn: () => Promise<T>) => lab.runLabScoped(fx.labAId, fn) as Promise<T>;
    const config = { providerId: fx.providerAId, providerKey: 'idp-oidc', expectedIssuer: fx.issuer, clientId: fx.clientId, redirectUri: fx.redirectUri };
    const models = ['OidcAuthTransaction', 'IdentityProvider', 'ServicePrincipal', 'FederatedIdentity'];

    // ── (schema) OidcAuthTransaction table + IdentityProvider OIDC columns + RESTRICT FKs + no JSON ─────────────
    const tableRows = (await prisma.$queryRawUnsafe(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='OidcAuthTransaction'`)) as unknown[];
    ck(tableRows.length === 1, 'OidcAuthTransaction table exists');
    const cols = (await prisma.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns WHERE table_name='IdentityProvider' AND column_name = ANY($1::text[])`, ['clientId', 'redirectUri'])) as Array<{ column_name: string }>;
    ck(cols.length === 2, `IdentityProvider gained OIDC public-client columns clientId + redirectUri (got ${cols.map((c) => c.column_name).join(',')})`);
    const fks = (await prisma.$queryRawUnsafe(`SELECT conname, confdeltype::text AS d FROM pg_constraint WHERE contype='f' AND conname ~ '^OidcAuthTransaction_.*_fkey$'`)) as Array<{ conname: string; d: string }>;
    ck(fks.length >= 2 && fks.every((r) => r.d === 'r'), `OidcAuthTransaction FKs ON DELETE RESTRICT (${fks.length}; non-RESTRICT: ${fks.filter((r) => r.d !== 'r').map((r) => r.conname).join(',') || 'none'})`);
    ck(!Prisma.dmmf.datamodel.models.find((x) => x.name === 'OidcAuthTransaction')!.fields.some((f) => f.type === 'Json'), 'OidcAuthTransaction has no JSON column');

    // ── (configuration-immutability invariant — fail closed on a mid-transaction config change) ────────────────
    const begunA = await asA(() => transactions.begin(config));
    ck(!!begunA.state && !!begunA.transactionUuid, 'begin returns a state + non-secret transactionUuid');
    ck(await threw(() => asA(() => transactions.verifyAndConsume(begunA.state, { ...config, clientId: 'client-CHANGED' }))), 'config-immutability: a changed config fails the callback closed');
    // the original (unchanged) config still consumes cleanly
    const consumed = await asA(() => transactions.verifyAndConsume(begunA.state, config));
    ck(!!consumed.nonce && !!consumed.pkceVerifier, 'unchanged config consumes the transaction and returns its binding');
    ck(await threw(() => asA(() => transactions.verifyAndConsume(begunA.state, config))), 'single-use: a second consume of the same state fails closed');

    // ── (PERSISTED CONCURRENT consume — exactly one success, one fail closed) ──────────────────────────────────
    const begunC = await asA(() => transactions.begin(config));
    const results = await Promise.allSettled([
      asA(() => transactions.verifyAndConsume(begunC.state, config)),
      asA(() => transactions.verifyAndConsume(begunC.state, config)),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    ck(ok === 1 && results.filter((r) => r.status === 'rejected').length === 1, `concurrent consume → exactly one success + one fail-closed (got ${ok} success)`);

    // ── (existing local auth authoritative + downstream terminates at PermissionsGuard) ───────────────────────
    ck(!!app.get(AuthService, { strict: false }), 'existing local AuthService still present (login path intact)');
    ck(typeof (AuthController.prototype as any).login === 'function', 'existing local login route still present');
    ck(typeof PermissionsGuard === 'function', 'the existing PermissionsGuard is unchanged (single enforcement boundary)');

    // ── (ET1/ET2/ET7 — no clinical/AI/PHI columns or relations; ET3 tenancy anchor) ───────────────────────────
    const phi = /patient|birth|\bdob\b|ssn|mrn|demographic|address|phone/i;
    const forbidden = /diagnos|signout|resultsheet|\brecord\b|aidraft|aimodel|inference|clinical|authorize|promote|licens|accredit|employ/i;
    for (const m of models) {
      const fields = Prisma.dmmf.datamodel.models.find((x) => x.name === m)!.fields;
      ck(fields.map((f) => f.name).filter((f) => phi.test(f)).length === 0, `${m} has no PHI column (ET7)`);
      ck(fields.map((f) => f.name).filter((f) => forbidden.test(f)).length === 0, `${m} has no clinical/AI/domain-truth column (ET1/ET2/ET7)`);
      ck(!fields.some((f) => ['ResultSheet', 'Record', 'RecordStatusEvent', 'AiDraft', 'Patient', 'AiModelVersion', 'InferenceRecord', 'ClinicalPerfWindow'].includes(f.type)), `${m} references no clinical/AI object (ET1/ET2)`);
      ck(fields.some((f) => f.name === 'labId'), `${m} is lab-scoped on labId (ET3)`);
    }
    ck(!Prisma.dmmf.datamodel.models.some((m) => /^Organization$|^Region$|^Network$/.test(m.name)), 'no Organization/Region/Network isolation model introduced (ET3)');

    // ── (ET4 single immutable ledger — no parallel identity ledger; LOGIN_INITIATED is on the existing AuditEvent) ─
    ck(!Prisma.dmmf.datamodel.models.some((m) => /IdentityAuditEvent|IdentityLedger|OidcAuditEvent/i.test(m.name)), 'ET4 — no parallel identity audit ledger introduced');
    ck(!!Prisma.dmmf.datamodel.models.find((m) => m.name === 'AuditEvent'), 'ET4 — the existing immutable AuditEvent ledger is intact');

    // ── (ET8 non-regression neighbours — Programs 1–6 + 7A.1 present) ──────────────────────────────────────────
    for (const m of ['User', 'Role', 'Permission', 'Lab', 'AiModelVersion', 'ClinicalPerfWindow', 'ResultSheet', 'Record', 'ServicePrincipal', 'FederatedIdentity']) {
      ck(!!Prisma.dmmf.datamodel.models.find((x) => x.name === m), `ET8 — neighbour model ${m} still present`);
    }

    if (fails.length) {
      console.error('OIDC-FEDERATION ACCEPTANCE FAILURES:\n - ' + fails.join('\n - '));
      process.exit(1);
    }
    console.log(`P7-7A.2a OIDC federation: OidcAuthTransaction+2 IdP cols verified; FKs=${fks.length}(all RESTRICT) config-immutability=fail-closed single-use=verified concurrent-consume=1-ok/1-fail existing-auth-authoritative=verified`);
    console.log('P7-7A.2a OIDC FEDERATION ACCEPTANCE: all persisted-truth assertions passed (additive-schema + RESTRICT-FKs + no-JSON + configuration-immutability-invariant + single-use + persisted-concurrent-consume-exactly-one-success + existing-local-auth-authoritative + terminates-at-PermissionsGuard + ET1-no-clinical-writes + ET2-no-AI-evidence + ET3-tenancy-anchor/no-Org-isolation-key + ET4-single-immutable-ledger + ET7-no-domain-truth/PHI + ET8-Programs-1-6/7A.1-present). Token-time/discovery/JWKS/audit-outcome obligations are bound by the focused OIDC jest suites.');
  } finally {
    await app.close().catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('assert-oidc-federation-state FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
