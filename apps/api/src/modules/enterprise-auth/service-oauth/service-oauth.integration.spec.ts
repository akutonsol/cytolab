import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { createTestPrisma } from '@test/test-database';
import { PrismaService } from '../../../database/prisma.service';
import { LabContext } from '../../../common/tenancy/lab-context';
import { ServicePrincipalCredentialService } from './service-principal-credential.service';
import { ServicePrincipalScopeService } from './service-principal-scope.service';
import { ServiceTokenSigner } from './service-token.signer';
import { ClientCredentialsService } from './client-credentials.service';

/**
 * Program 7 · Phase 7A.2b — machine authentication against the REAL test Postgres. Proves: Argon2id hash-only storage
 * (no plaintext persisted); rotation revokes the prior credential; revocation + inactive principal fail closed;
 * anti-enumeration; the client-credentials grant issues a service token whose permissions are the Permission-catalogue
 * scopes; the mandatory SERVICE_AUTH_INITIATED + SUCCESS/FAILED + CREDENTIAL_ROTATED/REVOKED audit events (no secrets);
 * lab scoping + cross-lab fail-closed; RESTRICT FKs; machine-identity immutability (no hard-delete); and no PHI/clinical
 * columns.
 */
const describeIf = process.env.DATABASE_URL ? describe : describe.skip;
const SECRET = 'test-jwt-secret-000000000000000000000000';

describeIf('P7-7A.2b Service-Principal OAuth (integration)', () => {
  const raw = createTestPrisma();
  const labContext = new LabContext();
  const prisma = new PrismaService(labContext);
  const audit: any = { record: jest.fn(async () => undefined) };
  const credentials = new ServicePrincipalCredentialService(prisma, audit);
  const scopes = new ServicePrincipalScopeService(prisma);
  const signer = new ServiceTokenSigner(new JwtService({}), { get: () => SECRET } as any);
  const clientCredentials = new ClientCredentialsService(prisma, credentials, scopes, signer, audit);
  const asLab = <T>(labId: string, fn: () => Promise<T>) => labContext.runLabScoped(labId, fn) as Promise<T>;
  const labIds: string[] = [];
  const jwt = new JwtService({});

  beforeEach(() => audit.record.mockClear());
  afterAll(async () => {
    for (const labId of labIds) {
      for (const t of ['ServicePrincipalScope', 'ServicePrincipalCredential', 'ServicePrincipal', 'User', 'Account']) await raw.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "labId" = $1`, labId);
      await raw.$executeRaw`DELETE FROM "Lab" WHERE id = ${labId}`;
    }
    await raw.permission.deleteMany({ where: { code: { startsWith: 'p7svc:' } } });
    await prisma.$disconnect(); await raw.$disconnect();
  });

  const setup = async (opts: { active?: boolean } = {}) => {
    const lab = await raw.lab.create({ data: { name: 'p7b', slug: `p7b-${randomUUID()}` } }); labIds.push(lab.id);
    const sp = await raw.servicePrincipal.create({ data: { labId: lab.id, key: `svc-${randomUUID()}`, displayName: 'Robot', isActive: opts.active ?? true } });
    return { labId: lab.id, sp };
  };
  const reason = (code: string) => audit.record.mock.calls.filter((c: any[]) => c[0]?.actionCode === code);
  const noSecrets = () => audit.record.mock.calls.every((c: any[]) => !/secret|token|password|argon/i.test(JSON.stringify(c[0]?.metadata ?? {})));

  it('issues an Argon2id-hashed credential (no plaintext persisted) and verifies the secret', async () => {
    const { labId, sp } = await setup();
    const { credentialId, secret } = await asLab(labId, () => credentials.issue(sp.id, null));
    const row = await raw.servicePrincipalCredential.findUnique({ where: { id: credentialId } });
    expect(row!.secretHash.startsWith('$argon2')).toBe(true);
    expect(row!.secretHash).not.toContain(secret); // plaintext never persisted
    expect(row!.status).toBe('ACTIVE');
    expect(await asLab(labId, () => credentials.verifySecret(sp.id, secret))).toBe(true);
    expect(await asLab(labId, () => credentials.verifySecret(sp.id, 'wrong'))).toBe(false);
    expect(reason('SERVICE_CREDENTIAL_ROTATED').length).toBe(1);
  });

  it('rotation revokes the prior credential; revocation fails closed for issuance', async () => {
    const { labId, sp } = await setup();
    const first = await asLab(labId, () => credentials.issue(sp.id, null));
    const second = await asLab(labId, () => credentials.issue(sp.id, null)); // rotate
    expect((await raw.servicePrincipalCredential.findUnique({ where: { id: first.credentialId } }))!.status).toBe('REVOKED');
    expect(await asLab(labId, () => credentials.verifySecret(sp.id, first.secret))).toBe(false); // old secret dead
    expect(await asLab(labId, () => credentials.verifySecret(sp.id, second.secret))).toBe(true);
    await asLab(labId, () => credentials.revoke(second.credentialId));
    expect(reason('SERVICE_CREDENTIAL_REVOKED').length).toBe(1);
    expect(await asLab(labId, () => credentials.verifySecret(sp.id, second.secret))).toBe(false);
  });

  it('grants a service token for valid client credentials; the token carries the Permission-catalogue scopes', async () => {
    const { labId, sp } = await setup();
    const perm = await raw.permission.create({ data: { code: `p7svc:${randomUUID()}`, label: 'svc perm' } });
    const { secret } = await asLab(labId, () => credentials.issue(sp.id, null));
    await asLab(labId, () => scopes.assign(sp.id, perm.code, null));
    audit.record.mockClear();
    const spRow = await raw.servicePrincipal.findUnique({ where: { id: sp.id } });
    const res = await asLab(labId, () => clientCredentials.grant(spRow!.key, secret));
    expect(res.token_type).toBe('Bearer');
    const decoded: any = jwt.decode(res.access_token);
    expect(decoded.aud).toBe('service');
    expect(decoded.isSuperRole).toBe(false);
    expect(decoded.permissions).toContain(perm.code);
    expect(reason('SERVICE_AUTH_INITIATED').length).toBe(1); // mandatory
    expect(reason('SERVICE_AUTH_SUCCEEDED').length).toBe(1);
    expect(noSecrets()).toBe(true);
  });

  it('fails closed (generic) for unknown client / bad secret / inactive principal, always emitting INITIATED then FAILED', async () => {
    const { labId, sp } = await setup();
    const { secret } = await asLab(labId, () => credentials.issue(sp.id, null));
    const spRow = await raw.servicePrincipal.findUnique({ where: { id: sp.id } });
    // unknown client
    audit.record.mockClear();
    await expect(asLab(labId, () => clientCredentials.grant('no-such-client', secret))).rejects.toThrow(/invalid client credentials/i);
    expect(reason('SERVICE_AUTH_INITIATED').length).toBe(1);
    expect(reason('SERVICE_AUTH_FAILED')[0][0].metadata.reason).toBe('unknown_client');
    // bad secret
    audit.record.mockClear();
    await expect(asLab(labId, () => clientCredentials.grant(spRow!.key, 'wrong-secret'))).rejects.toThrow(/invalid client credentials/i);
    expect(reason('SERVICE_AUTH_FAILED')[0][0].metadata.reason).toBe('bad_secret');
    // inactive principal
    await raw.servicePrincipal.update({ where: { id: sp.id }, data: { isActive: false } });
    audit.record.mockClear();
    await expect(asLab(labId, () => clientCredentials.grant(spRow!.key, secret))).rejects.toThrow(/invalid client credentials/i);
    expect(reason('SERVICE_AUTH_FAILED')[0][0].metadata.reason).toBe('inactive_principal');
    expect(noSecrets()).toBe(true);
  });

  it('is lab-scoped and fails closed cross-lab', async () => {
    const A = await setup(); const B = await setup();
    await expect(asLab(B.labId, () => credentials.issue(A.sp.id, null))).rejects.toThrow(/not found/i);
    await expect(asLab(B.labId, () => scopes.assign(A.sp.id, 'record:view', null))).rejects.toThrow(/not found|unknown permission/i);
  });

  it('RESTRICT FKs; no PHI/clinical columns; machine-identity immutability (no hard-delete route); ServicePrincipal shape unchanged', async () => {
    const models = ['ServicePrincipalCredential', 'ServicePrincipalScope'];
    const phi = /patient|birth|\bdob\b|ssn|mrn|demographic|address|phone/i;
    const forbidden = /diagnos|resultsheet|\brecord\b|aidraft|aimodel|inference|clinical/i;
    for (const m of models) {
      const fields = Prisma.dmmf.datamodel.models.find((x) => x.name === m)!.fields;
      expect(fields.map((f) => f.name).filter((f) => phi.test(f))).toEqual([]);
      expect(fields.map((f) => f.name).filter((f) => forbidden.test(f))).toEqual([]);
      expect(fields.some((f) => f.name === 'labId')).toBe(true);
    }
    // D1/D6: ServicePrincipal itself has no credential-STATE (secret/hash/password) SCALAR column — credentials/scopes
    // live in child entities (the `credentials`/`scopes` fields are relations, which is exactly the D1 shape).
    const spModel = Prisma.dmmf.datamodel.models.find((x) => x.name === 'ServicePrincipal')!;
    const spScalars = spModel.fields.filter((f) => f.kind === 'scalar').map((f) => f.name);
    expect(spScalars.some((n) => /secret|hash|password/i.test(n))).toBe(false);
    expect(spScalars).toContain('principalUuid'); // stable identity (D6)
    // D6: no hard-delete of a service principal in the credential service (deactivation/revocation only)
    expect((credentials as any).delete).toBeUndefined();
    expect((credentials as any).hardDelete).toBeUndefined();
    const fks = (await raw.$queryRawUnsafe(
      `SELECT conname, confdeltype::text AS d FROM pg_constraint WHERE contype='f' AND conname ~ '^(ServicePrincipalCredential|ServicePrincipalScope)_.*_fkey$'`,
    )) as Array<{ conname: string; d: string }>;
    expect(fks.length).toBeGreaterThanOrEqual(5);
    expect(fks.every((r) => r.d === 'r')).toBe(true);
  });
});
