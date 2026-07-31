import { Inject, Injectable } from '@nestjs/common';
import { AuthenticationAdapter, AuthenticationResult } from '../authentication-adapter';
import { FederatedIdentityService } from '../federated-identity.service';
import { OIDC_DISCOVERY_CLIENT, OidcDiscoveryClient } from './oidc-discovery';
import { OidcTokenValidator } from './oidc-token-validator';
import { OidcProviderConfig } from './oidc-config';

/**
 * Program 7 · Phase 7A.2a — the OIDC authentication adapter (behind the accepted 7A.1 provider-isolation seam). Its ONLY
 * output is a `CanonicalPrincipal`. Given a resolved provider config + a consumed transaction's `nonce`/`pkceVerifier`
 * and the callback `code`, it: discovers + verifies the issuer, exchanges the code (PKCE), validates the ID token
 * (signature/iss/aud/exp/nonce; asymmetric only), and resolves the stable subject to a canonical HUMAN principal via
 * the 7A.1 federated linkage. It performs NO auto-provisioning — an unlinked subject yields `null` (fail closed).
 * Downstream depends only on the canonical principal; no token/claim/provider detail leaks through.
 */
export interface OidcAuthenticationInput {
  config: OidcProviderConfig;
  code: string;
  nonce: string;
  pkceVerifier: string;
  redirectUri: string;
}

@Injectable()
export class OidcAuthenticationAdapter implements AuthenticationAdapter {
  readonly providerKey = 'oidc';
  readonly protocol = 'OIDC' as const;

  constructor(
    @Inject(OIDC_DISCOVERY_CLIENT) private readonly discovery: OidcDiscoveryClient,
    private readonly validator: OidcTokenValidator,
    private readonly federated: FederatedIdentityService,
  ) {}

  async authenticate(input: unknown): Promise<AuthenticationResult | null> {
    const { config, code, nonce, pkceVerifier, redirectUri } = input as OidcAuthenticationInput;
    if (!config || !code || !nonce || !pkceVerifier || !redirectUri) return null;

    const metadata = await this.discovery.discover(config.expectedIssuer);
    if (metadata.issuer !== config.expectedIssuer) throw new Error('OIDC issuer mismatch');

    const tokens = await this.discovery.exchangeCode({ tokenEndpoint: metadata.token_endpoint, code, codeVerifier: pkceVerifier, clientId: config.clientId, redirectUri });
    const jwks = await this.discovery.jwks(metadata.jwks_uri);
    const validated = await this.validator.validateIdToken(tokens.id_token, { jwks, expectedIssuer: config.expectedIssuer, clientId: config.clientId, expectedNonce: nonce });

    // Resolve the stable subject to a canonical HUMAN principal via the accepted 7A.1 linkage. No JIT/provisioning.
    const principal = await this.federated.resolve(config.providerId, validated.subject);
    if (!principal) return null; // unlinked subject → fail closed (provisioning is 7B / D5)
    return { principal, providerKey: this.providerKey, protocol: this.protocol };
  }
}
