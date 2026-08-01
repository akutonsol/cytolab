import { randomUUID } from 'node:crypto';
import { UserLifecycleState } from '@prisma/client';
import { createTestPrisma } from '@test/test-database';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { IdentityLifecycleService } from '../identity-lifecycle/identity-lifecycle.service';
import { ScimUsersService } from './scim-users.service';
import { resourceVersion } from './scim-serialization';

/**
 * Program 7 · Phase 7B.3 — SCIM Users against the REAL test Postgres. Proves: SCIM is transport-only into the frozen
 * 7B.1 lifecycle (every transition through IdentityLifecycleService, with durable events); the immutable append-only
 * ScimUserMapping (never re-pointed/deleted); deterministic conflicts (409 uniqueness / 412 stale-version / single-winner
 * concurrency); POST/PUT/PATCH/DELETE idempotency; cross-lab fail-closed; coded audit without PHI; and that SCIM mutates
 * NO role/permission/session/federation/password/invitation state.
 */
const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('P7-7B.3 SCIM Users (integration)', () => {
  const raw = createTestPrisma();
  const labContext = new LabContext();
  const prisma = new PrismaService(labContext);
  const audit: any = { record: jest.fn(async () => undefined) };
  const lifecycle = new IdentityLifecycleService(prisma, labContext, audit);
  const svc = new ScimUsersService(prisma, labContext, audit, lifecycle);
  const principal = { servicePrincipalId: undefined as string | undefined };
  const asLab = <T>(labId: string, fn: () => Promise<T>) => labContext.runLabScoped(labId, fn) as Promise<T>;
  const labIds: string[] = [];

  beforeEach(() => audit.record.mockClear());

  afterAll(async () => {
    for (const labId of labIds) {
      for (const t of ['ScimUserMapping', 'IdentityLifecycleEvent', 'UserSession', 'RefreshToken', 'FederatedIdentity', 'StaffInvitation', 'UserRole', 'User', 'Workspace', 'Account']) {
        await raw.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "labId" = $1`, labId).catch(() => undefined);
      }
      await raw.$executeRaw`DELETE FROM "Lab" WHERE id = ${labId}`;
    }
    await prisma.$disconnect();
    await raw.$disconnect();
  });

  async function mkLab(): Promise<string> {
    const lab = await raw.lab.create({ data: { name: 'p7b3', slug: `p7b3-${randomUUID()}` } });
    labIds.push(lab.id);
    await raw.account.create({ data: { name: `acct-${randomUUID()}`, labId: lab.id } as any });
    return lab.id;
  }
  const userRow = (id: string) => raw.user.findUniqueOrThrow({ where: { id }, select: { lifecycleState: true, isActive: true, passwordHash: true, originProvisioningSource: true, email: true, firstName: true, lastName: true, updatedAt: true } });
  const events = (labId: string, userId: string) => raw.identityLifecycleEvent.findMany({ where: { labId, userId }, orderBy: { createdAt: 'asc' }, select: { fromState: true, toState: true } });
  const syncCalls = () => audit.record.mock.calls.map((c: any[]) => c[0]).filter((i: any) => i.actionCode === 'IDENTITY_SCIM_SYNCED');
  const body = (externalId: string, userName: string, extra: Record<string, unknown> = {}) => ({ schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'], externalId, userName, name: { givenName: 'Given', familyName: 'Family' }, ...extra });

  // ── Create ────────────────────────────────────────────────────────────────────────────────────────────────────
  it('create (active default true): PROVISIONED→ACTIVE via the boundary, source=SCIM, placeholder hash, mapping written', async () => {
    const labId = await mkLab();
    const { resource, created } = await asLab(labId, () => svc.createUser(body('ext-a', 'a@corp.test') as any, principal));
    expect(created).toBe(true);
    expect(resource.active).toBe(true);
    const u = await userRow(resource.id as string);
    expect(u.lifecycleState).toBe(UserLifecycleState.ACTIVE);
    expect(u.isActive).toBe(true);
    expect(u.originProvisioningSource).toBe('SCIM');
    expect(u.passwordHash).toMatch(/^\$argon2/); // non-null, unusable placeholder
    const map = await raw.scimUserMapping.findFirstOrThrow({ where: { labId, userId: resource.id as string } });
    expect(map.externalId).toBe('ext-a');
    // lifecycle entry + activation both flowed through the boundary (durable events)
    expect(await events(labId, resource.id as string)).toEqual([
      { fromState: null, toState: UserLifecycleState.PROVISIONED },
      { fromState: UserLifecycleState.PROVISIONED, toState: UserLifecycleState.ACTIVE },
    ]);
  });

  it('create active=false: PROVISIONED (isActive=false), no activation event', async () => {
    const labId = await mkLab();
    const { resource } = await asLab(labId, () => svc.createUser(body('ext-p', 'p@corp.test', { active: false }) as any, principal));
    const u = await userRow(resource.id as string);
    expect(u.lifecycleState).toBe(UserLifecycleState.PROVISIONED);
    expect(u.isActive).toBe(false);
    expect(await events(labId, resource.id as string)).toEqual([{ fromState: null, toState: UserLifecycleState.PROVISIONED }]);
  });

  it('POST idempotency: same externalId+userName resolves to the same identity (no duplicate mapping/transition)', async () => {
    const labId = await mkLab();
    const first = await asLab(labId, () => svc.createUser(body('ext-i', 'i@corp.test') as any, principal));
    const evBefore = (await events(labId, first.resource.id as string)).length;
    const second = await asLab(labId, () => svc.createUser(body('ext-i', 'i@corp.test') as any, principal));
    expect(second.created).toBe(false);
    expect(second.resource.id).toBe(first.resource.id);
    expect(await raw.scimUserMapping.count({ where: { labId, externalId: 'ext-i' } })).toBe(1);
    expect((await events(labId, first.resource.id as string)).length).toBe(evBefore); // no extra transition
  });

  it('duplicate externalId with a DIFFERENT userName → 409 uniqueness (never re-points)', async () => {
    const labId = await mkLab();
    await asLab(labId, () => svc.createUser(body('ext-d', 'd1@corp.test') as any, principal));
    await expect(asLab(labId, () => svc.createUser(body('ext-d', 'd2@corp.test') as any, principal))).rejects.toMatchObject({ status: 409 });
  });

  it('duplicate userName/email with a different externalId → 409 uniqueness', async () => {
    const labId = await mkLab();
    await asLab(labId, () => svc.createUser(body('ext-e1', 'dup@corp.test') as any, principal));
    await expect(asLab(labId, () => svc.createUser(body('ext-e2', 'dup@corp.test') as any, principal))).rejects.toMatchObject({ status: 409 });
  });

  it('cross-lab isolation: same externalId in two labs is independent; a foreign id is 404', async () => {
    const labA = await mkLab();
    const labB = await mkLab();
    const a = await asLab(labA, () => svc.createUser(body('shared-ext', 'x@corp.test') as any, principal));
    const b = await asLab(labB, () => svc.createUser(body('shared-ext', 'x@corp.test') as any, principal)); // no collision across labs
    expect(a.resource.id).not.toBe(b.resource.id);
    await expect(asLab(labB, () => svc.getUser(a.resource.id as string))).rejects.toMatchObject({ status: 404 }); // labId from token only
  });

  // ── Read / list ───────────────────────────────────────────────────────────────────────────────────────────────
  it('get returns the resource; a non-SCIM-managed user is 404', async () => {
    const labId = await mkLab();
    const { resource } = await asLab(labId, () => svc.createUser(body('ext-g', 'g@corp.test') as any, principal));
    expect((await asLab(labId, () => svc.getUser(resource.id as string))).id).toBe(resource.id);
    const plain = await raw.user.create({ data: { labId, accountId: (await raw.account.findFirstOrThrow({ where: { labId } })).id, email: 'plain@corp.test', firstName: 'P', lastName: 'L', passwordHash: 'x', isActive: true } as any });
    await expect(asLab(labId, () => svc.getUser(plain.id))).rejects.toMatchObject({ status: 404 });
  });

  it('list + filter eq on userName / externalId', async () => {
    const labId = await mkLab();
    await asLab(labId, () => svc.createUser(body('ext-l1', 'l1@corp.test') as any, principal));
    await asLab(labId, () => svc.createUser(body('ext-l2', 'l2@corp.test') as any, principal));
    const all = await asLab(labId, () => svc.listUsers({})) as any;
    expect(all.totalResults).toBe(2);
    const byName = await asLab(labId, () => svc.listUsers({ filter: 'userName eq "l1@corp.test"' })) as any;
    expect(byName.Resources.map((r: any) => r.userName)).toEqual(['l1@corp.test']);
    const byExt = await asLab(labId, () => svc.listUsers({ filter: 'externalId eq "ext-l2"' })) as any;
    expect(byExt.Resources.map((r: any) => r.externalId)).toEqual(['ext-l2']);
  });

  // ── Replace (PUT) ─────────────────────────────────────────────────────────────────────────────────────────────
  it('PUT replaces attributes (mapping + passwordHash untouched) and is idempotent', async () => {
    const labId = await mkLab();
    const { resource } = await asLab(labId, () => svc.createUser(body('ext-put', 'put@corp.test') as any, principal));
    const before = await userRow(resource.id as string);
    const put = () => svc.replaceUser(resource.id as string, body('ext-put', 'put2@corp.test', { name: { givenName: 'New', familyName: 'Name' }, active: true }) as any, undefined, principal);
    const r1 = await asLab(labId, put) as any;
    expect(r1.userName).toBe('put2@corp.test');
    expect(r1.name.givenName).toBe('New');
    const afterFirst = await userRow(resource.id as string);
    const r2 = await asLab(labId, put) as any; // repeat identical PUT
    expect(r2.userName).toBe('put2@corp.test');
    const afterSecond = await userRow(resource.id as string);
    expect(afterSecond.updatedAt).toEqual(afterFirst.updatedAt); // idempotent: no write on the no-op repeat
    expect(afterSecond.passwordHash).toBe(before.passwordHash); // SCIM never touches the password
    const map = await raw.scimUserMapping.findFirstOrThrow({ where: { labId, userId: resource.id as string } });
    expect(map.externalId).toBe('ext-put'); // mapping immutable
  });

  it('PUT active=false suspends and active=true reactivates — via the boundary', async () => {
    const labId = await mkLab();
    const { resource } = await asLab(labId, () => svc.createUser(body('ext-sr', 'sr@corp.test') as any, principal));
    await asLab(labId, () => svc.replaceUser(resource.id as string, body('ext-sr', 'sr@corp.test', { active: false }) as any, undefined, principal));
    expect((await userRow(resource.id as string)).lifecycleState).toBe(UserLifecycleState.SUSPENDED);
    await asLab(labId, () => svc.replaceUser(resource.id as string, body('ext-sr', 'sr@corp.test', { active: true }) as any, undefined, principal));
    expect((await userRow(resource.id as string)).lifecycleState).toBe(UserLifecycleState.ACTIVE);
    const evs = await events(labId, resource.id as string);
    expect(evs).toContainEqual({ fromState: UserLifecycleState.ACTIVE, toState: UserLifecycleState.SUSPENDED });
    expect(evs).toContainEqual({ fromState: UserLifecycleState.SUSPENDED, toState: UserLifecycleState.ACTIVE });
  });

  it('PUT that attempts to change externalId → 409 mutability; mapping unchanged', async () => {
    const labId = await mkLab();
    const { resource } = await asLab(labId, () => svc.createUser(body('ext-im', 'im@corp.test') as any, principal));
    await expect(asLab(labId, () => svc.replaceUser(resource.id as string, body('ext-CHANGED', 'im@corp.test') as any, undefined, principal))).rejects.toMatchObject({ status: 409 });
    expect((await raw.scimUserMapping.findFirstOrThrow({ where: { labId, userId: resource.id as string } })).externalId).toBe('ext-im');
  });

  it('stale If-Match → 412', async () => {
    const labId = await mkLab();
    const { resource } = await asLab(labId, () => svc.createUser(body('ext-v', 'v@corp.test') as any, principal));
    const stale = resourceVersion(new Date('2000-01-01T00:00:00.000Z'));
    await expect(asLab(labId, () => svc.replaceUser(resource.id as string, body('ext-v', 'v2@corp.test') as any, stale, principal))).rejects.toMatchObject({ status: 412 });
  });

  it('concurrent PUT pinned to the same version → exactly one winner; the loser gets a deterministic conflict (409/412)', async () => {
    const labId = await mkLab();
    const { resource } = await asLab(labId, () => svc.createUser(body('ext-c', 'c@corp.test') as any, principal));
    const version = resourceVersion((await userRow(resource.id as string)).updatedAt);
    const results = await Promise.allSettled([
      asLab(labId, () => svc.replaceUser(resource.id as string, body('ext-c', 'c-one@corp.test') as any, version, principal)),
      asLab(labId, () => svc.replaceUser(resource.id as string, body('ext-c', 'c-two@corp.test') as any, version, principal)),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    // Single-winner optimistic concurrency: the loser fails closed with either the CAS conflict (409) or the stale
    // If-Match precondition (412) depending on the interleave — never a partial/merged state (§5b).
    const conflict = results.filter((r) => r.status === 'rejected' && [409, 412].includes((r as any).reason?.status)).length;
    expect(ok).toBe(1);
    expect(conflict).toBe(1);
  });

  // ── Patch (PATCH) ─────────────────────────────────────────────────────────────────────────────────────────────
  it('PATCH replace active=false suspends (idempotent repeat = no_op); PATCH name updates', async () => {
    const labId = await mkLab();
    const { resource } = await asLab(labId, () => svc.createUser(body('ext-pt', 'pt@corp.test') as any, principal));
    const patch = (ops: any[]) => svc.patchUser(resource.id as string, { schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'], Operations: ops } as any, undefined, principal);
    await asLab(labId, () => patch([{ op: 'replace', path: 'active', value: false }]));
    expect((await userRow(resource.id as string)).lifecycleState).toBe(UserLifecycleState.SUSPENDED);
    const before = (await events(labId, resource.id as string)).length;
    await asLab(labId, () => patch([{ op: 'replace', path: 'active', value: false }])); // repeat = no_op
    expect((await events(labId, resource.id as string)).length).toBe(before);
    await asLab(labId, () => patch([{ op: 'replace', path: 'name.givenName', value: 'Patched' }]));
    expect((await userRow(resource.id as string)).firstName).toBe('Patched');
  });

  it('PATCH that attempts to change externalId → 409 mutability', async () => {
    const labId = await mkLab();
    const { resource } = await asLab(labId, () => svc.createUser(body('ext-pi', 'pi@corp.test') as any, principal));
    await expect(asLab(labId, () => svc.patchUser(resource.id as string, { Operations: [{ op: 'replace', path: 'externalId', value: 'nope' }] } as any, undefined, principal))).rejects.toMatchObject({ status: 409 });
  });

  // ── Delete ────────────────────────────────────────────────────────────────────────────────────────────────────
  it('DELETE deprovisions (terminal) via the boundary; the mapping is NEVER deleted; repeat = no_op', async () => {
    const labId = await mkLab();
    const { resource } = await asLab(labId, () => svc.createUser(body('ext-del', 'del@corp.test') as any, principal));
    await asLab(labId, () => svc.deleteUser(resource.id as string, principal));
    expect((await userRow(resource.id as string)).lifecycleState).toBe(UserLifecycleState.DEPROVISIONED);
    expect(await raw.scimUserMapping.count({ where: { labId, userId: resource.id as string } })).toBe(1); // history preserved (§4b)
    const deprovEvents = (await events(labId, resource.id as string)).filter((e) => e.toState === UserLifecycleState.DEPROVISIONED).length;
    await asLab(labId, () => svc.deleteUser(resource.id as string, principal)); // idempotent
    expect((await events(labId, resource.id as string)).filter((e) => e.toState === UserLifecycleState.DEPROVISIONED).length).toBe(deprovEvents);
  });

  // ── Non-authority guarantees ──────────────────────────────────────────────────────────────────────────────────
  it('SCIM mutates NO role/permission/session/federation/password/invitation state', async () => {
    const labId = await mkLab();
    const { resource } = await asLab(labId, () => svc.createUser(body('ext-na', 'na@corp.test') as any, principal));
    const before = await userRow(resource.id as string);
    await asLab(labId, () => svc.replaceUser(resource.id as string, body('ext-na', 'na2@corp.test', { active: false }) as any, undefined, principal));
    const uid = resource.id as string;
    expect(await raw.userRole.count({ where: { userId: uid } })).toBe(0);
    expect(await raw.userSession.count({ where: { userId: uid } })).toBe(0);
    expect(await raw.federatedIdentity.count({ where: { labId, userId: uid } })).toBe(0);
    expect(await raw.staffInvitation.count({ where: { labId, userId: uid } })).toBe(0);
    expect((await userRow(uid)).passwordHash).toBe(before.passwordHash); // password never managed by SCIM
  });

  it('audit is coded-only — IDENTITY_SCIM_SYNCED carries {operation,outcome,lifecycleChanged}; never payload/token/email/PHI', async () => {
    const labId = await mkLab();
    await asLab(labId, () => svc.createUser(body('ext-au', 'audit@corp.test') as any, principal));
    const calls = syncCalls();
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      expect(c.metadata && Object.keys(c.metadata).sort()).toEqual(['lifecycleChanged', 'operation', 'outcome']);
      const serialized = JSON.stringify(c.metadata);
      expect(serialized).not.toContain('audit@corp.test');
      expect(serialized).not.toContain('ext-au');
      expect(serialized).not.toMatch(/argon2|password|token/i);
    }
  });
});
