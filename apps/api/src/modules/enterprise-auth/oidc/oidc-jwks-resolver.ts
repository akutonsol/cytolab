import { Inject, Injectable } from '@nestjs/common';
import { importJWK, type JWK, type KeyLike } from 'jose';
import { OIDC_DISCOVERY_CLIENT, OidcDiscoveryClient } from './oidc-discovery';
import { OidcJwks, OIDC_JWKS_MAX_AGE_MS, OIDC_JWKS_REFRESH_COOLDOWN_MS } from './oidc-config';

/**
 * Program 7 · Phase 7A.2a — JWKS resolution with BOUNDED caching + a SINGLE refresh-on-unknown-kid (legitimate key
 * rotation), rate-limited by a cooldown so a token carrying an unknown `kid` cannot drive an unbounded / attacker-
 * controlled fetch loop. If the key is still unknown after one bounded refresh, resolution fails closed. Keys are
 * selected by `kid`; the imported key is bound to the token's (already allow-listed) algorithm.
 */
interface CacheEntry {
  jwks: OidcJwks;
  fetchedAt: number;
  lastRefreshAt: number;
}

@Injectable()
export class OidcJwksResolver {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(@Inject(OIDC_DISCOVERY_CLIENT) private readonly discovery: OidcDiscoveryClient) {}

  async resolveKey(cacheKey: string, jwksUri: string, kid: string, alg: string): Promise<KeyLike> {
    const now = Date.now();
    let entry = this.cache.get(cacheKey);
    if (!entry || now - entry.fetchedAt > OIDC_JWKS_MAX_AGE_MS) {
      entry = await this.refresh(cacheKey, jwksUri, now);
    }
    let jwk = this.find(entry.jwks, kid);
    if (!jwk && now - entry.lastRefreshAt > OIDC_JWKS_REFRESH_COOLDOWN_MS) {
      // one bounded refresh for legitimate rotation; cooldown prevents unbounded/attacker-driven refetch loops
      entry = await this.refresh(cacheKey, jwksUri, now);
      jwk = this.find(entry.jwks, kid);
    }
    if (!jwk) throw new Error('OIDC signing key not found for kid');
    return importJWK(jwk as unknown as JWK, alg) as Promise<KeyLike>;
  }

  private async refresh(cacheKey: string, jwksUri: string, now: number): Promise<CacheEntry> {
    const jwks = await this.discovery.jwks(jwksUri);
    const entry: CacheEntry = { jwks, fetchedAt: now, lastRefreshAt: now };
    this.cache.set(cacheKey, entry);
    return entry;
  }

  private find(jwks: OidcJwks, kid: string): Record<string, unknown> | undefined {
    return jwks.keys.find((k) => (k as { kid?: string }).kid === kid);
  }
}
