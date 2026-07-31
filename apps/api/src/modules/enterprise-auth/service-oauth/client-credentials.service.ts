import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuditRecorder } from '../../audit/audit-recorder.service';
import { ServicePrincipalCredentialService } from './service-principal-credential.service';
import { ServicePrincipalScopeService } from './service-principal-scope.service';
import { ServiceTokenSigner } from './service-token.signer';
import { SERVICE_TOKEN_TTL_SECONDS } from './service-oauth.constants';

/**
 * Program 7 · Phase 7A.2b — the OAuth 2.0 Client Credentials grant. Resolves the `ServicePrincipal` by `client_id`
 * (=`key`), emits the MANDATORY `SERVICE_AUTH_INITIATED` once a syntactically valid attempt reaches here (D3), verifies
 * the secret (constant-work anti-enumeration — unknown/inactive principal performs a dummy verify), and on success mints
 * a short-lived service token whose permissions are the principal's Permission-catalogue scopes (D5) with
 * `isSuperRole=false`. Every failure fails closed with ONE generic external error + a coded `SERVICE_AUTH_FAILED` event.
 * Machine auth only — no session, no refresh, no clinical/AI authority.
 */
const GENERIC_ERROR = 'invalid client credentials';

@Injectable()
export class ClientCredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: ServicePrincipalCredentialService,
    private readonly scopes: ServicePrincipalScopeService,
    private readonly signer: ServiceTokenSigner,
    private readonly audit: AuditRecorder,
  ) {}

  async grant(clientId: string, clientSecret: string): Promise<{ access_token: string; token_type: 'Bearer'; expires_in: number }> {
    const sp = await this.prisma.servicePrincipal.findFirst({ where: { key: clientId }, select: { id: true, isActive: true, labId: true } });
    await this.recordServiceAudit('SERVICE_AUTH_INITIATED', sp?.id ?? null); // mandatory once a valid attempt is processed (D3)

    // Anti-enumeration: unknown / inactive principal performs comparable work and returns an indistinguishable failure.
    const verified = sp && sp.isActive ? await this.credentials.verifySecret(sp.id, clientSecret) : await this.credentials.dummyVerify(clientSecret);
    if (!sp || !sp.isActive || !verified) {
      await this.recordServiceAudit('SERVICE_AUTH_FAILED', sp?.id ?? null, sp ? (sp.isActive ? 'bad_secret' : 'inactive_principal') : 'unknown_client');
      throw new UnauthorizedException(GENERIC_ERROR);
    }

    const permissions = await this.scopes.effectivePermissions(sp.id);
    const token = await this.signer.sign({ servicePrincipalId: sp.id, labId: sp.labId, permissions });
    await this.recordServiceAudit('SERVICE_AUTH_SUCCEEDED', sp.id);
    return { access_token: token, token_type: 'Bearer', expires_in: SERVICE_TOKEN_TTL_SECONDS };
  }

  private async recordServiceAudit(actionCode: 'SERVICE_AUTH_INITIATED' | 'SERVICE_AUTH_SUCCEEDED' | 'SERVICE_AUTH_FAILED', servicePrincipalId: string | null, reason?: string): Promise<void> {
    await this.audit
      .record({
        category: 'AUTHENTICATION',
        actionCode,
        resource: { type: 'ServicePrincipal', id: servicePrincipalId ?? 'unknown' },
        outcome: { status: actionCode === 'SERVICE_AUTH_FAILED' ? 'FAILURE' : actionCode === 'SERVICE_AUTH_INITIATED' ? 'SUCCESS' : 'SUCCESS' },
        producerModule: 'enterprise-auth',
        metadata: { method: 'client_credentials', ...(servicePrincipalId ? { servicePrincipalId } : {}), ...(reason ? { reason } : {}) },
      })
      .catch(() => undefined);
  }
}
