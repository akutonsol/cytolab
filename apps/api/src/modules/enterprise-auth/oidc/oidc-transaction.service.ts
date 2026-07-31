import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import { tenantCreate } from '../../../common/tenancy/tenancy.extension';
import { OidcProviderConfig, configFingerprint, pkceS256Challenge } from './oidc-config';

/**
 * Program 7 · Phase 7A.2a — the server-side OIDC authorization transaction. `begin` mints the CSRF `state`, the replay
 * `nonce`, and the PKCE verifier, binds the trusted config fingerprint at initiation, and persists a short-lived
 * single-use row (survives the IdP redirect). `verifyAndConsume` (on callback) enforces, fail-closed: existence,
 * not-expired, single-use (compare-and-set on `consumedAt`), and the **configuration-immutability invariant** — the
 * fingerprint bound at initiation must equal the provider's CURRENT trusted config, else the trust basis changed
 * mid-transaction and the callback is rejected. Lab-scoped.
 */
export interface BegunTransaction {
  state: string;
  nonce: string;
  pkceChallenge: string;
  transactionUuid: string; // non-secret stable correlation id (safe for audit metadata)
}

export interface ConsumedTransaction {
  identityProviderId: string;
  nonce: string;
  pkceVerifier: string;
  redirectUri: string;
  expectedIssuer: string;
  clientId: string;
}

const TTL_MS = 10 * 60 * 1000;
const token = () => randomBytes(32).toString('base64url');

@Injectable()
export class OidcTransactionService {
  constructor(private readonly prisma: PrismaService) {}

  async begin(config: OidcProviderConfig): Promise<BegunTransaction> {
    const state = token();
    const nonce = token();
    const pkceVerifier = token();
    const row = await this.prisma.oidcAuthTransaction.create({
      data: tenantCreate<Prisma.OidcAuthTransactionUncheckedCreateInput>({
        identityProviderId: config.providerId,
        state,
        nonce,
        pkceVerifier,
        redirectUri: config.redirectUri,
        expectedIssuer: config.expectedIssuer,
        clientId: config.clientId,
        configFingerprint: configFingerprint(config),
        expiresAt: new Date(Date.now() + TTL_MS),
      }),
      select: { transactionUuid: true },
    });
    return { state, nonce, pkceChallenge: pkceS256Challenge(pkceVerifier), transactionUuid: row.transactionUuid };
  }

  async verifyAndConsume(state: string, currentConfig: OidcProviderConfig): Promise<ConsumedTransaction> {
    const tx = await this.prisma.oidcAuthTransaction.findFirst({ where: { state } });
    if (!tx) throw new UnauthorizedException('unknown or invalid OIDC state');
    if (tx.consumedAt) throw new UnauthorizedException('OIDC transaction already used');
    if (tx.expiresAt.getTime() < Date.now()) throw new UnauthorizedException('OIDC transaction expired');
    if (tx.identityProviderId !== currentConfig.providerId) throw new UnauthorizedException('OIDC provider mismatch');
    // Configuration-immutability invariant: the trusted config must not have changed since initiation.
    if (tx.configFingerprint !== configFingerprint(currentConfig)) {
      throw new UnauthorizedException('OIDC provider configuration changed mid-transaction (fail closed)');
    }
    // Single-use: compare-and-set consumedAt; a lost race (0 rows) means it was already consumed.
    const claimed = await this.prisma.oidcAuthTransaction.updateMany({ where: { id: tx.id, consumedAt: null }, data: { consumedAt: new Date() } });
    if (claimed.count !== 1) throw new UnauthorizedException('OIDC transaction already used');
    if (!tx.nonce || !tx.pkceVerifier) throw new BadRequestException('OIDC transaction is malformed');
    return { identityProviderId: tx.identityProviderId, nonce: tx.nonce, pkceVerifier: tx.pkceVerifier, redirectUri: tx.redirectUri, expectedIssuer: tx.expectedIssuer, clientId: tx.clientId };
  }
}
