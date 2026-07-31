import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { LabContext } from '../../../common/tenancy/lab-context';
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
    private readonly labContext: LabContext,
    private readonly credentials: ServicePrincipalCredentialService,
    private readonly scopes: ServicePrincipalScopeService,
    private readonly signer: ServiceTokenSigner,
    private readonly audit: AuditRecorder,
  ) {}

  /** `clientId` is the globally-unique ServicePrincipal.principalUuid; the endpoint is unauthenticated so it resolves
   *  the principal (and its lab) system-scoped, then verifies + scopes it under the principal's own lab context. */
  async grant(clientId: string, clientSecret: string): Promise<{ access_token: string; token_type: 'Bearer'; expires_in: number }> {
    const sp = await this.labContext.runSystem(() => this.prisma.servicePrincipal.findFirst({ where: { principalUuid: clientId }, select: { id: true, isActive: true, labId: true } }));
    await this.recordServiceAudit('SERVICE_AUTH_INITIATED', sp?.id ?? null); // mandatory once a valid attempt is processed (D3)

    // Anti-enumeration: unknown / inactive principal performs comparable Argon2 work and fails indistinguishably.
    if (!sp || !sp.isActive) {
      await this.credentials.dummyVerify(clientSecret);
      await this.recordServiceAudit('SERVICE_AUTH_FAILED', sp?.id ?? null, sp ? 'inactive_principal' : 'unknown_client');
      throw new UnauthorizedException(GENERIC_ERROR);
    }
    const active = sp;
    const ok = await this.labContext.runLabScoped(active.labId, () => this.credentials.verifySecret(active.id, clientSecret));
    if (!ok) {
      await this.recordServiceAudit('SERVICE_AUTH_FAILED', active.id, 'bad_secret');
      throw new UnauthorizedException(GENERIC_ERROR);
    }
    const permissions = await this.labContext.runLabScoped(active.labId, () => this.scopes.effectivePermissions(active.id));
    const token = await this.signer.sign({ servicePrincipalId: active.id, labId: active.labId, permissions });
    await this.recordServiceAudit('SERVICE_AUTH_SUCCEEDED', active.id);
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
