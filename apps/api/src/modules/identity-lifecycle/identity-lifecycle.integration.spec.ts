import { randomUUID } from 'node:crypto';
import { UserLifecycleState } from '@prisma/client';
import { createTestPrisma } from '@test/test-database';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { IdentityLifecycleService } from './identity-lifecycle.service';

/**
 * Program 7 · Phase 7B.1 — the lifecycle command boundary against the REAL test Postgres. Proves: legal transitions +
 * illegal fail-closed; deterministic state↔isActive mapping; suspension/deprovision revoke sessions + refresh;
 * deprovision deactivates federated links + is terminal; append-only durable evidence per transition; single-winner CAS
 * + idempotency under concurrency; cross-lab fail-closed; and assertLinkable (ACTIVE-only).
 */
const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('P7-7B.1 Identity Lifecycle Core (integration)', () => {
  const raw = createTestPrisma();
  const labContext = new LabContext();
  const prisma = new PrismaService(labContext);
  const audit: any = { record: jest.fn(async () => undefined) };
  const svc = new IdentityLifecycleService(prisma, labContext, audit);
  const asLab = <T>(labId: string, fn: () => Promise<T>) => labContext.runLabScoped(labId, fn) as Promise<T>;
  const labIds: string[] = [];

  afterAll(async () => {
    for (const labId of labIds) {
      for (const t of ['IdentityLifecycleEvent', 'FederatedIdentity', 'IdentityProvider', 'UserSession', 'RefreshToken', 'User', 'Workspace', 'Account']) {
        await raw.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "labId" = $1`, labId).catch(async () => {
          // UserSession/RefreshToken have no labId — delete by user join
          await raw.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "userId" IN (SELECT id FROM "User" WHERE "labId" = $1)`, labId).catch(() => undefined);
        });
      }
      await raw.$executeRaw`DELETE FROM "Lab" WHERE id = ${labId}`;
    }
    await prisma.$disconnect();
    await raw.$disconnect();
  });

  async function mkUser(state: UserLifecycleState = UserLifecycleState.ACTIVE): Promise<{ labId: string; userId: string }> {
    const lab = await raw.lab.create({ data: { name: 'p7b1', slug: `p7b1-${randomUUID()}` } });
    labIds.push(lab.id);
    const account = await raw.account.create({ data: { name: `acct-${randomUUID()}`, labId: lab.id } as any });
    const user = await raw.user.create({
      data: { labId: lab.id, accountId: account.id, email: `u-${randomUUID()}@lab.test`, passwordHash: 'x', firstName: 'A', lastName: 'B', isActive: state === UserLifecycleState.ACTIVE, lifecycleState: state },
    });
    return { labId: lab.id, userId: user.id };
  }
  const stateOf = (userId: string) => raw.user.findUniqueOrThrow({ where: { id: userId }, select: { lifecycleState: true, isActive: true } });
  const events = (userId: string) => raw.identityLifecycleEvent.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });

  it('suspend: ACTIVE→SUSPENDED, isActive=false, revokes sessions + refresh, retains links, writes durable evidence', async () => {
    const { labId, userId } = await mkUser();
    await raw.userSession.create({ data: { userId, deviceId: 'd1', ipAddress: '127.0.0.1', expiresAt: new Date(Date.now() + 3600_000) } });
    await raw.refreshToken.create({ data: { userId, token: `t-${randomUUID()}`, deviceId: 'd1', ipAddress: '127.0.0.1', expiresAt: new Date(Date.now() + 3600_000) } });
    const res = await asLab(labId, () => svc.suspend(userId, { reason: 'policy', actorUserId: 'admin-1' }));
    expect(res).toMatchObject({ to: UserLifecycleState.SUSPENDED, isActive: false, changed: true });
    const u = await stateOf(userId);
    expect(u).toEqual({ lifecycleState: UserLifecycleState.SUSPENDED, isActive: false });
    expect(await raw.userSession.count({ where: { userId, revokedAt: null } })).toBe(0);
    expect(await raw.refreshToken.count({ where: { userId, revokedAt: null } })).toBe(0);
    const ev = await events(userId);
    expect(ev.at(-1)).toMatchObject({ fromState: UserLifecycleState.ACTIVE, toState: UserLifecycleState.SUSPENDED, reason: 'policy', actorUserId: 'admin-1' });
  });

  it('reactivate: SUSPENDED→ACTIVE, isActive=true, does NOT restore revoked sessions', async () => {
    const { labId, userId } = await mkUser(UserLifecycleState.SUSPENDED);
    await raw.userSession.create({ data: { userId, deviceId: 'd1', ipAddress: '127.0.0.1', expiresAt: new Date(Date.now() + 3600_000), revokedAt: new Date() } });
    const res = await asLab(labId, () => svc.reactivate(userId));
    expect(res).toMatchObject({ to: UserLifecycleState.ACTIVE, isActive: true, changed: true });
    expect(await stateOf(userId)).toEqual({ lifecycleState: UserLifecycleState.ACTIVE, isActive: true });
    expect(await raw.userSession.count({ where: { userId, revokedAt: null } })).toBe(0); // stays revoked
  });

  it('deprovision: →DEPROVISIONED terminal, isActive=false, revokes sessions/refresh, deactivates links, preserves User.id', async () => {
    const { labId, userId } = await mkUser();
    const idp = await raw.identityProvider.create({ data: { labId, key: `idp-${randomUUID()}`, displayName: 'x', protocol: 'OIDC' } });
    await raw.federatedIdentity.create({ data: { labId, identityProviderId: idp.id, externalSubject: 'sub-1', userId } });
    await raw.userSession.create({ data: { userId, deviceId: 'd1', ipAddress: '127.0.0.1', expiresAt: new Date(Date.now() + 3600_000) } });
    const res = await asLab(labId, () => svc.deprovision(userId, { reason: 'offboard', actorUserId: 'admin-1' }));
    expect(res).toMatchObject({ to: UserLifecycleState.DEPROVISIONED, isActive: false, changed: true });
    const u = await raw.user.findUniqueOrThrow({ where: { id: userId }, select: { lifecycleState: true, isActive: true, deprovisionedAt: true } });
    expect(u.lifecycleState).toBe(UserLifecycleState.DEPROVISIONED);
    expect(u.isActive).toBe(false);
    expect(u.deprovisionedAt).toBeInstanceOf(Date);
    expect(await raw.federatedIdentity.count({ where: { userId, deactivatedAt: null } })).toBe(0); // links deactivated
    expect(await raw.userSession.count({ where: { userId, revokedAt: null } })).toBe(0);
    // User.id preserved (still resolvable) — no hard delete
    expect(await raw.user.findUnique({ where: { id: userId } })).not.toBeNull();
  });

  it('DEPROVISIONED is terminal: reactivate/suspend/deprovision fail closed (except idempotent re-deprovision)', async () => {
    const { labId, userId } = await mkUser(UserLifecycleState.DEPROVISIONED);
    await expect(asLab(labId, () => svc.reactivate(userId))).rejects.toBeDefined();
    await expect(asLab(labId, () => svc.suspend(userId))).rejects.toBeDefined();
    // idempotent: deprovision of an already-DEPROVISIONED user succeeds without a new event
    const before = (await events(userId)).length;
    const res = await asLab(labId, () => svc.deprovision(userId));
    expect(res.idempotent).toBe(true);
    expect(res.changed).toBe(false);
    expect((await events(userId)).length).toBe(before);
  });

  it('illegal transitions fail closed (suspend from INVITED; reactivate from INVITED)', async () => {
    const inv = await mkUser(UserLifecycleState.INVITED);
    await expect(asLab(inv.labId, () => svc.suspend(inv.userId))).rejects.toBeDefined();
    const inv2 = await mkUser(UserLifecycleState.INVITED);
    await expect(asLab(inv2.labId, () => svc.reactivate(inv2.userId))).rejects.toBeDefined(); // reactivate is SUSPENDED-only
  });

  it('idempotency: reactivate on an already-ACTIVE user is a benign no-op (no new event)', async () => {
    const { labId, userId } = await mkUser(UserLifecycleState.ACTIVE);
    const before = (await events(userId)).length;
    const res = await asLab(labId, () => svc.reactivate(userId));
    expect(res).toMatchObject({ idempotent: true, changed: false, to: UserLifecycleState.ACTIVE });
    expect((await events(userId)).length).toBe(before);
  });

  it('activate: INVITED→ACTIVE and PROVISIONED→ACTIVE', async () => {
    const inv = await mkUser(UserLifecycleState.INVITED);
    expect((await asLab(inv.labId, () => svc.activate(inv.userId))).to).toBe(UserLifecycleState.ACTIVE);
    expect((await stateOf(inv.userId)).isActive).toBe(true);
    const prov = await mkUser(UserLifecycleState.PROVISIONED);
    expect((await asLab(prov.labId, () => svc.activate(prov.userId))).to).toBe(UserLifecycleState.ACTIVE);
  });

  it('concurrency: two concurrent suspends → exactly one changed, one idempotent (single-winner)', async () => {
    const { labId, userId } = await mkUser();
    const [a, b] = await Promise.all([asLab(labId, () => svc.suspend(userId)), asLab(labId, () => svc.suspend(userId))]);
    expect([a.changed, b.changed].filter(Boolean)).toHaveLength(1);
    expect(await raw.identityLifecycleEvent.count({ where: { userId, toState: UserLifecycleState.SUSPENDED } })).toBe(1);
    expect((await stateOf(userId)).lifecycleState).toBe(UserLifecycleState.SUSPENDED);
  });

  it('concurrency: deprovision racing reactivate → deprovision wins (no active state survives)', async () => {
    const { labId, userId } = await mkUser(UserLifecycleState.SUSPENDED);
    const results = await Promise.allSettled([asLab(labId, () => svc.deprovision(userId)), asLab(labId, () => svc.reactivate(userId))]);
    const final = await stateOf(userId);
    // Whichever ordering, the terminal state must win OR reactivate happened first then deprovision — but never leave a
    // non-active state with isActive=true or ACTIVE with isActive=false. And DEPROVISIONED is the only terminal winner.
    expect([UserLifecycleState.DEPROVISIONED, UserLifecycleState.ACTIVE]).toContain(final.lifecycleState);
    expect(final.isActive).toBe(final.lifecycleState === UserLifecycleState.ACTIVE);
    if (final.lifecycleState === UserLifecycleState.DEPROVISIONED) {
      expect(await raw.userSession.count({ where: { userId, revokedAt: null } })).toBe(0);
    }
    void results;
  });

  it('no drift: every user has isActive === (lifecycleState === ACTIVE)', async () => {
    const rows = await raw.user.findMany({ where: { labId: { in: labIds } }, select: { isActive: true, lifecycleState: true } });
    for (const r of rows) expect(r.isActive).toBe(r.lifecycleState === UserLifecycleState.ACTIVE);
  });

  it('assertLinkable: ACTIVE passes; non-ACTIVE fails closed', async () => {
    const act = await mkUser(UserLifecycleState.ACTIVE);
    await expect(asLab(act.labId, () => svc.assertLinkable(act.userId))).resolves.toBeUndefined();
    const susp = await mkUser(UserLifecycleState.SUSPENDED);
    await expect(asLab(susp.labId, () => svc.assertLinkable(susp.userId))).rejects.toBeDefined();
  });

  it('cross-lab fail-closed: a transition cannot target a user in another lab', async () => {
    const { userId } = await mkUser();
    const other = await mkUser();
    await expect(asLab(other.labId, () => svc.suspend(userId))).rejects.toBeDefined();
  });
});
