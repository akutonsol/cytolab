import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PrismaService } from '../../../database/prisma.service';
import { AuthService } from '../../auth/auth.service';
import { AuthenticationService } from '../authentication.service';
import { OidcTransactionService } from './oidc-transaction.service';
import { OIDC_DISCOVERY_CLIENT, OidcDiscoveryClient } from './oidc-discovery';
import { OidcProviderConfig } from './oidc-config';

/**
 * Program 7 · Phase 7A.2a — orchestrates the interactive OIDC login. `initiate` resolves an ENABLED OIDC provider
 * (lab-scoped), begins a transaction, and returns the IdP authorize URL. `complete` (callback) re-loads the provider's
 * CURRENT trusted config, verifies + consumes the transaction (enforcing the config-immutability invariant + single
 * use), establishes the canonical principal through the accepted 7A.1 seam, and hands off to the EXISTING session path
 * (`AuthService.completeFederatedLogin`). Fail-closed throughout; authentication only — no authorization decision.
 */
@Injectable()
export class OidcService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: OidcTransactionService,
    private readonly authn: AuthenticationService,
    private readonly auth: AuthService,
    @Inject(OIDC_DISCOVERY_CLIENT) private readonly discovery: OidcDiscoveryClient,
  ) {}

  private async resolveEnabledConfig(providerKey: string): Promise<OidcProviderConfig> {
    const p = await this.prisma.identityProvider.findFirst({ where: { key: providerKey, protocol: 'OIDC', isEnabled: true } });
    if (!p) throw new BadRequestException('no enabled OIDC provider for that key');
    if (!p.issuer || !p.clientId || !p.redirectUri) throw new BadRequestException('OIDC provider config is incomplete');
    return { providerId: p.id, providerKey: p.key, expectedIssuer: p.issuer, clientId: p.clientId, redirectUri: p.redirectUri };
  }

  private async resolveConfigById(providerId: string): Promise<OidcProviderConfig> {
    const p = await this.prisma.identityProvider.findFirst({ where: { id: providerId, protocol: 'OIDC', isEnabled: true } });
    if (!p) throw new UnauthorizedException('OIDC provider is not enabled');
    if (!p.issuer || !p.clientId || !p.redirectUri) throw new UnauthorizedException('OIDC provider config is incomplete');
    return { providerId: p.id, providerKey: p.key, expectedIssuer: p.issuer, clientId: p.clientId, redirectUri: p.redirectUri };
  }

  /** Begin interactive login: return the IdP authorize URL (+ opaque state). */
  async initiate(providerKey: string): Promise<{ authorizeUrl: string; state: string }> {
    const config = await this.resolveEnabledConfig(providerKey);
    const metadata = await this.discovery.discover(config.expectedIssuer);
    if (metadata.issuer !== config.expectedIssuer) throw new BadRequestException('OIDC issuer mismatch');
    const tx = await this.transactions.begin(config);
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

  /** Complete the callback: validate transaction + config-immutability, resolve the principal, establish a session. */
  async complete(state: string, code: string, req: Request, res: Response) {
    if (!state || !code) throw new BadRequestException('missing state or code');
    const tx = await this.prisma.oidcAuthTransaction.findFirst({ where: { state }, select: { identityProviderId: true } });
    if (!tx) throw new UnauthorizedException('unknown or invalid OIDC state');
    const config = await this.resolveConfigById(tx.identityProviderId);
    const consumed = await this.transactions.verifyAndConsume(state, config);
    const result = await this.authn.authenticate('oidc', { config, code, nonce: consumed.nonce, pkceVerifier: consumed.pkceVerifier, redirectUri: consumed.redirectUri });
    if (!result || result.principal.kind !== 'HUMAN') throw new UnauthorizedException('OIDC authentication failed');
    return this.auth.completeFederatedLogin(result.principal.principalId, req, res, { method: 'oidc', providerId: config.providerId });
  }
}
