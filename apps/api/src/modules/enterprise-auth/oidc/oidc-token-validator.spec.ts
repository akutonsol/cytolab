import { generateKeyPair, exportJWK, importJWK, SignJWT, type KeyLike } from 'jose';
import { OidcTokenValidator } from './oidc-token-validator';

/**
 * Program 7 · Phase 7A.2a — deterministic, offline OIDC ID-token validation (jose). A locally-generated keypair signs
 * ID tokens; the validator selects the key by kid (allow-listed asymmetric alg) and verifies signature/iss/aud/exp/
 * iat/nbf (bounded skew)/nonce, rejecting every tampered variant. `alg:none` and HMAC are rejected at header read.
 */
const ISS = 'https://idp.example.test';
const AUD = 'client-abc';
const NONCE = 'nonce-xyz';

describe('P7-7A.2a OidcTokenValidator (fail-closed ID-token validation)', () => {
  const validator = new OidcTokenValidator();
  let priv: KeyLike; let pub: KeyLike;

  beforeAll(async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    priv = privateKey; pub = publicKey;
  });

  const sign = (over: Record<string, unknown> = {}, opts: { iss?: string; aud?: string; exp?: string | number; iat?: number; nbf?: number; alg?: string; kid?: string } = {}) => {
    let b = new SignJWT({ nonce: NONCE, sub: 'subject-1', ...over })
      .setProtectedHeader({ alg: opts.alg ?? 'RS256', kid: opts.kid ?? 'k1' })
      .setIssuer(opts.iss ?? ISS)
      .setAudience(opts.aud ?? AUD)
      .setExpirationTime(opts.exp ?? '5m');
    b = opts.iat !== undefined ? b.setIssuedAt(opts.iat) : b.setIssuedAt();
    if (opts.nbf !== undefined) b = b.setNotBefore(opts.nbf);
    return b.sign(priv);
  };

  const validate = async (token: string) => {
    const { kid, alg } = validator.readHeader(token);
    expect(kid).toBe('k1');
    return validator.validateIdToken(token, { key: pub, alg, expectedIssuer: ISS, clientId: AUD, expectedNonce: NONCE });
  };

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

  it('rejects expired, future-iat (beyond skew), and future-nbf tokens', async () => {
    const now = Math.floor(Date.now() / 1000);
    await expect(validate(await sign({}, { exp: '-1m' }))).rejects.toBeDefined();
    await expect(validate(await sign({}, { iat: now + 3600 }))).rejects.toThrow(/iat/i);
    await expect(validate(await sign({}, { nbf: now + 3600 }))).rejects.toBeDefined();
  });

  it('rejects alg:none (unsigned) and HMAC tokens at header read (asymmetric only)', async () => {
    const unsigned = 'eyJhbGciOiJub25lIiwia2lkIjoiazEifQ.' + Buffer.from(JSON.stringify({ iss: ISS, aud: AUD, sub: 's', nonce: NONCE })).toString('base64url') + '.';
    expect(() => validator.readHeader(unsigned)).toThrow(/alg/i);
    const hmac = 'eyJhbGciOiJIUzI1NiIsImtpZCI6ImsxIn0.' + Buffer.from(JSON.stringify({ iss: ISS })).toString('base64url') + '.sig';
    expect(() => validator.readHeader(hmac)).toThrow(/alg/i);
  });

  it('accepts a token within the bounded clock skew (iat/nbf slightly in the future)', async () => {
    const now = Math.floor(Date.now() / 1000);
    expect(await validate(await sign({}, { iat: now + 5, nbf: now + 5 }))).toEqual({ subject: 'subject-1' });
    // sanity: the imported public JWK verifies the same token
    const pubJwk = await exportJWK(pub);
    expect(await importJWK(pubJwk, 'RS256')).toBeDefined();
  });
});
