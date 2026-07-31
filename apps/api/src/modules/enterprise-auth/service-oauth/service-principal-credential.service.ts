import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../../../database/prisma.service';
import { tenantCreate } from '../../../common/tenancy/tenancy.extension';
import { ARGON2_OPTS } from '../../security/password-policy.service';
import { AuditRecorder } from '../../audit/audit-recorder.service';

/**
 * Program 7 · Phase 7A.2b — machine credential lifecycle. The client secret is a high-entropy value returned ONCE at
 * issuance/rotation and stored ONLY as an Argon2id hash (D1) — never persisted/logged/audited/in-errors. Rotation
 * mints a new ACTIVE credential and REVOKES the prior ones; revocation flips status (D4 — no live denylist; short-lived
 * tokens bound the window). Lab-scoped. Machine identity is immutable (D6): credentials attach to the stable
 * ServicePrincipal; there is no hard-delete path.
 */
@Injectable()
export class ServicePrincipalCredentialService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditRecorder) {}

  private newSecret(): string {
    return randomBytes(32).toString('base64url');
  }

  /** Issue (or rotate to) a fresh ACTIVE credential; prior ACTIVE credentials are revoked. Returns the plaintext ONCE. */
  async issue(servicePrincipalId: string, actorId?: string | null): Promise<{ credentialId: string; secret: string }> {
    const sp = await this.prisma.servicePrincipal.findFirst({ where: { id: servicePrincipalId }, select: { id: true, isActive: true } });
    if (!sp) throw new NotFoundException('service principal not found');
    if (!sp.isActive) throw new BadRequestException('service principal is inactive');
    const secret = this.newSecret();
    const secretHash = await argon2.hash(secret, ARGON2_OPTS);
    const credentialId = await this.prisma.$transaction(async (tx) => {
      await tx.servicePrincipalCredential.updateMany({ where: { servicePrincipalId, status: 'ACTIVE' }, data: { status: 'REVOKED' } });
      const cred = await tx.servicePrincipalCredential.create({ data: tenantCreate<Prisma.ServicePrincipalCredentialUncheckedCreateInput>({ servicePrincipalId, secretHash, status: 'ACTIVE', rotatedAt: new Date(), createdById: actorId ?? null }), select: { id: true } });
      return cred.id;
    });
    await this.auditCredential('SERVICE_CREDENTIAL_ROTATED', servicePrincipalId, credentialId);
    return { credentialId, secret }; // plaintext returned ONCE
  }

  async revoke(credentialId: string): Promise<{ status: string }> {
    const cred = await this.prisma.servicePrincipalCredential.findFirst({ where: { id: credentialId }, select: { id: true, servicePrincipalId: true, status: true } });
    if (!cred) throw new NotFoundException('credential not found');
    if (cred.status === 'REVOKED') throw new BadRequestException('credential is already revoked');
    await this.prisma.servicePrincipalCredential.update({ where: { id: cred.id }, data: { status: 'REVOKED' } });
    await this.auditCredential('SERVICE_CREDENTIAL_REVOKED', cred.servicePrincipalId, cred.id);
    return { status: 'REVOKED' };
  }

  /** Anti-enumeration: perform comparable Argon2 work for an unknown/inactive principal, always returning false. */
  private static dummyHash: string | null = null;
  async dummyVerify(secret: string): Promise<boolean> {
    if (!ServicePrincipalCredentialService.dummyHash) ServicePrincipalCredentialService.dummyHash = await argon2.hash('anti-enumeration-dummy', ARGON2_OPTS);
    await argon2.verify(ServicePrincipalCredentialService.dummyHash, secret).catch(() => false);
    return false;
  }

  /** Verify a presented secret against the principal's ACTIVE, non-expired credentials. */
  async verifySecret(servicePrincipalId: string, secret: string): Promise<boolean> {
    const creds = await this.prisma.servicePrincipalCredential.findMany({ where: { servicePrincipalId, status: 'ACTIVE' }, select: { secretHash: true, expiresAt: true } });
    const now = Date.now();
    let ok = false;
    for (const c of creds) {
      if (c.expiresAt && c.expiresAt.getTime() < now) continue;
      if (await argon2.verify(c.secretHash, secret).catch(() => false)) ok = true; // no early return — reduce timing signal
    }
    return ok;
  }

  private async auditCredential(actionCode: 'SERVICE_CREDENTIAL_ROTATED' | 'SERVICE_CREDENTIAL_REVOKED', servicePrincipalId: string, credentialId: string): Promise<void> {
    await this.audit
      .record({ category: 'AUTHENTICATION', actionCode, resource: { type: 'ServicePrincipal', id: servicePrincipalId }, outcome: { status: 'SUCCESS' }, producerModule: 'enterprise-auth', metadata: { servicePrincipalId, credentialId } })
      .catch(() => undefined);
  }
}
