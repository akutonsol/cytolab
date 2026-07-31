import { Injectable } from '@nestjs/common';
import { OidcDiscoveryMetadata, OidcJwks, OidcTokenResponse } from './oidc-config';

/**
 * Program 7 · Phase 7A.2a — the external OIDC I/O boundary (discovery + JWKS + code exchange). Everything an IdP
 * returns is UNTRUSTED until validated downstream (issuer/signature/claims). Modeled as an interface so the folded
 * acceptance gate + unit tests can inject a DETERMINISTIC test IdP double (no live network in CI). The HTTP
 * implementation limits egress to the configured discovery / JWKS / token endpoints.
 */
export const OIDC_DISCOVERY_CLIENT = Symbol('OIDC_DISCOVERY_CLIENT');

export interface OidcCodeExchangeInput {
  tokenEndpoint: string;
  code: string;
  codeVerifier: string;
  clientId: string;
  redirectUri: string;
}

export interface OidcDiscoveryClient {
  discover(issuer: string): Promise<OidcDiscoveryMetadata>;
  jwks(jwksUri: string): Promise<OidcJwks>;
  exchangeCode(input: OidcCodeExchangeInput): Promise<OidcTokenResponse>;
}

@Injectable()
export class HttpOidcDiscoveryClient implements OidcDiscoveryClient {
  private readonly timeoutMs = 8000;

  async discover(issuer: string): Promise<OidcDiscoveryMetadata> {
    const url = `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
    const doc = (await this.getJson(url)) as OidcDiscoveryMetadata;
    if (!doc.issuer || !doc.authorization_endpoint || !doc.token_endpoint || !doc.jwks_uri) {
      throw new Error('OIDC discovery document is missing required fields');
    }
    return doc;
  }

  async jwks(jwksUri: string): Promise<OidcJwks> {
    const doc = (await this.getJson(jwksUri)) as OidcJwks;
    if (!Array.isArray(doc.keys)) throw new Error('OIDC JWKS document is malformed');
    return doc;
  }

  async exchangeCode(input: OidcCodeExchangeInput): Promise<OidcTokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      code_verifier: input.codeVerifier,
      client_id: input.clientId,
      redirect_uri: input.redirectUri,
    });
    const res = await this.fetchWithTimeout(input.tokenEndpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body });
    if (!res.ok) throw new Error(`OIDC token exchange failed (${res.status})`);
    const json = (await res.json()) as OidcTokenResponse;
    if (!json.id_token) throw new Error('OIDC token response has no id_token');
    return json;
  }

  private async getJson(url: string): Promise<unknown> {
    const res = await this.fetchWithTimeout(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`OIDC fetch failed (${res.status}) for ${url}`);
    return res.json();
  }

  private async fetchWithTimeout(url: string, init: Record<string, unknown>): Promise<Response> {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, { ...(init as any), signal: controller.signal });
    } finally {
      clearTimeout(t);
    }
  }
}
