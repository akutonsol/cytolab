/**
 * R-016b — Sealed-generation REGISTRATION (the only writer of AuditChainSeal).
 *
 * Sealing a frozen generation is an EXPLICIT, AUTHORIZED, FAIL-CLOSED operation. This service never
 * runs at bootstrap and is never invoked by the integrity monitor (the monitor is report-only and must
 * never auto-seal). A seal is written ONLY when the deployed generation reproduces an AUTHORIZED
 * snapshot exactly — every one of {eventCount, terminalSequence, terminalSelfHash, snapshotDigest}.
 * Seals are APPEND-ONLY: an existing seal is never updated or deleted; a non-matching existing seal is
 * a hard error.
 *
 * The authorized `system` gen-0 snapshot below was INDEPENDENTLY DERIVED from the three frozen legacy
 * rows using the production {@link snapshotGeneration} helper (derivation + evidence recorded under
 * RISK_REGISTER R-016b). Because registration re-derives from the live DB and requires an exact match,
 * a deployment whose `system` rows differ from the authorized snapshot in ANY field fails to seal.
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { LEGACY_SYSTEM_CHAIN_ID } from './audit-chain';
import { GenerationSnapshot, snapshotGeneration, snapshotsEqual } from './audit-generation-snapshot';
import { VerifiableAuditRow } from './audit-verification.service';

export class SealRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SealRegistrationError';
  }
}

export interface SealRegistrationResult {
  outcome: 'sealed' | 'already-sealed';
  chainId: string;
  snapshot: GenerationSnapshot;
}

/**
 * AUTHORIZED `system` generation-0 seal (R-016b). Independently derived from the three frozen rows.
 * Do NOT edit these values to match a drifted deployment — a mismatch is a signal, not a nuisance.
 */
export const AUTHORIZED_SYSTEM_GENERATION_SEAL: GenerationSnapshot = {
  eventCount: 3,
  terminalSequence: '3',
  terminalSelfHash: '7d24dc072f8fd08ed28234da4857715270287daba85a4bb583b547b800232590',
  snapshotDigest: '1e5276a0c0a30eee13640c06e4186c18985651703838abff830072a70cb734bd',
};

export const SYSTEM_GENERATION_SEAL_REASON =
  'R-016a frozen SYSTEM generation-0: pre-P2-4C rows, broken interior linkage, headless. Sealed per R-016b.';

@Injectable()
export class AuditSealRegistrarService {
  private readonly logger = new Logger(AuditSealRegistrarService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Load a generation's full rows ordered by sequence (same reader shape the verifier uses). */
  private async loadGeneration(chainId: string): Promise<VerifiableAuditRow[]> {
    return (await this.prisma.auditEvent.findMany({
      where: { chainId },
      orderBy: { sequence: 'asc' },
    })) as unknown as VerifiableAuditRow[];
  }

  /**
   * Register a seal for a frozen generation — FAIL CLOSED. The caller supplies the AUTHORIZED expected
   * snapshot; the deployed generation is loaded, reduced to its actual snapshot, and a seal is written
   * only on an exact four-field match. A pre-existing matching seal is honored idempotently; a
   * pre-existing seal that does not match the deployed generation is a hard error (never overwritten).
   */
  async registerSeal(
    chainId: string,
    expected: GenerationSnapshot,
    reason: string,
    sealedBy: string | null,
  ): Promise<SealRegistrationResult> {
    const rows = await this.loadGeneration(chainId);
    if (rows.length === 0) {
      throw new SealRegistrationError(`refusing to seal "${chainId}": no events found for this generation`);
    }

    let actual: GenerationSnapshot;
    try {
      actual = snapshotGeneration(rows);
    } catch (e: any) {
      throw new SealRegistrationError(`refusing to seal "${chainId}": ${e?.message ?? e}`);
    }

    if (!snapshotsEqual(actual, expected)) {
      throw new SealRegistrationError(
        `refusing to seal "${chainId}": deployed generation does not match the authorized snapshot ` +
          `(expected count=${expected.eventCount} terminalSeq=${expected.terminalSequence} ` +
          `terminalSelfHash=${expected.terminalSelfHash} digest=${expected.snapshotDigest}; ` +
          `actual count=${actual.eventCount} terminalSeq=${actual.terminalSequence} ` +
          `terminalSelfHash=${actual.terminalSelfHash} digest=${actual.snapshotDigest})`,
      );
    }

    const existing = await this.prisma.auditChainSeal.findUnique({ where: { chainId } });
    if (existing) {
      if (!snapshotsEqual(actual, existing)) {
        throw new SealRegistrationError(
          `refusing to re-seal "${chainId}": an existing seal does not match the deployed generation ` +
            `(seals are append-only and never overwritten)`,
        );
      }
      this.logger.log(`R-016b: generation "${chainId}" already sealed and matches; no write performed`);
      return { outcome: 'already-sealed', chainId, snapshot: actual };
    }

    await this.prisma.auditChainSeal.create({
      data: {
        chainId,
        reason,
        sealedBy,
        eventCount: actual.eventCount,
        terminalSequence: BigInt(actual.terminalSequence),
        terminalSelfHash: actual.terminalSelfHash,
        snapshotDigest: actual.snapshotDigest,
      },
    });
    this.logger.log(
      `R-016b: sealed frozen generation "${chainId}" (events=${actual.eventCount}, ` +
        `terminalSeq=${actual.terminalSequence}, digest=${actual.snapshotDigest})`,
    );
    return { outcome: 'sealed', chainId, snapshot: actual };
  }

  /**
   * Explicit, authorized registration of the initial `system` gen-0 seal against the authorized
   * snapshot. Never auto-invoked; fails closed if the deployed `system` generation does not match.
   */
  async registerInitialSystemSeal(sealedBy: string | null = null): Promise<SealRegistrationResult> {
    return this.registerSeal(
      LEGACY_SYSTEM_CHAIN_ID,
      AUTHORIZED_SYSTEM_GENERATION_SEAL,
      SYSTEM_GENERATION_SEAL_REASON,
      sealedBy,
    );
  }
}
