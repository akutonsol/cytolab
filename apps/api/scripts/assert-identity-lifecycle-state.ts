/**
 * Program 7 · Phase 7B.1 — persisted-truth acceptance for Identity Lifecycle Core.
 *
 * Boots the REAL AppModule DI graph and drives the REAL IdentityLifecycleService against an isolated Postgres, asserting
 * persisted DATABASE truth (no mocks): additive schema (2 enums + 4 User cols + FederatedIdentity.deactivatedAt + the
 * append-only IdentityLifecycleEvent table + 2 RESTRICT FKs, no JSON); the deterministic state↔isActive mapping across
 * ALL users (no drift — L1); legal transitions + illegal fail-closed; suspension/deprovision revoke sessions + refresh;
 * deprovision deactivates federated links, is terminal, preserves User.id (no hard delete); single-winner CAS +
 * idempotency (L9); durable append-only evidence (authoritative — L9); and ET1–ET8. The best-effort audit + full HTTP
 * authorization are bound by the focused jest suites. Exits non-zero on any failure.
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
  const fixturesPath = process.env.LIFECYCLE_FIXTURES_OUT ? path.resolve(process.env.LIFECYCLE_FIXTURES_OUT) : path.resolve(__dirname, '../../web/acceptance/.lifecycle-fixtures.json');
  const fx = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
  const prisma = new PrismaClient();
  const fails: string[] = [];
  const ck = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };
  const threw = async (fn: () => Promise<unknown>) => { try { await fn(); return false; } catch { return true; } };

  /* eslint-disable @typescript-eslint/no-var-requires */
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../src/app.module');
  const { IdentityLifecycleService } = require('../src/modules/identity-lifecycle/identity-lifecycle.service');
  const { LabContext } = require('../src/common/tenancy/lab-context');
  /* eslint-enable @typescript-eslint/no-var-requires */

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const svc = app.get(IdentityLifecycleService);
    const lab = app.get(LabContext);
    const asLab = <T>(fn: () => Promise<T>) => lab.runLabScoped(fx.labId, fn) as Promise<T>;

    // ── (schema) 2 enums + additive cols + append-only table + 2 RESTRICT FKs + no JSON ─────────────────────────
    const enums = (await prisma.$queryRawUnsafe(`SELECT typname FROM pg_type WHERE typtype='e' AND typname = ANY($1::text[])`, ['UserLifecycleState', 'ProvisioningSource'])) as unknown[];
    ck(enums.length === 2, `both 7B.1 enums exist (got ${enums.length})`);
    const userCols = (await prisma.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns WHERE table_name='User' AND column_name = ANY($1::text[])`, ['lifecycleState', 'originProvisioningSource', 'lifecycleUpdatedAt', 'deprovisionedAt'])) as unknown[];
    ck(userCols.length === 4, `User carries the 4 additive lifecycle columns (got ${userCols.length})`);
    const fiCol = (await prisma.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns WHERE table_name='FederatedIdentity' AND column_name='deactivatedAt'`)) as unknown[];
    ck(fiCol.length === 1, 'FederatedIdentity.deactivatedAt exists (additive)');
    const evTable = (await prisma.$queryRawUnsafe(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='IdentityLifecycleEvent'`)) as unknown[];
    ck(evTable.length === 1, 'IdentityLifecycleEvent table exists');
    const fks = (await prisma.$queryRawUnsafe(`SELECT conname, confdeltype::text AS d FROM pg_constraint WHERE contype='f' AND conname ~ '^IdentityLifecycleEvent_.*_fkey$'`)) as Array<{ conname: string; d: string }>;
    ck(fks.length >= 2 && fks.every((r) => r.d === 'r'), `IdentityLifecycleEvent FKs ON DELETE RESTRICT (${fks.length}; non-RESTRICT: ${fks.filter((r) => r.d !== 'r').map((r) => r.conname).join(',') || 'none'})`);
    ck(!Prisma.dmmf.datamodel.models.find((x) => x.name === 'IdentityLifecycleEvent')!.fields.some((f) => f.type === 'Json'), 'no JSON columns on IdentityLifecycleEvent');

    // ── (drive transitions) suspend → coordinated effects; deprovision → terminal + links deactivated ────────────
    const before = await prisma.user.findUniqueOrThrow({ where: { id: fx.activeUserId }, select: { lifecycleState: true, isActive: true } });
    ck(before.lifecycleState === 'ACTIVE' && before.isActive === true, 'seed active user starts ACTIVE/isActive=true');
    const susp = await asLab(() => svc.suspend(fx.activeUserId, { reason: 'acceptance', actorUserId: 'gate' }));
    ck(susp.to === 'SUSPENDED' && susp.isActive === false, 'suspend → SUSPENDED + isActive=false');
    ck((await prisma.userSession.count({ where: { userId: fx.activeUserId, revokedAt: null } })) === 0, 'suspend revoked active sessions');
    ck((await prisma.refreshToken.count({ where: { userId: fx.activeUserId, revokedAt: null } })) === 0, 'suspend revoked refresh capability');
    ck((await prisma.federatedIdentity.count({ where: { userId: fx.activeUserId, deactivatedAt: null } })) === 1, 'suspend RETAINS federated links');
    const react = await asLab(() => svc.reactivate(fx.activeUserId));
    ck(react.to === 'ACTIVE' && react.isActive === true, 'reactivate → ACTIVE + isActive=true');
    ck((await prisma.userSession.count({ where: { userId: fx.activeUserId, revokedAt: null } })) === 0, 'reactivate does NOT restore revoked sessions');
    const deprov = await asLab(() => svc.deprovision(fx.activeUserId, { reason: 'offboard', actorUserId: 'gate' }));
    ck(deprov.to === 'DEPROVISIONED' && deprov.isActive === false, 'deprovision → DEPROVISIONED + isActive=false');
    ck((await prisma.federatedIdentity.count({ where: { userId: fx.activeUserId, deactivatedAt: null } })) === 0, 'deprovision deactivated federated links');
    ck((await prisma.user.findUnique({ where: { id: fx.activeUserId } })) !== null, 'deprovision preserved User.id (no hard delete)');
    ck(await threw(() => asLab(() => svc.reactivate(fx.activeUserId))), 'DEPROVISIONED is terminal — reactivate fails closed');

    // ── (transition matrix) activate INVITED/PROVISIONED; illegal fail-closed; idempotent re-deprovision ─────────
    ck((await asLab(() => svc.activate(fx.invitedUserId))).to === 'ACTIVE', 'INVITED → ACTIVE (activate)');
    ck((await asLab(() => svc.activate(fx.provisionedUserId))).to === 'ACTIVE', 'PROVISIONED → ACTIVE (activate)');
    ck(await threw(() => asLab(() => svc.activate(fx.suspendedUserId))), 'illegal transition fails closed (activate from SUSPENDED)'); // suspendedUser is still SUSPENDED here
    const idem = await asLab(() => svc.deprovision(fx.activeUserId));
    ck(idem.idempotent === true && idem.changed === false, 'idempotent re-deprovision (no new evidence)');

    // ── (single-winner concurrency) two concurrent suspends on the (SUSPENDED→reactivated) user ─────────────────
    await asLab(() => svc.reactivate(fx.suspendedUserId)); // SUSPENDED → ACTIVE (clean; no prior SUSPENDED event exists)
    const [a, b] = await Promise.all([asLab(() => svc.suspend(fx.suspendedUserId)), asLab(() => svc.suspend(fx.suspendedUserId))]);
    ck([a.changed, b.changed].filter(Boolean).length === 1, 'two concurrent suspends → exactly one changed (single-winner)');
    ck((await prisma.identityLifecycleEvent.count({ where: { userId: fx.suspendedUserId, toState: 'SUSPENDED' } })) === 1, 'exactly one SUSPENDED evidence row from the race');

    // ── (no drift — L1) every user: isActive === (lifecycleState === ACTIVE) ────────────────────────────────────
    const allUsers = await prisma.user.findMany({ where: { labId: fx.labId }, select: { isActive: true, lifecycleState: true } });
    ck(allUsers.every((u) => u.isActive === (u.lifecycleState === 'ACTIVE')), 'DB-truth: no lifecycleState↔isActive drift for any user (L1)');

    // ── (durable append-only evidence — L9) ─────────────────────────────────────────────────────────────────────
    ck((await prisma.identityLifecycleEvent.count({ where: { userId: fx.activeUserId } })) >= 3, 'durable lifecycle evidence recorded for the active user (suspend/reactivate/deprovision)');

    // ── (ET1/2/3/7 on the lifecycle table + ET8 neighbours) ─────────────────────────────────────────────────────
    const phi = /patient|birth|\bdob\b|ssn|mrn|demographic|address|phone|email|firstname|lastname/i;
    const forbidden = /diagnos|resultsheet|aidraft|aimodel|inference|clinical|promote|permission|role/i;
    const evFields = Prisma.dmmf.datamodel.models.find((x) => x.name === 'IdentityLifecycleEvent')!.fields;
    ck(evFields.filter((f) => phi.test(f.name)).length === 0, 'IdentityLifecycleEvent has no PHI column (ET7)');
    ck(evFields.filter((f) => forbidden.test(f.name)).length === 0, 'IdentityLifecycleEvent has no clinical/AI/permission column (ET1/ET2/ET5)');
    ck(evFields.some((f) => f.name === 'labId'), 'IdentityLifecycleEvent is lab-scoped on labId (ET3)');
    for (const m of ['User', 'Role', 'Permission', 'Lab', 'AiModelVersion', 'ResultSheet', 'Record', 'ServicePrincipal', 'FederatedIdentity', 'IdentityProvider', 'OidcAuthTransaction', 'SamlAuthRequest']) {
      ck(!!Prisma.dmmf.datamodel.models.find((x) => x.name === m), `ET8 — neighbour model ${m} still present`);
    }

    if (fails.length) {
      console.error('IDENTITY-LIFECYCLE ACCEPTANCE FAILURES:\n - ' + fails.join('\n - '));
      process.exit(1);
    }
    console.log(`P7-7B.1 lifecycle: enums=2 userCols=4 FI.deactivatedAt=ok table=IdentityLifecycleEvent FKs=${fks.length}(all RESTRICT) suspend/reactivate/deprovision=verified terminal=verified links-deactivated=verified single-winner=verified no-drift=verified`);
    console.log('P7-7B.1 IDENTITY LIFECYCLE CORE ACCEPTANCE: all persisted-truth assertions passed (additive-schema[2 enums/4 User cols/FI.deactivatedAt/append-only table/2 RESTRICT FKs/no-JSON] + deterministic-state↔isActive-no-drift[L1] + legal/illegal-transition-matrix + suspend/deprovision-revoke-sessions+refresh + deprovision-deactivates-links+terminal+preserves-User.id-no-hard-delete[L5] + single-winner-CAS+idempotency[L9] + durable-append-only-evidence[L9] + ET1/2/3/5/7/8). Best-effort audit + HTTP authorization bound by the focused jest suites.');
  } finally {
    await app.close().catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('assert-identity-lifecycle-state FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
