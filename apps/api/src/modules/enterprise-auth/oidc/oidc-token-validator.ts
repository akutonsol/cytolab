import { Injectable } from '@nestjs/common';
import { createLocalJWKSet, jwtVerify } from 'jose';
import { OidcJwks } from './oidc-config';

/**
 * Program 7 · Phase 7A.2a — deterministic, fail-closed OIDC ID-token validation (jose). Validates signature (against
 * the provider JWKS), issuer, audience (client id), expiry/nbf (bounded skew), and the replay `nonce`; requires a
 * stable subject (`sub`). ASYMMETRIC algorithms only (alg:none and HMAC are rejected). Returns only the stable subject
 * — the durable linkage key (GG7); email/other claims are mutable and never the key. Throws on ANY failure.
 */
export interface ValidatedIdToken {
  subject: string; // OIDC `sub` — the external subject used for federated linkage
}

export interface IdTokenValidationParams {
  jwks: OidcJwks;
  expectedIssuer: string;
  clientId: string;
  expectedNonce: string;
  maxSkewSeconds?: number;
}

const ALLOWED_ALGS = ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'PS256'];

@Injectable()
export class OidcTokenValidator {
  async validateIdToken(idToken: string, params: IdTokenValidationParams): Promise<ValidatedIdToken> {
    const keySet = createLocalJWKSet(params.jwks as any);
    const { payload, protectedHeader } = await jwtVerify(idToken, keySet, {
      issuer: params.expectedIssuer,
      audience: params.clientId,
      algorithms: ALLOWED_ALGS,
      clockTolerance: params.maxSkewSeconds ?? 60,
    });
    if (!protectedHeader.alg || !ALLOWED_ALGS.includes(protectedHeader.alg)) {
      throw new Error(`disallowed id_token alg: ${protectedHeader.alg}`);
    }
    if (typeof payload.nonce !== 'string' || payload.nonce !== params.expectedNonce) {
      throw new Error('id_token nonce mismatch (possible replay)');
    }
    if (typeof payload.sub !== 'string' || !payload.sub) {
      throw new Error('id_token has no stable subject (sub)');
    }
    return { subject: payload.sub };
  }
}
