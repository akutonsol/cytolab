import { generateKeyPair, exportJWK, SignJWT, type KeyLike } from 'jose';
import { OidcTokenValidator } from './oidc-token-validator';
import { OidcJwks } from './oidc-config';

/**
 * Program 7 · Phase 7A.2a — deterministic, offline OIDC ID-token validation (jose). A locally-generated keypair signs
 * ID tokens; the validator verifies signature/iss/aud/exp/nonce and rejects every tampered variant. Asymmetric only.
 */
const ISS = 'https://idp.example.test';
const AUD = 'client-abc';
const NONCE = 'nonce-xyz';

describe('P7-7A.2a OidcTokenValidator (fail-closed ID-token validation)', () => {
  const validator = new OidcTokenValidator();
  let priv: KeyLike;
  let jwks: OidcJwks;

  beforeAll(async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    priv = privateKey;
    const jwk = await exportJWK(publicKey);
    jwks = { keys: [{ ...jwk, kid: 'k1', use: 'sig', alg: 'RS256' }] };
  });

  const sign = (over: Record<string, unknown> = {}, opts: { iss?: string; aud?: string; exp?: string } = {}) =>
    new SignJWT({ nonce: NONCE, sub: 'subject-1', ...over })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuedAt()
      .setIssuer(opts.iss ?? ISS)
      .setAudience(opts.aud ?? AUD)
      .setExpirationTime(opts.exp ?? '5m')
      .sign(priv);

  const validate = (token: string) => validator.validateIdToken(token, { jwks, expectedIssuer: ISS, clientId: AUD, expectedNonce: NONCE });

  it('accepts a correctly-signed token and returns the stable subject', async () => {
    expect(await validate(await sign())).toEqual({ subject: 'subject-1' });
  });

  it('rejects wrong issuer / wrong audience', async () => {
    await expect(validate(await sign({}, { iss: 'https://evil.test' }))).rejects.toBeDefined();
    await expect(validate(await sign({}, { aud: 'other-client' }))).rejects.toBeDefined();
  });

  it('rejects a nonce mismatch (replay) and a missing subject', async () => {
    await expect(validate(await sign({ nonce: 'different' }))).rejects.toThrow(/nonce/i);
    await expect(validate(await sign({ sub: undefined }))).rejects.toBeDefined();
  });

  it('rejects an expired token', async () => {
    await expect(validate(await sign({}, { exp: '-1m' }))).rejects.toBeDefined();
  });

  it('rejects alg:none (unsigned) tokens', async () => {
    const unsigned = 'eyJhbGciOiJub25lIn0.' + Buffer.from(JSON.stringify({ iss: ISS, aud: AUD, sub: 's', nonce: NONCE, exp: Math.floor(Date.now() / 1000) + 300 })).toString('base64url') + '.';
    await expect(validate(unsigned)).rejects.toBeDefined();
  });
});
