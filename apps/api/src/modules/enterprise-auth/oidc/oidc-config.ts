import { createHash } from 'node:crypto';

/**
 * Program 7 · Phase 7A.2a — OIDC value types, central policy constants, the transaction configuration fingerprint, and
 * discovery-metadata validation. The fingerprint is a digest over the trusted provider configuration in effect at
 * transaction INITIATION; the callback re-checks it and fails closed on any change (config-immutability invariant).
 */
export interface OidcDiscoveryMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  code_challenge_methods_supported?: string[];
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

/** Central policy: asymmetric algorithms only; bounded clock skew. `none`/HMAC are never accepted. */
export const OIDC_ALLOWED_ALGS = ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'PS256'];
export const OIDC_CLOCK_SKEW_SECONDS = 60;
export const OIDC_JWKS_MAX_AGE_MS = 10 * 60 * 1000;
export const OIDC_JWKS_REFRESH_COOLDOWN_MS = 30 * 1000;

/** Digest binding provider id + expected issuer + client id + redirect URI. Same inputs ⇒ same fingerprint (P12). */
export function configFingerprint(c: OidcProviderConfig): string {
  const canonical = JSON.stringify({ providerId: c.providerId, expectedIssuer: c.expectedIssuer, clientId: c.clientId, redirectUri: c.redirectUri });
  return createHash('sha256').update(canonical).digest('hex');
}

/** PKCE S256 code challenge from a verifier: base64url(sha256(verifier)). */
export function pkceS256Challenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

const isHttpsOrLocalhost = (raw: string): boolean => {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  } catch {
    return false;
  }
};

/**
 * Validate discovered metadata against the CONFIGURED provider. The configured issuer is the trust anchor — discovery
 * may never redefine it. Endpoints must be well-formed and https (localhost allowed for dev). If the provider advertises
 * its PKCE methods, S256 must be among them. Throws (fail closed) on any violation.
 */
export function validateDiscoveryMetadata(metadata: OidcDiscoveryMetadata, config: OidcProviderConfig): void {
  if (metadata.issuer !== config.expectedIssuer) throw new Error('OIDC discovery issuer does not match the configured issuer');
  for (const [name, ep] of [['authorization_endpoint', metadata.authorization_endpoint], ['token_endpoint', metadata.token_endpoint], ['jwks_uri', metadata.jwks_uri]] as const) {
    if (!ep || !isHttpsOrLocalhost(ep)) throw new Error(`OIDC ${name} is missing or violates the https trust policy`);
  }
  if (Array.isArray(metadata.code_challenge_methods_supported) && !metadata.code_challenge_methods_supported.includes('S256')) {
    throw new Error('OIDC provider does not advertise support for PKCE S256');
  }
}
