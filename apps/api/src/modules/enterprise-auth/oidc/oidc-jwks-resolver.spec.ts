import { generateKeyPair, exportJWK } from 'jose';
import { OidcJwksResolver } from './oidc-jwks-resolver';
import { OidcDiscoveryClient } from './oidc-discovery';
import { OidcJwks, OIDC_JWKS_REFRESH_COOLDOWN_MS } from './oidc-config';

/**
 * Program 7 · Phase 7A.2a — JWKS resolution: bounded cache, ONE refresh-on-unknown-kid for legitimate rotation (once
 * the anti-loop cooldown has elapsed), a cooldown that prevents an unknown-kid token from driving an unbounded refetch
 * loop, and fail-closed when a kid remains unknown after the bounded refresh.
 */
describe('P7-7A.2a OidcJwksResolver (cache + bounded rotation refresh)', () => {
  const mkJwks = async (kid: string): Promise<OidcJwks> => {
    const { publicKey } = await generateKeyPair('RS256');
    return { keys: [{ ...(await exportJWK(publicKey)), kid, use: 'sig', alg: 'RS256' }] };
  };
  const client = (jwks: () => Promise<OidcJwks>) => {
    let calls = 0;
    return { discover: async () => ({ issuer: 'x', authorization_endpoint: 'x', token_endpoint: 'x', jwks_uri: 'x' }), jwks: async () => { calls++; return jwks(); }, exchangeCode: async () => ({ id_token: 'x' }), calls: () => calls } as OidcDiscoveryClient & { calls: () => number };
  };
  const past = OIDC_JWKS_REFRESH_COOLDOWN_MS + 1_000;

  afterEach(() => jest.useRealTimers());

  it('caches: a second resolve for a known kid does NOT refetch', async () => {
    const j = await mkJwks('k1');
    const c = client(async () => j);
    const r = new OidcJwksResolver(c);
    await r.resolveKey('p1', 'https://jwks', 'k1', 'RS256');
    await r.resolveKey('p1', 'https://jwks', 'k1', 'RS256');
    expect(c.calls()).toBe(1);
  });

  it('refreshes ONCE on an unknown kid past the cooldown (legitimate rotation) and resolves the rotated key', async () => {
    jest.useFakeTimers(); jest.setSystemTime(0);
    let current = await mkJwks('k1');
    const c = client(async () => current);
    const r = new OidcJwksResolver(c);
    await r.resolveKey('p2', 'https://jwks', 'k1', 'RS256'); // fetch #1 at t=0
    current = await mkJwks('k2'); // provider rotated
    jest.setSystemTime(past); // cooldown elapsed
    const key = await r.resolveKey('p2', 'https://jwks', 'k2', 'RS256'); // unknown kid → one refresh → found
    expect(key).toBeDefined();
    expect(c.calls()).toBe(2);
  });

  it('fails closed when the kid remains unknown after the bounded refresh', async () => {
    jest.useFakeTimers(); jest.setSystemTime(0);
    const j = await mkJwks('k1');
    const c = client(async () => j);
    const r = new OidcJwksResolver(c);
    await r.resolveKey('p3', 'https://jwks', 'k1', 'RS256');
    jest.setSystemTime(past);
    await expect(r.resolveKey('p3', 'https://jwks', 'k-unknown', 'RS256')).rejects.toThrow(/key not found/i);
    expect(c.calls()).toBe(2); // one bounded refresh was attempted, then it failed closed
  });

  it('cooldown: a burst of unknown-kid requests does not drive an unbounded refetch loop', async () => {
    const j = await mkJwks('k1');
    const c = client(async () => j);
    const r = new OidcJwksResolver(c);
    await r.resolveKey('p4', 'https://jwks', 'k1', 'RS256'); // fetch #1 (fresh; within cooldown)
    for (let i = 0; i < 5; i++) await r.resolveKey('p4', 'https://jwks', 'kX', 'RS256').catch(() => undefined);
    expect(c.calls()).toBeLessThanOrEqual(2); // no per-request refetch within cooldown
  });
});
