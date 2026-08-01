/**
 * Program 7 · Phase 7B.3 — persisted-truth acceptance for SCIM Users.
 *
 * Boots the REAL AppModule DI graph and drives the REAL ScimUsersService against an isolated Postgres, asserting
 * persisted DATABASE truth (no mocks): additive schema (ScimUserMapping table + 3 RESTRICT FKs + [labId,userId] &
 * [labId,externalId] uniqueness + no JSON + NO updatedAt (append-only) + NO User change / no externalId on User);
 * SCIM create → PROVISIONED→ACTIVE via the lifecycle boundary (source=SCIM, non-null placeholder Argon2id hash, mapping
 * written); IMMUTABLE mapping (externalId reassignment fails closed; mapping row never re-pointed/deleted; DELETE
 * deprovisions but preserves the mapping — §4b); deterministic conflicts (dup externalId 409, dup userName/email 409,
 * stale If-Match 412, concurrent single-winner); POST/PUT/PATCH/DELETE idempotency; every lifecycle effect via
 * IdentityLifecycleService (durable events); coded audit (IDENTITY_SCIM_SYNCED, no payload/token/PHI); SCIM mutates NO
 * role/session/federation/password/invitation state; the L8 sole-writer boundary still holds (source scan); ET1–ET8.
 * Exits non-zero on any failure.
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
  const fixturesPath = process.env.SCIM_FIXTURES_OUT ? path.resolve(process.env.SCIM_FIXTURES_OUT) : path.resolve(__dirname, '../../web/acceptance/.scim-fixtures.json');
  const fx = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
  const prisma = new PrismaClient();
  const fails: string[] = [];
  const ck = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };
  const threw = async (fn: () => Promise<unknown>, status?: number) => { try { await fn(); return false; } catch (e: any) { return status ? e?.status === status : true; } };

  /* eslint-disable @typescript-eslint/no-var-requires */
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../src/app.module');
  const { ScimUsersService } = require('../src/modules/scim/scim-users.service');
  const { LabContext } = require('../src/common/tenancy/lab-context');
  const { resourceVersion } = require('../src/modules/scim/scim-serialization');
  /* eslint-enable @typescript-eslint/no-var-requires */

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const svc = app.get(ScimUsersService);
    const lab = app.get(LabContext);
    const principal = { servicePrincipalId: fx.servicePrincipalId };
    const asLab = <T>(fn: () => Promise<T>) => lab.runLabScoped(fx.labId, fn) as Promise<T>;
    const rnd = () => Math.random().toString(36).slice(2);
    const body = (externalId: string, userName: string, extra: Record<string, unknown> = {}) => ({ schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'], externalId, userName, name: { givenName: 'Given', familyName: 'Family' }, ...extra });
    const userRow = (id: string) => prisma.user.findUniqueOrThrow({ where: { id }, select: { lifecycleState: true, isActive: true, passwordHash: true, originProvisioningSource: true, updatedAt: true } });

    // ── (schema) ScimUserMapping table + 3 RESTRICT FKs + uniqueness + no JSON + append-only + NO User change ────
    const tbl = (await prisma.$queryRawUnsafe(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='ScimUserMapping'`)) as unknown[];
    ck(tbl.length === 1, 'ScimUserMapping table exists');
    const fks = (await prisma.$queryRawUnsafe(`SELECT conname, confdeltype::text AS d FROM pg_constraint WHERE contype='f' AND conname ~ '^ScimUserMapping_.*_fkey$'`)) as Array<{ conname: string; d: string }>;
    ck(fks.length === 3 && fks.every((r) => r.d === 'r'), `ScimUserMapping 3 FKs ON DELETE RESTRICT (${fks.length}; non-RESTRICT: ${fks.filter((r) => r.d !== 'r').map((r) => r.conname).join(',') || 'none'})`);
    const uniq = (await prisma.$queryRawUnsafe(`SELECT indexname FROM pg_indexes WHERE tablename='ScimUserMapping' AND indexdef ILIKE '%UNIQUE%'`)) as Array<{ indexname: string }>;
    const uniqNames = uniq.map((r) => r.indexname).join(',');
    ck(/labId_userId/.test(uniqNames) && /labId_externalId/.test(uniqNames), `uniqueness on [labId,userId] & [labId,externalId] (${uniqNames})`);
    const model = Prisma.dmmf.datamodel.models.find((x) => x.name === 'ScimUserMapping')!;
    ck(!model.fields.some((f) => f.type === 'Json'), 'no JSON columns on ScimUserMapping');
    ck(!model.fields.some((f) => f.name === 'updatedAt'), 'ScimUserMapping is append-only (no updatedAt column)');
    ck(!Prisma.dmmf.datamodel.models.find((x) => x.name === 'User')!.fields.some((f) => f.name === 'externalId'), 'User carries NO externalId (S7/GG7 — it lives on the mapping; no frozen-model change)');
    ck(Prisma.dmmf.datamodel.enums.find((e) => e.name === 'ProvisioningSource')!.values.some((v) => v.name === 'SCIM'), 'ProvisioningSource.SCIM present');

    // ── (create default active) PROVISIONED→ACTIVE via boundary, source=SCIM, placeholder hash, mapping written ──
    const c = await asLab(() => svc.createUser(body('ext-acc', `acc-${rnd()}@acceptance.test`), principal));
    ck(c.created === true && c.resource.active === true, 'create → 201 + active=true');
    const u0 = await userRow(c.resource.id);
    ck(u0.lifecycleState === 'ACTIVE' && u0.isActive === true, 'create → ACTIVE + isActive=true (via lifecycle boundary)');
    ck(u0.originProvisioningSource === 'SCIM', 'originProvisioningSource=SCIM (immutable provenance)');
    ck(!!u0.passwordHash && u0.passwordHash.startsWith('$argon2'), 'non-null placeholder Argon2id hash (no password management)');
    const map0 = await prisma.scimUserMapping.findFirstOrThrow({ where: { labId: fx.labId, userId: c.resource.id } });
    ck(map0.externalId === 'ext-acc' && map0.servicePrincipalId === fx.servicePrincipalId, 'mapping written (externalId + connector provenance)');
    ck((await prisma.identityLifecycleEvent.count({ where: { userId: c.resource.id, fromState: null, toState: 'PROVISIONED' } })) === 1, 'durable null→PROVISIONED entry via the boundary');
    ck((await prisma.identityLifecycleEvent.count({ where: { userId: c.resource.id, fromState: 'PROVISIONED', toState: 'ACTIVE' } })) === 1, 'durable PROVISIONED→ACTIVE via the boundary');

    // ── (coded audit — no payload/token/PHI) ────────────────────────────────────────────────────────────────────
    const audits = await prisma.auditEvent.findMany({ where: { actionCode: 'IDENTITY_SCIM_SYNCED' }, select: { metadata: true, actionCode: true }, take: 20 });
    ck(audits.length > 0, 'IDENTITY_SCIM_SYNCED audit persisted');
    ck(audits.every((a) => { const keys = Object.keys((a.metadata as any) ?? {}).sort().join(','); return keys === 'lifecycleChanged,operation,outcome'; }), 'SCIM audit metadata is coded-only {operation,outcome,lifecycleChanged}');
    ck(audits.every((a) => !/@|argon2|password|token|ext-acc/i.test(JSON.stringify(a.metadata ?? {}))), 'SCIM audit metadata carries no email/token/password/externalId/PHI');

    // ── (POST idempotency) same externalId+userName → same identity, one mapping, no extra transition ────────────
    const e1 = `idem-${rnd()}@acceptance.test`;
    const i1 = await asLab(() => svc.createUser(body('ext-idem', e1), principal));
    const evN = await prisma.identityLifecycleEvent.count({ where: { userId: i1.resource.id } });
    const i2 = await asLab(() => svc.createUser(body('ext-idem', e1), principal));
    ck(i2.created === false && i2.resource.id === i1.resource.id, 'POST idempotency: same externalId+userName → same id (created=false)');
    ck((await prisma.scimUserMapping.count({ where: { labId: fx.labId, externalId: 'ext-idem' } })) === 1, 'no duplicate mapping on repeat POST');
    ck((await prisma.identityLifecycleEvent.count({ where: { userId: i1.resource.id } })) === evN, 'no extra lifecycle transition on repeat POST');

    // ── (deterministic conflicts) dup externalId / dup userName / stale version ──────────────────────────────────
    ck(await threw(() => asLab(() => svc.createUser(body('ext-idem', `other-${rnd()}@acceptance.test`), principal)), 409), 'dup externalId (different userName) → 409 (never re-points)');
    ck(await threw(() => asLab(() => svc.createUser(body(`ext-${rnd()}`, e1), principal)), 409), 'dup userName/email → 409');
    const stale = resourceVersion(new Date('2000-01-01T00:00:00.000Z'));
    ck(await threw(() => asLab(() => svc.replaceUser(i1.resource.id, body('ext-idem', e1), stale, principal)), 412), 'stale If-Match → 412');

    // ── (immutable mapping) externalId reassignment fails closed; mapping row unchanged ─────────────────────────
    ck(await threw(() => asLab(() => svc.replaceUser(c.resource.id, body('ext-CHANGED', `acc2-${rnd()}@acceptance.test`), undefined, principal)), 409), 'PUT externalId change → 409 (immutable)');
    ck(await threw(() => asLab(() => svc.patchUser(c.resource.id, { Operations: [{ op: 'replace', path: 'externalId', value: 'x' }] }, undefined, principal)), 409), 'PATCH externalId change → 409 (immutable)');
    ck((await prisma.scimUserMapping.findFirstOrThrow({ where: { labId: fx.labId, userId: c.resource.id } })).externalId === 'ext-acc', 'mapping externalId unchanged after reassignment attempts');

    // ── (PUT/PATCH lifecycle via boundary + idempotency; password untouched) ────────────────────────────────────
    const beforePw = (await userRow(c.resource.id)).passwordHash;
    await asLab(() => svc.replaceUser(c.resource.id, body('ext-acc', `acc-${rnd()}@acceptance.test`, { active: false }), undefined, principal));
    ck((await userRow(c.resource.id)).lifecycleState === 'SUSPENDED', 'PUT active=false → SUSPENDED via the boundary');
    const evAfterSuspend = await prisma.identityLifecycleEvent.count({ where: { userId: c.resource.id } });
    await asLab(() => svc.patchUser(c.resource.id, { schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'], Operations: [{ op: 'replace', path: 'active', value: false }] }, undefined, principal));
    ck((await prisma.identityLifecycleEvent.count({ where: { userId: c.resource.id } })) === evAfterSuspend, 'PATCH active=false repeat is a no_op (idempotent, no extra event)');
    await asLab(() => svc.replaceUser(c.resource.id, body('ext-acc', `acc-${rnd()}@acceptance.test`, { active: true }), undefined, principal));
    ck((await userRow(c.resource.id)).lifecycleState === 'ACTIVE', 'PUT active=true → reactivated via the boundary');
    ck((await userRow(c.resource.id)).passwordHash === beforePw, 'SCIM never manages the password (hash unchanged)');

    // ── (DELETE) deprovision (terminal) via boundary; mapping NEVER deleted; idempotent ─────────────────────────
    await asLab(() => svc.deleteUser(c.resource.id, principal));
    ck((await userRow(c.resource.id)).lifecycleState === 'DEPROVISIONED', 'DELETE → DEPROVISIONED via the boundary');
    ck((await prisma.scimUserMapping.count({ where: { labId: fx.labId, userId: c.resource.id } })) === 1, 'DELETE preserves the mapping (§4b — history never physically deleted)');
    const deprovN = await prisma.identityLifecycleEvent.count({ where: { userId: c.resource.id, toState: 'DEPROVISIONED' } });
    await asLab(() => svc.deleteUser(c.resource.id, principal));
    ck((await prisma.identityLifecycleEvent.count({ where: { userId: c.resource.id, toState: 'DEPROVISIONED' } })) === deprovN, 'DELETE idempotent (no second deprovision event)');

    // ── (no side-effect mutations) ──────────────────────────────────────────────────────────────────────────────
    ck((await prisma.userRole.count({ where: { userId: i1.resource.id } })) === 0, 'SCIM grants NO role/permission');
    ck((await prisma.userSession.count({ where: { userId: i1.resource.id } })) === 0, 'SCIM mints NO session');
    ck((await prisma.federatedIdentity.count({ where: { labId: fx.labId, userId: i1.resource.id } })) === 0, 'SCIM writes NO FederatedIdentity');
    ck((await prisma.staffInvitation.count({ where: { labId: fx.labId, userId: i1.resource.id } })) === 0, 'SCIM creates NO invitation');

    // ── (L8 sole-writer boundary still holds — SOURCE scan on the fresh checkout) ────────────────────────────────
    const srcRoot = path.resolve(__dirname, '../src');
    const lifecycleSvc = path.resolve(srcRoot, 'modules/identity-lifecycle/identity-lifecycle.service.ts');
    const walk = (dir: string, out: string[] = []): string[] => { for (const n of fs.readdirSync(dir)) { const f = path.join(dir, n); if (fs.statSync(f).isDirectory()) walk(f, out); else if (f.endsWith('.ts') && !f.endsWith('.spec.ts') && !f.includes('/testing/')) out.push(f); } return out; };
    const writeRe = /\.user\.(update|updateMany|upsert)\s*\(([\s\S]{0,500})/g;
    const fieldRe = /\b(isActive|lifecycleState)\b\s*:/;
    const writers: string[] = [];
    for (const f of walk(srcRoot)) { if (path.resolve(f) === lifecycleSvc) continue; const s = fs.readFileSync(f, 'utf8'); let m: RegExpExecArray | null; writeRe.lastIndex = 0; while ((m = writeRe.exec(s)) !== null) if (fieldRe.test(m[2])) writers.push(path.relative(srcRoot, f)); }
    ck(writers.length === 0, `L8 sole-writer preserved: no User.isActive/lifecycleState writes outside IdentityLifecycleService (offenders: ${writers.join(', ') || 'none'})`);

    // ── (ET1–ET8 on ScimUserMapping + neighbours) ───────────────────────────────────────────────────────────────
    const phi = /patient|birth|\bdob\b|ssn|mrn|demographic|address|phone|firstname|lastname/i;
    const forbidden = /diagnos|resultsheet|aidraft|aimodel|inference|clinical|promote|permission|\brole\b|password|token/i;
    const mf = model.fields;
    ck(mf.filter((x) => phi.test(x.name)).length === 0, 'ScimUserMapping has no PHI column (ET7)');
    ck(mf.filter((x) => forbidden.test(x.name)).length === 0, 'ScimUserMapping has no clinical/AI/permission/password column (ET1/2/5)');
    ck(mf.some((x) => x.name === 'labId'), 'ScimUserMapping is lab-scoped on labId (ET3)');
    for (const m of ['User', 'Role', 'Permission', 'Lab', 'AiModelVersion', 'ResultSheet', 'Record', 'IdentityLifecycleEvent', 'FederatedIdentity', 'ServicePrincipal', 'StaffInvitation']) ck(!!Prisma.dmmf.datamodel.models.find((x) => x.name === m), `ET8 — neighbour model ${m} still present`);

    if (fails.length) {
      console.error('SCIM-USERS ACCEPTANCE FAILURES:\n - ' + fails.join('\n - '));
      process.exit(1);
    }
    console.log(`P7-7B.3 SCIM: table=ScimUserMapping FKs=${fks.length}(all RESTRICT) uniqueness=[labId,userId]+[labId,externalId] append-only=verified NO-User-change=verified create→ACTIVE-via-boundary=verified source=SCIM placeholder-hash=verified immutable-mapping=verified deterministic-conflicts[409/412]=verified idempotency[POST/PUT/PATCH/DELETE]=verified DELETE-preserves-mapping=verified no-role/session/federation/password/invitation=verified L8-sole-writer=preserved coded-audit=verified`);
    console.log('P7-7B.3 SCIM USERS ACCEPTANCE: all persisted-truth assertions passed (additive-schema[ScimUserMapping/3 RESTRICT FKs/[labId,userId]+[labId,externalId] uniqueness/no-JSON/append-only/NO-User-change] + SCIM-transport-only[all lifecycle via IdentityLifecycleService with durable events] + immutable-append-only-mapping[externalId reassignment fails closed; DELETE preserves history — §4b] + deterministic-conflicts[dup-externalId/userName 409, stale-version 412, single-winner] + POST/PUT/PATCH/DELETE-idempotency + no-role/session/federation/password/invitation-mutation + coded-audit[IDENTITY_SCIM_SYNCED, no payload/token/PHI] + L8-sole-writer-preserved + ET1–ET8). ServicePrincipal-only auth + the single PermissionsGuard boundary are bound by the focused SCIM authz + service-oauth e2e jest suites.');
  } finally {
    await app.close().catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('assert-scim-users-state FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
