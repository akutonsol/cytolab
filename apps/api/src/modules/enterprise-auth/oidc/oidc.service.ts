import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PrismaService } from '../../../database/prisma.service';
import { AuthService } from '../../auth/auth.service';
import { AuditRecorder } from '../../audit/audit-recorder.service';
import { AuthenticationService } from '../authentication.service';
import { OidcTransactionService } from './oidc-transaction.service';
import { OIDC_DISCOVERY_CLIENT, OidcDiscoveryClient } from './oidc-discovery';
import { OidcProviderConfig } from './oidc-config';

/**
 * Program 7 · Phase 7A.2a — orchestrates the interactive OIDC login. `initiate` resolves an ENABLED OIDC provider
 * (lab-scoped; disabled ⇒ fail closed), begins a transaction, and returns the IdP authorize URL. `complete` (callback)
 * handles an IdP error response, re-loads the provider's CURRENT trusted config, verifies + consumes the transaction
 * (enforcing the config-immutability invariant + single use), establishes the canonical principal through the accepted
 * 7A.1 seam, and hands off to the EXISTING session path (`AuthService.completeFederatedLogin`). Fail-closed throughout;
 * every security-significant failure is recorded as an append-only `AUTHENTICATION`/`LOGIN_FAILED` event with a CODED
 * reason (never a token/code/nonce/verifier/raw-state/PHI/email). Authentication only — no authorization decision.
 */
@Injectable()
export class OidcService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: OidcTransactionService,
    private readonly authn: AuthenticationService,
    private readonly auth: AuthService,
    private readonly audit: AuditRecorder,
    @Inject(OIDC_DISCOVERY_CLIENT) private readonly discovery: OidcDiscoveryClient,
  ) {}

  private async auditFailure(reason: string, identityProviderId?: string): Promise<void> {
    await this.audit
      .record({ category: 'AUTHENTICATION', actionCode: 'LOGIN_FAILED', resource: { type: 'IdentityProvider', id: identityProviderId ?? 'oidc' }, outcome: { status: 'FAILURE' }, producerModule: 'enterprise-auth', metadata: { method: 'oidc', reason, ...(identityProviderId ? { identityProviderId } : {}) } })
      .catch(() => undefined);
  }

  private async fail(reason: string, message: string, identityProviderId?: string): Promise<never> {
    await this.auditFailure(reason, identityProviderId);
    throw new UnauthorizedException(message);
  }

  /** Program-7-authorized additive AUTHENTICATION/LOGIN_INITIATED event — emitted ONLY after a transaction is created. */
  private async auditInitiation(identityProviderId: string, transactionUuid: string): Promise<void> {
    await this.audit
      .record({ category: 'AUTHENTICATION', actionCode: 'LOGIN_INITIATED', resource: { type: 'IdentityProvider', id: identityProviderId }, outcome: { status: 'SUCCESS' }, producerModule: 'enterprise-auth', metadata: { method: 'oidc', identityProviderId, transactionUuid } })
      .catch(() => undefined);
  }

  private async resolveEnabledConfig(providerKey: string): Promise<OidcProviderConfig> {
    const p = await this.prisma.identityProvider.findFirst({ where: { key: providerKey, protocol: 'OIDC', isEnabled: true } });
    if (!p) throw new BadRequestException('no enabled OIDC provider for that key');
    if (!p.issuer || !p.clientId || !p.redirectUri) throw new BadRequestException('OIDC provider config is incomplete');
    return { providerId: p.id, providerKey: p.key, expectedIssuer: p.issuer, clientId: p.clientId, redirectUri: p.redirectUri };
  }

  /** Begin interactive login: return the IdP authorize URL (+ opaque state). Fails closed if the provider is disabled. */
  async initiate(providerKey: string): Promise<{ authorizeUrl: string; state: string }> {
    const config = await this.resolveEnabledConfig(providerKey);
    const metadata = await this.discovery.discover(config.expectedIssuer);
    if (metadata.issuer !== config.expectedIssuer) throw new BadRequestException('OIDC issuer mismatch');
    const tx = await this.transactions.begin(config);
    await this.auditInitiation(config.providerId, tx.transactionUuid); // only after a transaction is successfully created
    const url = new URL(metadata.authorization_endpoint);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid');
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', config.redirectUri);
    url.searchParams.set('state', tx.state);
    url.searchParams.set('nonce', tx.nonce);
    url.searchParams.set('code_challenge', tx.pkceChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return { authorizeUrl: url.toString(), state: tx.state };
  }

  /** Complete the callback: handle IdP error, validate transaction + config-immutability, resolve, establish session. */
  async complete(state: string, code: string | undefined, req: Request, res: Response, idpError?: string) {
    if (idpError) await this.fail('idp_error', 'the identity provider returned an error');
    if (!state || !code) throw new BadRequestException('missing state or code');

    const tx = await this.prisma.oidcAuthTransaction.findFirst({ where: { state }, select: { identityProviderId: true } });
    if (!tx) await this.fail('unknown_state', 'unknown or invalid OIDC state');
    const providerId = tx!.identityProviderId;

    let config: OidcProviderConfig;
    try {
      const p = await this.prisma.identityProvider.findFirst({ where: { id: providerId, protocol: 'OIDC', isEnabled: true } });
      if (!p || !p.issuer || !p.clientId || !p.redirectUri) throw new Error('disabled');
      config = { providerId: p.id, providerKey: p.key, expectedIssuer: p.issuer, clientId: p.clientId, redirectUri: p.redirectUri };
    } catch {
      return this.fail('provider_disabled', 'OIDC provider is not enabled', providerId); // callback-after-disablement policy: fail closed
    }

    let consumed;
    try {
      consumed = await this.transactions.verifyAndConsume(state, config); // single-use + config-immutability enforced here
    } catch (e) {
      const reason = /configuration changed/i.test((e as Error).message) ? 'config_fingerprint_mismatch' : 'transaction_rejected';
      return this.fail(reason, (e as Error).message, providerId);
    }

    let result;
    try {
      result = await this.authn.authenticate('oidc', { config, code, nonce: consumed.nonce, pkceVerifier: consumed.pkceVerifier, redirectUri: consumed.redirectUri });
    } catch {
      return this.fail('token_validation_failed', 'OIDC token validation failed', providerId);
    }
    if (!result || result.principal.kind !== 'HUMAN') return this.fail('unlinked_identity', 'OIDC identity is not linked', providerId);

    return this.auth.completeFederatedLogin(result.principal.principalId, req, res, { method: 'oidc', providerId: config.providerId });
  }
}
