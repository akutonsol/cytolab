import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { createTestPrisma } from '@test/test-database';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { IdentityProviderService } from './identity-provider.service';
import { ServicePrincipalService } from './service-principal.service';
import { FederatedIdentityService } from './federated-identity.service';

/**
 * Program 7 · Phase 7A.1 — enterprise-auth foundation against the REAL test Postgres via the tenancy-scoped
 * PrismaService. Proves: lab scoping + cross-lab fail-closed; stable identifiers (GG7); the non-human service-principal
 * class resolves to a SERVICE canonical principal; federated linkage resolves to a HUMAN canonical principal bound to
 * the stable User.id; RESTRICT provenance FKs; and no clinical/AI/PHI columns (ET1/ET6/ET7).
 */
const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('P7-7A.1 enterprise authentication foundation (integration)', () => {
  const raw = createTestPrisma();
  const labContext = new LabContext();
  const prisma = new PrismaService(labContext);
  const providers = new IdentityProviderService(prisma);
  const servicePrincipals = new ServicePrincipalService(prisma);
  const federated = new FederatedIdentityService(prisma);
  const asLab = <T>(labId: string, fn: () => Promise<T>) => labContext.runLabScoped(labId, fn) as Promise<T>;
  const labIds: string[] = [];
  const accountByLab = new Map<string, string>();

  const mkLab = async () => { const l = await raw.lab.create({ data: { name: 'p7', slug: `p7-${randomUUID()}` } }); labIds.push(l.id); return l.id; };
  const mkUser = async (labId: string) => {
    if (!accountByLab.has(labId)) accountByLab.set(labId, (await raw.account.create({ data: { labId, name: 'p7-acct' } })).id);
    return (await raw.user.create({ data: { labId, accountId: accountByLab.get(labId)!, email: `u-${randomUUID()}@t.test`, passwordHash: 'x', firstName: 'H', lastName: 'P' } })).id;
  };

  afterAll(async () => {
    for (const labId of labIds) {
      for (const t of ['FederatedIdentity', 'ServicePrincipal', 'IdentityProvider', 'User', 'Account']) {
        await raw.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "labId" = $1`, labId);
      }
      await raw.$executeRaw`DELETE FROM "Lab" WHERE id = ${labId}`;
    }
    await prisma.$disconnect();
    await raw.$disconnect();
  });

  it('is lab-scoped and fails closed cross-lab', async () => {
    const A = await mkLab(); const B = await mkLab();
    const p = await asLab(A, () => providers.register({ key: 'idp-a', displayName: 'IdP A', protocol: 'OIDC' }, null));
    expect(p.isEnabled).toBe(false); // inert in 7A.1
    expect(p.providerUuid).toMatch(/^[0-9a-f-]{36}$/); // stable identifier (GG7)
    expect(await asLab(B, () => providers.list())).toEqual([]); // B cannot see A's provider
    await expect(asLab(B, () => providers.get(p.id))).rejects.toThrow(/not found/i);
    expect((await asLab(A, () => providers.list())).length).toBe(1);
  });

  it('service principals are a distinct non-human class; resolve to a SERVICE canonical principal; deactivate', async () => {
    const A = await mkLab();
    const sp = await asLab(A, () => servicePrincipals.create({ key: 'svc-1', displayName: 'Robot' }, null));
    expect(sp.principalUuid).toMatch(/^[0-9a-f-]{36}$/); // stable identifier (GG7)
    expect(sp.isActive).toBe(true);
    const principal = await asLab(A, () => servicePrincipals.toCanonicalPrincipal(sp.id));
    expect(principal).toEqual({ kind: 'SERVICE', principalId: sp.id, labId: A });
    await asLab(A, () => servicePrincipals.deactivate(sp.id));
    await expect(asLab(A, () => servicePrincipals.toCanonicalPrincipal(sp.id))).rejects.toThrow(/inactive/i);
  });

  it('federated linkage resolves to a HUMAN canonical principal bound to the stable User.id', async () => {
    const A = await mkLab();
    const userId = await mkUser(A);
    const p = await asLab(A, () => providers.register({ key: 'idp-fed', displayName: 'Fed', protocol: 'SAML' }, null));
    await asLab(A, () => federated.link(p.id, 'ext-subject-123', userId));
    const resolved = await asLab(A, () => federated.resolve(p.id, 'ext-subject-123'));
    expect(resolved).toEqual({ kind: 'HUMAN', principalId: userId, labId: A }); // bound to stable User.id, not the subject
    expect(await asLab(A, () => federated.resolve(p.id, 'no-such-subject'))).toBeNull();
  });

  it('has RESTRICT provenance FKs and no clinical/AI/PHI columns (ET1/ET6/ET7)', async () => {
    const models = ['IdentityProvider', 'ServicePrincipal', 'FederatedIdentity'];
    const phi = /patient|birth|\bdob\b|ssn|mrn|demographic|address|phone/i;
    const forbidden = /diagnos|signout|resultsheet|\brecord\b|aidraft|aimodel|inference|clinical|authorize|promote|licens|accredit/i;
    for (const m of models) {
      const fields = Prisma.dmmf.datamodel.models.find((x) => x.name === m)!.fields;
      expect(fields.map((f) => f.name).filter((f) => phi.test(f))).toEqual([]);
      expect(fields.map((f) => f.name).filter((f) => forbidden.test(f))).toEqual([]);
      // no relation to a clinical/AI object (FederatedIdentity → User is the identity model, which is allowed)
      expect(fields.some((f) => ['ResultSheet', 'Record', 'RecordStatusEvent', 'AiDraft', 'Patient', 'AiModelVersion', 'InferenceRecord'].includes(f.type))).toBe(false);
    }
    const fks = (await raw.$queryRawUnsafe(
      `SELECT conname, confdeltype::text AS d FROM pg_constraint WHERE contype='f' AND conname ~ '^(IdentityProvider|ServicePrincipal|FederatedIdentity)_.*_fkey$'`,
    )) as Array<{ conname: string; d: string }>;
    expect(fks.length).toBeGreaterThanOrEqual(5);
    expect(fks.every((r) => r.d === 'r')).toBe(true); // all ON DELETE RESTRICT
  });
});
