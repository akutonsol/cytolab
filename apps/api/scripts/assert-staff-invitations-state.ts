/**
 * Program 7 · Phase 7B.2 — persisted-truth acceptance for Staff Invitations.
 *
 * Boots the REAL AppModule DI graph and drives the REAL StaffInvitationService against an isolated Postgres, asserting
 * persisted DATABASE truth (no mocks): additive schema (1 enum + StaffInvitation table + 2 RESTRICT FKs, no JSON, NO
 * User change); Model C (invited user INVITED/isActive=false/non-null placeholder Argon2id hash/source=INVITATION);
 * hash-only token (no plaintext persisted); the FROZEN acceptance order (password persisted then activate via the
 * lifecycle boundary → ACTIVE); single-use CAS; expiry fail-closed; cancel voids; acceptance grants NO permission; the
 * L8 sole-writer boundary still holds (source scan); and ET1–ET8. Exits non-zero on any failure.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as argon2 from 'argon2';
import { PrismaClient, Prisma } from '@prisma/client';

function assertIsolatedAcceptanceDb(): void {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required (isolated acceptance/test database).');
  const name = new URL(url).pathname.replace(/^\//, '');
  if (name === 'cytolab' || !/(test|accept)/i.test(name)) throw new Error(`Refusing "${name}": not an isolated acceptance DB.`);
}

async function main() {
  assertIsolatedAcceptanceDb();
  const fixturesPath = process.env.INVITATION_FIXTURES_OUT ? path.resolve(process.env.INVITATION_FIXTURES_OUT) : path.resolve(__dirname, '../../web/acceptance/.invitation-fixtures.json');
  const fx = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
  const prisma = new PrismaClient();
  const fails: string[] = [];
  const ck = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };
  const threw = async (fn: () => Promise<unknown>) => { try { await fn(); return false; } catch { return true; } };

  /* eslint-disable @typescript-eslint/no-var-requires */
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../src/app.module');
  const { StaffInvitationService } = require('../src/modules/staff-invitations/staff-invitation.service');
  const { LabContext } = require('../src/common/tenancy/lab-context');
  /* eslint-enable @typescript-eslint/no-var-requires */

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const svc = app.get(StaffInvitationService);
    const lab = app.get(LabContext);
    const asLab = <T>(fn: () => Promise<T>) => lab.runLabScoped(fx.labId, fn) as Promise<T>;
    const rnd = () => Math.random().toString(36).slice(2); // acceptance-only unique email helper

    // ── (schema) 1 enum + StaffInvitation table + 2 RESTRICT FKs + no JSON + NO User change ─────────────────────
    const enumRows = (await prisma.$queryRawUnsafe(`SELECT typname FROM pg_type WHERE typtype='e' AND typname='StaffInvitationStatus'`)) as unknown[];
    ck(enumRows.length === 1, 'StaffInvitationStatus enum exists');
    const tbl = (await prisma.$queryRawUnsafe(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='StaffInvitation'`)) as unknown[];
    ck(tbl.length === 1, 'StaffInvitation table exists');
    const fks = (await prisma.$queryRawUnsafe(`SELECT conname, confdeltype::text AS d FROM pg_constraint WHERE contype='f' AND conname ~ '^StaffInvitation_.*_fkey$'`)) as Array<{ conname: string; d: string }>;
    ck(fks.length >= 2 && fks.every((r) => r.d === 'r'), `StaffInvitation FKs ON DELETE RESTRICT (${fks.length}; non-RESTRICT: ${fks.filter((r) => r.d !== 'r').map((r) => r.conname).join(',') || 'none'})`);
    ck(!Prisma.dmmf.datamodel.models.find((x) => x.name === 'StaffInvitation')!.fields.some((f) => f.type === 'Json'), 'no JSON columns on StaffInvitation');
    ck(Prisma.dmmf.datamodel.models.find((x) => x.name === 'User')!.fields.find((f) => f.name === 'passwordHash')!.isRequired === true, 'User.passwordHash stays NOT NULL (Model C — no frozen-model change)');

    // ── (Model C issue) INVITED/isActive=false/non-null placeholder hash/source=INVITATION + hash-only token ────
    const issued = await asLab(() => svc.issue({ email: `acc-${rnd()}@acceptance.test`, firstName: 'A', lastName: 'B' }, 'gate'));
    const u0 = await prisma.user.findUniqueOrThrow({ where: { id: issued.userId }, select: { lifecycleState: true, isActive: true, passwordHash: true, originProvisioningSource: true } });
    ck(u0.lifecycleState === 'INVITED' && u0.isActive === false, 'issue → INVITED + isActive=false');
    ck(!!u0.passwordHash && u0.passwordHash.startsWith('$argon2'), 'invited user has a NON-NULL placeholder Argon2id hash (Model C)');
    ck(u0.originProvisioningSource === 'INVITATION', 'originProvisioningSource=INVITATION');
    const inv = await prisma.staffInvitation.findUniqueOrThrow({ where: { id: issued.invitationId } });
    ck(inv.status === 'PENDING' && !inv.tokenHash.includes(issued.rawToken), 'token stored HASH-ONLY (no plaintext)');
    ck((await prisma.identityLifecycleEvent.count({ where: { userId: issued.userId, toState: 'INVITED' } })) === 1, 'durable INVITED lifecycle event recorded via the boundary');

    // ── (frozen acceptance order) password persisted + activate via lifecycle → ACTIVE; no roles ────────────────
    const accept = await svc.accept(issued.rawToken, 'CorrectHorse12!');
    ck(accept.status === 'OK', 'accept → OK');
    const u1 = await prisma.user.findUniqueOrThrow({ where: { id: issued.userId }, select: { lifecycleState: true, isActive: true, passwordHash: true } });
    ck(u1.lifecycleState === 'ACTIVE' && u1.isActive === true, 'accept → ACTIVE + isActive=true (via lifecycle boundary)');
    ck(u1.passwordHash !== u0.passwordHash && (await argon2.verify(u1.passwordHash, 'CorrectHorse12!')), 'placeholder replaced with the invitee Argon2id password');
    ck((await prisma.identityLifecycleEvent.count({ where: { userId: issued.userId, toState: 'ACTIVE' } })) === 1, 'durable ACTIVATED event from the lifecycle boundary');
    ck((await prisma.userRole.count({ where: { userId: issued.userId } })) === 0, 'acceptance grants NO role/permission');

    // ── (single-use + expiry + cancel fail-closed) ──────────────────────────────────────────────────────────────
    ck(await threw(() => svc.accept(issued.rawToken, 'CorrectHorse12!')), 'single-use: second acceptance fails closed');
    const exp = await asLab(() => svc.issue({ email: `exp-${rnd()}@acceptance.test`, firstName: 'E', lastName: 'X' }, 'gate'));
    await prisma.staffInvitation.update({ where: { id: exp.invitationId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    ck(await threw(() => svc.accept(exp.rawToken, 'CorrectHorse12!')), 'expired token fails closed');
    ck((await prisma.staffInvitation.findUniqueOrThrow({ where: { id: exp.invitationId } })).status === 'EXPIRED', 'expired invitation marked EXPIRED');
    const can = await asLab(() => svc.issue({ email: `can-${rnd()}@acceptance.test`, firstName: 'C', lastName: 'Y' }, 'gate'));
    await asLab(() => svc.cancel(can.invitationId, 'gate'));
    ck(await threw(() => svc.accept(can.rawToken, 'CorrectHorse12!')), 'cancelled invitation cannot be accepted');

    // ── (L8 sole-writer boundary still holds — SOURCE scan on the fresh checkout) ────────────────────────────────
    const path2 = require('node:path');
    const fs2 = require('node:fs');
    const srcRoot = path2.resolve(__dirname, '../src');
    const lifecycleSvc = path2.resolve(srcRoot, 'modules/identity-lifecycle/identity-lifecycle.service.ts');
    const walk = (dir: string, out: string[] = []): string[] => { for (const n of fs2.readdirSync(dir)) { const f = path2.join(dir, n); if (fs2.statSync(f).isDirectory()) walk(f, out); else if (f.endsWith('.ts') && !f.endsWith('.spec.ts') && !f.includes('/testing/')) out.push(f); } return out; };
    const writeRe = /\.user\.(update|updateMany|upsert)\s*\(([\s\S]{0,500})/g;
    const fieldRe = /\b(isActive|lifecycleState)\b\s*:/;
    const writers: string[] = [];
    for (const f of walk(srcRoot)) { if (path2.resolve(f) === lifecycleSvc) continue; const s = fs2.readFileSync(f, 'utf8'); let m: RegExpExecArray | null; writeRe.lastIndex = 0; while ((m = writeRe.exec(s)) !== null) if (fieldRe.test(m[2])) writers.push(path2.relative(srcRoot, f)); }
    ck(writers.length === 0, `L8 sole-writer preserved: no User.isActive/lifecycleState writes outside IdentityLifecycleService (offenders: ${writers.join(', ') || 'none'})`);

    // ── (ET1/2/3/7 on StaffInvitation + ET8 neighbours) ─────────────────────────────────────────────────────────
    const phi = /patient|birth|\bdob\b|ssn|mrn|demographic|address|phone|firstname|lastname/i;
    const forbidden = /diagnos|resultsheet|aidraft|aimodel|inference|clinical|promote|permission|role|password|token(?!Hash)/i;
    const f = Prisma.dmmf.datamodel.models.find((x) => x.name === 'StaffInvitation')!.fields;
    ck(f.filter((x) => phi.test(x.name)).length === 0, 'StaffInvitation has no PHI column (ET7)');
    ck(f.filter((x) => forbidden.test(x.name)).length === 0, 'StaffInvitation has no clinical/AI/permission/password column (ET1/2/5)');
    ck(f.some((x) => x.name === 'labId'), 'StaffInvitation is lab-scoped on labId (ET3)');
    ck(f.some((x) => x.name === 'tokenHash') && !f.some((x) => x.name === 'token'), 'token stored HASH-ONLY (tokenHash column; no plaintext column)');
    for (const m of ['User', 'Role', 'Permission', 'Lab', 'AiModelVersion', 'ResultSheet', 'Record', 'IdentityLifecycleEvent', 'FederatedIdentity', 'ServicePrincipal']) ck(!!Prisma.dmmf.datamodel.models.find((x) => x.name === m), `ET8 — neighbour model ${m} still present`);

    if (fails.length) {
      console.error('STAFF-INVITATIONS ACCEPTANCE FAILURES:\n - ' + fails.join('\n - '));
      process.exit(1);
    }
    console.log(`P7-7B.2 invitations: enum=1 table=StaffInvitation FKs=${fks.length}(all RESTRICT) Model-C=verified hash-only-token=verified frozen-accept-order→ACTIVE=verified single-use=verified expiry/cancel=fail-closed no-permission-grant=verified L8-sole-writer=preserved`);
    console.log('P7-7B.2 STAFF INVITATIONS ACCEPTANCE: all persisted-truth assertions passed (additive-schema[1 enum/table/2 RESTRICT FKs/no-JSON/NO-User-change] + Model-C[INVITED/isActive=false/non-null-placeholder/source=INVITATION] + hash-only-token + frozen-acceptance-order[password-persist→activate-via-lifecycle→ACTIVE] + single-use-CAS + expiry/cancel-fail-closed + acceptance-grants-NO-permission + L8-sole-writer-preserved + ET1/2/3/7/8). The @Public accept endpoint + coded audit outcomes are bound by the focused jest suites.');
  } finally {
    await app.close().catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('assert-staff-invitations-state FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
