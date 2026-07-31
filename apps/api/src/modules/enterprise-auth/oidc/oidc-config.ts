import { createHash } from 'node:crypto';

/**
 * Program 7 · Phase 7A.2a — OIDC value types + the transaction configuration fingerprint. The fingerprint is a digest
 * over the trusted provider configuration in effect at transaction INITIATION; the callback re-checks it against the
 * provider's current config and fails closed on any change (OIDC configuration-immutability invariant).
 */
export interface OidcDiscoveryMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

export interface OidcJwks {
  keys: Array<Record<string, unknown>>;
}

export interface OidcTokenResponse {
  id_token: string;
  access_token?: string;
  token_type?: string;
}

/** The trusted, resolved OIDC provider configuration (7A.2a public client + PKCE; no client secret). */
export interface OidcProviderConfig {
  providerId: string;
  providerKey: string;
  expectedIssuer: string;
  clientId: string;
  redirectUri: string;
}

/** Digest binding provider id + expected issuer + client id + redirect URI. Same inputs ⇒ same fingerprint (P12). */
export function configFingerprint(c: OidcProviderConfig): string {
  const canonical = JSON.stringify({ providerId: c.providerId, expectedIssuer: c.expectedIssuer, clientId: c.clientId, redirectUri: c.redirectUri });
  return createHash('sha256').update(canonical).digest('hex');
}

/** PKCE S256 code challenge from a verifier: base64url(sha256(verifier)). */
export function pkceS256Challenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}
