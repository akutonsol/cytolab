import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { UserLifecycleState } from '@prisma/client';
import { createTestPrisma } from '@test/test-database';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { IdentityLifecycleService } from '../identity-lifecycle/identity-lifecycle.service';
import { StaffInvitationService } from './staff-invitation.service';
import { hashInvitationToken } from './staff-invitation-token';

/**
 * Program 7 · Phase 7B.2 — staff invitations against the REAL test Postgres. Proves Model C (invited user in INVITED,
 * isActive=false, non-null placeholder hash), hash-only token storage, the FROZEN acceptance order (password persisted
 * then activate via the lifecycle boundary → ACTIVE), single-use CAS, expiry/replay/cancel fail-closed, resend
 * supersession, no-permission-grant on acceptance, and that activation flows through IdentityLifecycleService (state +
 * durable lifecycle event) — never a direct write.
 */
const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('P7-7B.2 Staff Invitations (integration)', () => {
  const raw = createTestPrisma();
  const labContext = new LabContext();
  const prisma = new PrismaService(labContext);
  const audit: any = { record: jest.fn(async () => undefined) };
  const mail: any = { send: jest.fn(async () => undefined) };
  const lifecycle = new IdentityLifecycleService(prisma, labContext, audit);
  const svc = new StaffInvitationService(prisma, labContext, audit, lifecycle, mail);
  const asLab = <T>(labId: string, fn: () => Promise<T>) => labContext.runLabScoped(labId, fn) as Promise<T>;
  const labIds: string[] = [];

  afterAll(async () => {
    for (const labId of labIds) {
      for (const t of ['StaffInvitation', 'IdentityLifecycleEvent', 'User', 'Workspace', 'Account']) {
        await raw.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "labId" = $1`, labId).catch(() => undefined);
      }
      await raw.$executeRaw`DELETE FROM "Lab" WHERE id = ${labId}`;
    }
    await prisma.$disconnect();
    await raw.$disconnect();
  });

  async function mkLab(): Promise<string> {
    const lab = await raw.lab.create({ data: { name: 'p7b2', slug: `p7b2-${randomUUID()}` } });
    labIds.push(lab.id);
    await raw.account.create({ data: { name: `acct-${randomUUID()}`, labId: lab.id } as any });
    return lab.id;
  }
  const userOf = (id: string) => raw.user.findUniqueOrThrow({ where: { id }, select: { lifecycleState: true, isActive: true, passwordHash: true, originProvisioningSource: true, email: true } });

  it('issue: creates an INVITED user (isActive=false, non-null placeholder hash, source=INVITATION) + hash-only token', async () => {
    const labId = await mkLab();
    const { invitationId, userId, rawToken } = await asLab(labId, () => svc.issue({ email: `A-${randomUUID()}@lab.test`, firstName: 'A', lastName: 'B' }, 'admin-1'));
    const u = await userOf(userId);
    expect(u.lifecycleState).toBe(UserLifecycleState.INVITED);
    expect(u.isActive).toBe(false);
    expect(u.originProvisioningSource).toBe('INVITATION');
    expect(u.passwordHash).toMatch(/^\$argon2/); // Model C: NOT NULL placeholder
    const inv = await raw.staffInvitation.findUniqueOrThrow({ where: { id: invitationId } });
    expect(inv.status).toBe('PENDING');
    expect(inv.tokenHash).toBe(hashInvitationToken(rawToken));
    expect(inv.tokenHash).not.toContain(rawToken); // hash-only, no plaintext persisted
    // durable lifecycle entry recorded via the boundary
    expect(await raw.identityLifecycleEvent.count({ where: { userId, toState: UserLifecycleState.INVITED } })).toBe(1);
  });

  it('accept: sets the real password + activates via the lifecycle boundary (INVITED→ACTIVE); no roles granted', async () => {
    const labId = await mkLab();
    const { userId, rawToken } = await asLab(labId, () => svc.issue({ email: `C-${randomUUID()}@lab.test`, firstName: 'C', lastName: 'D' }, 'admin-1'));
    const before = await userOf(userId);
    const res = await svc.accept(rawToken, 'CorrectHorse12!');
    expect(res.status).toBe('OK');
    const after = await userOf(userId);
    expect(after.lifecycleState).toBe(UserLifecycleState.ACTIVE);
    expect(after.isActive).toBe(true);
    expect(after.passwordHash).not.toBe(before.passwordHash); // placeholder replaced
    expect(await argon2.verify(after.passwordHash, 'CorrectHorse12!')).toBe(true);
    // activation went through the lifecycle service → a durable ACTIVATED event exists
    expect(await raw.identityLifecycleEvent.count({ where: { userId, toState: UserLifecycleState.ACTIVE } })).toBe(1);
    // acceptance grants NO permission/role
    expect(await raw.userRole.count({ where: { userId } })).toBe(0);
  });

  it('single-use: a second acceptance of the same token fails closed (CAS)', async () => {
    const labId = await mkLab();
    const { rawToken } = await asLab(labId, () => svc.issue({ email: `E-${randomUUID()}@lab.test`, firstName: 'E', lastName: 'F' }, 'admin-1'));
    await svc.accept(rawToken, 'CorrectHorse12!');
    await expect(svc.accept(rawToken, 'CorrectHorse12!')).rejects.toBeDefined();
  });

  it('expired token fails closed and is marked EXPIRED', async () => {
    const labId = await mkLab();
    const { invitationId, rawToken } = await asLab(labId, () => svc.issue({ email: `G-${randomUUID()}@lab.test`, firstName: 'G', lastName: 'H' }, 'admin-1'));
    await raw.staffInvitation.update({ where: { id: invitationId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(svc.accept(rawToken, 'CorrectHorse12!')).rejects.toBeDefined();
    expect((await raw.staffInvitation.findUniqueOrThrow({ where: { id: invitationId } })).status).toBe('EXPIRED');
  });

  it('unknown token fails closed', async () => {
    await expect(svc.accept('not-a-real-token', 'CorrectHorse12!')).rejects.toBeDefined();
  });

  it('cancel: PENDING→CANCELLED voids the token (acceptance then fails)', async () => {
    const labId = await mkLab();
    const { invitationId, rawToken } = await asLab(labId, () => svc.issue({ email: `I-${randomUUID()}@lab.test`, firstName: 'I', lastName: 'J' }, 'admin-1'));
    await asLab(labId, () => svc.cancel(invitationId, 'admin-1'));
    expect((await raw.staffInvitation.findUniqueOrThrow({ where: { id: invitationId } })).status).toBe('CANCELLED');
    await expect(svc.accept(rawToken, 'CorrectHorse12!')).rejects.toBeDefined();
  });

  it('resend: supersedes the prior token (old token invalid, new token accepts)', async () => {
    const labId = await mkLab();
    const { invitationId, rawToken: oldToken } = await asLab(labId, () => svc.issue({ email: `K-${randomUUID()}@lab.test`, firstName: 'K', lastName: 'L' }, 'admin-1'));
    const { rawToken: newToken } = await asLab(labId, () => svc.resend(invitationId, 'admin-1'));
    expect(newToken).not.toBe(oldToken);
    await expect(svc.accept(oldToken, 'CorrectHorse12!')).rejects.toBeDefined(); // old superseded
    await expect(svc.accept(newToken, 'CorrectHorse12!')).resolves.toEqual({ status: 'OK' });
  });

  it('duplicate email in the same lab is rejected at issue', async () => {
    const labId = await mkLab();
    const email = `dup-${randomUUID()}@lab.test`;
    await asLab(labId, () => svc.issue({ email, firstName: 'M', lastName: 'N' }, 'admin-1'));
    await expect(asLab(labId, () => svc.issue({ email, firstName: 'M', lastName: 'N' }, 'admin-1'))).rejects.toBeDefined();
  });
});
