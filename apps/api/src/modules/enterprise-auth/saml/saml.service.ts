import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PrismaService } from '../../../database/prisma.service';
import { AuthService } from '../../auth/auth.service';
import { AuditRecorder } from '../../audit/audit-recorder.service';
import { AuthenticationService } from '../authentication.service';
import { SamlAssertionValidator, SamlValidationError } from './saml-assertion-validator';
import { SamlAuthRequestService, SamlRequestError } from './saml-auth-request.service';
import { SamlProviderConfig, certificateFingerprint } from './saml-config';

/**
 * Program 7 · Phase 7A.3 — orchestrates SP-initiated SAML login (the OidcService analogue). `initiate` resolves an
 * ENABLED SAML provider (lab-scoped; disabled ⇒ fail closed), begins a persisted request, and returns the IdP SSO
 * redirect URL. `complete` (ACS) re-loads the provider's CURRENT trusted config, validates the signed response
 * (signature/XSW/semantics — S8) through the `SamlAssertionValidator` seam, consumes the persisted request (exact
 * InResponseTo + config-immutability + single use + RelayState — S4/S5/§3a), enforces assertion-`ID` replay protection,
 * resolves the canonical principal through the accepted 7A.1 seam, and hands off to the EXISTING session path
 * (`AuthService.completeFederatedLogin`). Fail-closed throughout; every security-significant failure is an append-only
 * `AUTHENTICATION`/`LOGIN_FAILED` event with a CODED reason (never XML/assertion/signature/cert/NameID/RelayState/PHI).
 * Authentication only — no authorization decision (that terminates at the existing single PermissionsGuard).
 */
@Injectable()
export class SamlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requests: SamlAuthRequestService,
    private readonly validator: SamlAssertionValidator,
    private readonly authn: AuthenticationService,
    private readonly auth: AuthService,
    private readonly audit: AuditRecorder,
  ) {}

  private async auditFailure(reason: string, identityProviderId?: string): Promise<void> {
    await this.audit
      .record({ category: 'AUTHENTICATION', actionCode: 'LOGIN_FAILED', resource: { type: 'IdentityProvider', id: identityProviderId ?? 'saml' }, outcome: { status: 'FAILURE' }, producerModule: 'enterprise-auth', metadata: { method: 'saml', reason, ...(identityProviderId ? { identityProviderId } : {}) } })
      .catch(() => undefined);
  }

  private async fail(reason: string, message: string, identityProviderId?: string): Promise<never> {
    await this.auditFailure(reason, identityProviderId);
    throw new UnauthorizedException(message);
  }

  /** Reuse the existing additive AUTHENTICATION/LOGIN_INITIATED event — emitted ONLY after a request is persisted. */
  private async auditInitiation(identityProviderId: string): Promise<void> {
    await this.audit
      .record({ category: 'AUTHENTICATION', actionCode: 'LOGIN_INITIATED', resource: { type: 'IdentityProvider', id: identityProviderId }, outcome: { status: 'SUCCESS' }, producerModule: 'enterprise-auth', metadata: { method: 'saml', identityProviderId } })
      .catch(() => undefined);
  }

  /** Resolve an enabled SAML provider + its ACTIVE, unexpired signing certs into a trusted config. Fail closed. */
  private async resolveEnabledConfig(providerKey: string): Promise<SamlProviderConfig> {
    const p = await this.prisma.identityProvider.findFirst({
      where: { key: providerKey, protocol: 'SAML', isEnabled: true },
      include: { samlCertificates: { where: { status: 'ACTIVE' } } },
    });
    if (!p) throw new BadRequestException('no enabled SAML provider for that key');
    if (!p.issuer || !p.samlSpEntityId || !p.samlAcsUrl || !p.samlIdpSsoUrl) throw new BadRequestException('SAML provider config is incomplete');
    const now = Date.now();
    const signingCerts = p.samlCertificates
      .filter((c) => !c.notAfter || c.notAfter.getTime() > now) // expired cert ⇒ not used (S4 fail closed)
      .map((c) => ({ fingerprint: c.fingerprint || certificateFingerprint(c.pemCertificate), pem: c.pemCertificate }));
    if (!signingCerts.length) throw new BadRequestException('no active, unexpired SAML signing certificate is configured');
    return {
      providerId: p.id,
      providerKey: p.key,
      idpEntityId: p.issuer,
      spEntityId: p.samlSpEntityId,
      acsUrl: p.samlAcsUrl,
      idpSsoUrl: p.samlIdpSsoUrl,
      nameIdFormat: p.samlNameIdFormat,
      wantAssertionsSigned: p.samlWantAssertionsSigned,
      signingCerts,
    };
  }

  /** Begin SP-initiated login: return the IdP SSO redirect URL. Fails closed if the provider is disabled/incomplete. */
  async initiate(providerKey: string): Promise<{ redirectUrl: string }> {
    const config = await this.resolveEnabledConfig(providerKey);
    const { requestId, relayState } = await this.requests.begin(config);
    const redirectUrl = await this.validator.buildAuthnRedirect(config, requestId, relayState);
    await this.auditInitiation(config.providerId); // only after a request is successfully persisted
    return { redirectUrl };
  }

  /** Complete the ACS callback: validate signature+semantics, consume the request, replay-guard, establish session. */
  async complete(providerKey: string, samlResponseB64: string | undefined, relayState: string | undefined, req: Request, res: Response) {
    if (!samlResponseB64) throw new BadRequestException('missing SAMLResponse');

    let config: SamlProviderConfig;
    try {
      config = await this.resolveEnabledConfig(providerKey);
    } catch {
      return this.fail('provider_disabled', 'SAML provider is not enabled'); // callback-after-disablement: fail closed
    }

    let validated;
    try {
      validated = await this.validator.validateResponse(config, samlResponseB64);
    } catch (e) {
      return this.fail(reasonOf(e), 'SAML response validation failed', config.providerId);
    }

    let consumed;
    try {
      consumed = await this.requests.verifyAndConsume(validated.inResponseTo, relayState ?? '', config);
    } catch (e) {
      return this.fail(reasonOf(e), 'SAML request could not be consumed', config.providerId);
    }

    // Assertion-ID replay protection (single-use), in addition to the SP-request single-use above.
    try {
      await this.requests.recordAssertionOnce(config.providerId, validated.assertionId, validated.notOnOrAfter);
    } catch (e) {
      return this.fail(reasonOf(e), 'SAML assertion replay rejected', config.providerId);
    }
    void consumed;

    let result;
    try {
      result = await this.authn.authenticate('saml', { identityProviderId: config.providerId, nameId: validated.nameId });
    } catch {
      return this.fail('unlinked_identity', 'SAML identity is not linked', config.providerId);
    }
    if (!result || result.principal.kind !== 'HUMAN') return this.fail('unlinked_identity', 'SAML identity is not linked', config.providerId);

    return this.auth.completeFederatedLogin(result.principal.principalId, req, res, { method: 'saml', providerId: config.providerId });
  }
}

/** Extract the coded reason from a typed SAML error, else a generic malformed-response classifier. Never leaks detail. */
function reasonOf(e: unknown): string {
  if (e instanceof SamlValidationError) return e.reason;
  if (e instanceof SamlRequestError) return e.reason;
  return 'malformed_response';
}
