import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import { tenantCreate } from '../../../common/tenancy/tenancy.extension';
import { SamlProviderConfig, configFingerprint, SAML_REQUEST_TTL_MS } from './saml-config';

/**
 * Program 7 · Phase 7A.3 — the server-side SP-initiated SAML request transaction + the assertion-replay store
 * (the OidcTransactionService analogue). `begin` mints the AuthnRequest `requestId` and an Osieri-controlled single-use
 * `relayState` (§3a), binds the trusted `configFingerprint` at initiation, and persists a short-lived row that survives
 * the IdP round-trip. `verifyAndConsume` (at ACS) enforces, fail-closed: existence + not-expired + provider match +
 * the **configuration-immutability invariant** (fingerprint bound at initiation must equal the CURRENT trusted config,
 * else the trust basis changed mid-transaction — S4/S5) + **single use** (compare-and-set on `consumedAt`; a lost race
 * ⇒ exactly one success / one fail-closed). `recordAssertionOnce` enforces assertion-`ID` replay protection via a unique
 * insert (a replayed assertion on a fresh request is still rejected). Lab-scoped; no PHI/secret columns.
 */

export type SamlRequestFailureReason = 'unknown_request' | 'expired_request' | 'config_fingerprint_mismatch' | 'replay';

export class SamlRequestError extends Error {
  constructor(public readonly reason: SamlRequestFailureReason, message?: string) {
    super(message ?? reason);
    this.name = 'SamlRequestError';
  }
}

export interface BegunSamlRequest {
  requestId: string;
  relayState: string;
}

export interface ConsumedSamlRequest {
  identityProviderId: string;
  relayState: string;
  expectedAcsUrl: string;
}

const token = () => randomBytes(32).toString('base64url');
/** SAML AuthnRequest IDs must be XML NCNames (cannot start with a digit); prefix keeps them schema-valid. */
const requestId = () => `_${randomBytes(20).toString('hex')}`;

@Injectable()
export class SamlAuthRequestService {
  constructor(private readonly prisma: PrismaService) {}

  /** Create the persisted SP request, binding the config fingerprint + a single-use RelayState. Returns ids only. */
  async begin(config: SamlProviderConfig): Promise<BegunSamlRequest> {
    const rid = requestId();
    const relayState = token();
    await this.prisma.samlAuthRequest.create({
      data: tenantCreate<Prisma.SamlAuthRequestUncheckedCreateInput>({
        identityProviderId: config.providerId,
        requestId: rid,
        relayState,
        expectedAcsUrl: config.acsUrl,
        configFingerprint: configFingerprint(config),
        expiresAt: new Date(Date.now() + SAML_REQUEST_TTL_MS),
      }),
    });
    return { requestId: rid, relayState };
  }

  /**
   * Consume the pending request identified by the assertion's `InResponseTo`. Enforces existence, expiry, provider
   * match, config-fingerprint immutability, and single use (CAS). `relayState` (from the IdP round-trip) must match the
   * value bound at initiation (§3a). Throws a coded `SamlRequestError` (fail closed) on any violation.
   */
  async verifyAndConsume(inResponseTo: string, relayStateFromIdp: string, currentConfig: SamlProviderConfig): Promise<ConsumedSamlRequest> {
    const req = await this.prisma.samlAuthRequest.findFirst({ where: { requestId: inResponseTo } });
    if (!req) throw new SamlRequestError('unknown_request', 'unknown or invalid SAML request');
    if (req.consumedAt) throw new SamlRequestError('replay', 'SAML request already used');
    if (req.expiresAt.getTime() < Date.now()) throw new SamlRequestError('expired_request', 'SAML request expired');
    if (req.identityProviderId !== currentConfig.providerId) throw new SamlRequestError('unknown_request', 'SAML request provider mismatch');
    // RelayState integrity (§3a): the round-tripped value must equal the single-use token bound at initiation.
    if (!relayStateFromIdp || relayStateFromIdp !== req.relayState) throw new SamlRequestError('unknown_request', 'RelayState does not match the pending request');
    // Configuration-immutability invariant: the trusted config must not have changed since initiation (S4/S5).
    if (req.configFingerprint !== configFingerprint(currentConfig)) throw new SamlRequestError('config_fingerprint_mismatch', 'SAML provider configuration changed mid-transaction (fail closed)');
    // Single-use: compare-and-set consumedAt; a lost race (0 rows) means it was already consumed.
    const claimed = await this.prisma.samlAuthRequest.updateMany({ where: { id: req.id, consumedAt: null }, data: { consumedAt: new Date() } });
    if (claimed.count !== 1) throw new SamlRequestError('replay', 'SAML request already used');
    return { identityProviderId: req.identityProviderId, relayState: req.relayState, expectedAcsUrl: req.expectedAcsUrl };
  }

  /**
   * Record a validated assertion's `ID` as consumed (single-use). A replayed assertion (even riding a fresh request)
   * hits the unique constraint and is rejected (fail closed). Distinct from SP-request single-use.
   */
  async recordAssertionOnce(identityProviderId: string, assertionId: string, notOnOrAfter: Date | null): Promise<void> {
    try {
      await this.prisma.samlConsumedAssertion.create({
        data: tenantCreate<Prisma.SamlConsumedAssertionUncheckedCreateInput>({ identityProviderId, assertionId, notOnOrAfter: notOnOrAfter ?? undefined }),
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new SamlRequestError('replay', 'assertion has already been consumed');
      }
      throw e;
    }
  }
}
