import { Injectable } from '@nestjs/common';
import { jwtVerify, decodeProtectedHeader, type KeyLike } from 'jose';
import { OIDC_ALLOWED_ALGS, OIDC_CLOCK_SKEW_SECONDS } from './oidc-config';

/**
 * Program 7 · Phase 7A.2a — deterministic, fail-closed OIDC ID-token validation (jose). `readHeader` selects the
 * signing key by `kid` and enforces the ASYMMETRIC-only algorithm allowlist (alg:none / HMAC rejected) BEFORE any key
 * is fetched. `validateIdToken` verifies signature, issuer, audience, `exp`/`nbf` (bounded skew) and — explicitly — a
 * future `iat` beyond skew, plus the replay `nonce`, and requires a stable subject (`sub`). Returns only the stable
 * subject — the durable linkage key (GG7); email/other claims are mutable and never the key. Throws on ANY failure.
 */
export interface ValidatedIdToken {
  subject: string;
}

export interface IdTokenValidationParams {
  key: KeyLike | Uint8Array;
  alg: string;
  expectedIssuer: string;
  clientId: string;
  expectedNonce: string;
}

@Injectable()
export class OidcTokenValidator {
  /** Decode the (unverified) header to pick the key by kid + enforce the allow-listed asymmetric alg. */
  readHeader(idToken: string): { kid: string; alg: string } {
    const header = decodeProtectedHeader(idToken);
    if (!header.alg || !OIDC_ALLOWED_ALGS.includes(header.alg)) throw new Error(`disallowed id_token alg: ${header.alg}`);
    if (typeof header.kid !== 'string' || !header.kid) throw new Error('id_token has no kid');
    return { kid: header.kid, alg: header.alg };
  }

  async validateIdToken(idToken: string, params: IdTokenValidationParams): Promise<ValidatedIdToken> {
    const { payload } = await jwtVerify(idToken, params.key, {
      issuer: params.expectedIssuer,
      audience: params.clientId,
      algorithms: OIDC_ALLOWED_ALGS, // signature/iss/aud/exp/nbf verified here (bounded skew below)
      clockTolerance: OIDC_CLOCK_SKEW_SECONDS,
    });
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.iat === 'number' && payload.iat > now + OIDC_CLOCK_SKEW_SECONDS) {
      throw new Error('id_token iat is in the future beyond the allowed skew');
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
