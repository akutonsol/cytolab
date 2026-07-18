import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ExecutionContextService } from '../../common/execution-context/execution-context.service';
import {
  AuditCategory,
  AuditChangeInput,
  AuditOrganizationInput,
  AuditOutcomeInput,
  AuditRecordInput,
  AuditResourceInput,
} from './audit.contract';
import { PrismaService } from '../../database/prisma.service';
import {
  AuditMetadataValue,
  PhiAccessMode,
  PhiAccessSurface,
  PhiDocumentType,
  PhiFilterClass,
  PhiProducerModule,
  PhiReasonCode,
  PhiRedactionState,
} from './audit-metadata';
import { AuditPersistenceService } from './audit-persistence.service';
import { resolveCurrent, UnknownAuditEventError } from './audit.registry';
import { derivePatientRef } from './phi-ref';
import { PhiAccessDedup } from './phi-access-dedup';

/**
 * Program 2 · P2-5C — producer-facing input for a SUCCESSFUL single-subject PHI read. Owners
 * supply only intent + owner-derived patientId + bounded metadata; the recorder derives the
 * patientRef, dedupes per request, and records (OPERATIONAL). Owners never build patientRef,
 * never touch AuditPersistenceService, and never see audit state.
 */
export interface PhiReadCapture {
  patientId: string;
  accessSurface: PhiAccessSurface;
  accessMode: PhiAccessMode;
  producerModule: PhiProducerModule;
  resource: { type: string; id?: string | null; labId?: string | null };
  documentType?: PhiDocumentType;
  redactionState?: PhiRedactionState;
  reasonCode?: PhiReasonCode;
}

/**
 * Program 2 · P2-5D — producer input for a SUCCESSFUL aggregate PHI list/search/queue read
 * (PATIENT_LIST_QUERIED, patientRef null). One event per (action, surface, execution). Owners supply
 * only the bounded shape + a truthful resultCount; the recorder dedupes and records (OPERATIONAL).
 */
export interface PhiListCapture {
  accessSurface: PhiAccessSurface; // 'list' | 'search'
  producerModule: PhiProducerModule;
  resultCount: number; // PHI-bearing items returned in THIS response
  resourceType: string;
  pageSize?: number;
  filterClass?: PhiFilterClass;
  redactionState?: PhiRedactionState;
  reasonCode?: PhiReasonCode;
}

/**
 * Program 2 · P2-5D — producer input for a SUCCESSFUL export artifact (PHI_EXPORTED, patientRef
 * null). One event per (action, surface, execution). Emitted only after the export success boundary.
 */
export interface PhiExportCapture {
  accessSurface: PhiAccessSurface; // 'export'
  producerModule: PhiProducerModule;
  resourceType: string;
  resultCount?: number; // rows/artifacts exported, when known
  documentType?: PhiDocumentType;
  filterClass?: PhiFilterClass;
  redactionState?: PhiRedactionState;
  reasonCode?: PhiReasonCode;
}

/**
 * Producer-facing intent. Owners publish semantic intent only — WHAT happened and to WHICH
 * resource — never a persistence row. Attribution (actor/organization/request/session) is
 * supplied exclusively by the ExecutionContext, and classification (severity/retention/
 * durability/PHI/eventVersion) exclusively by the registry. A producer therefore cannot set
 * any platform-owned or attribution field: they are absent from this type.
 */
export interface AuditRecordIntent {
  category: AuditCategory;
  actionCode: string;
  detailCode?: string;
  resource: AuditResourceInput;
  outcome: AuditOutcomeInput;
  metadata?: AuditMetadataValue;
  change?: AuditChangeInput;
  /** The emitting module (owner boundary). Should be a registry-derived constant. */
  producerModule: string;
}

export interface AuditRecordOptions {
  /** When the owner already holds a Prisma transaction, the audit append joins it. */
  tx?: Prisma.TransactionClient;
}

export class AuditCaptureError extends Error {
  constructor(
    readonly category: AuditCategory,
    readonly actionCode: string,
    readonly cause: unknown,
  ) {
    super(
      `Audit capture failed for (${category}, ${actionCode}): ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
    this.name = 'AuditCaptureError';
  }
}

/** CRITICAL_TRANSACTIONAL was invoked without an owner transaction to append inside. */
export class AuditTransactionRequiredError extends Error {
  constructor(category: AuditCategory, actionCode: string) {
    super(
      `(${category}, ${actionCode}) is CRITICAL_TRANSACTIONAL and must be recorded inside an ` +
        `owner transaction; record() was called without one. Failing closed.`,
    );
    this.name = 'AuditTransactionRequiredError';
  }
}

/**
 * REQUIRED_DURABLE has no supported durable-delivery mechanism in P2-3 (no outbox/queue exists).
 * It fails closed rather than pretending durability — it must NEVER log-and-swallow.
 */
export class AuditDurabilityUnsupportedError extends Error {
  constructor(category: AuditCategory, actionCode: string) {
    super(
      `(${category}, ${actionCode}) is classified REQUIRED_DURABLE, but no durable-delivery ` +
        `mechanism exists in P2-3. Failing closed — REQUIRED_DURABLE must not be silently dropped. ` +
        `Wire it inside an owner transaction (CRITICAL_TRANSACTIONAL) or classify it OPERATIONAL ` +
        `until a durable outbox exists (P2-3+).`,
    );
    this.name = 'AuditDurabilityUnsupportedError';
  }
}

/**
 * Program 2 · P2-3 — the ONLY runtime path from an owner's intent to the immutable ledger:
 *
 *   Owner → AuditRecorder.record() → ExecutionContext (attribution) + Registry (classification)
 *         → canonical AuditRecordInput → AuditPersistenceService.append() → AuditEvent.create()
 *
 * No owner may reach AuditPersistenceService or Prisma AuditEvent directly. Integrity fields
 * (chainId/prevHash/selfHash) and sequence stay NULL in P2-3 — activated in P2-4.
 */
@Injectable()
export class AuditRecorder {
  private readonly logger = new Logger(AuditRecorder.name);

  constructor(
    private readonly persistence: AuditPersistenceService,
    private readonly executionContext: ExecutionContextService,
    private readonly prisma: PrismaService,
    private readonly phiDedup: PhiAccessDedup,
  ) {}

  /**
   * Program 2 · P2-5C — capture a SUCCESSFUL single-subject PHI read. THE producer-facing PHI path
   * (AuditRecorder remains the only exported capture boundary; PhiAccessDedup + derivePatientRef
   * stay internal). Owners call this AFTER authorization/tenancy have passed and the read returned
   * actual PHI, with an owner-derived patientId. It:
   *   derives patientRef (internal UUID) → dedupes per (patientRef, surface, execution) → records
   *   PATIENT_RECORD_VIEWED (OPERATIONAL) with bounded phi.access.v2 metadata.
   * It is BEST-EFFORT and NEVER throws — a bad id, a dedupe miss, or an append failure is logged at
   * WARN and swallowed, so PHI capture can never break the clinical read it observes.
   */
  async recordPhiRead(input: PhiReadCapture): Promise<void> {
    try {
      const patientRef = derivePatientRef({ patientId: input.patientId });
      if (!this.phiDedup.shouldEmitSingleSubject({ patientRef, accessSurface: input.accessSurface })) {
        return; // already recorded this patient+surface in this request
      }
      const metadata: AuditMetadataValue = {
        accessSurface: input.accessSurface,
        accessMode: input.accessMode,
        producerModule: input.producerModule,
        ...(input.documentType ? { documentType: input.documentType } : {}),
        ...(input.redactionState ? { redactionState: input.redactionState } : {}),
        ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
      };
      await this.record({
        category: 'PHI_ACCESS',
        actionCode: 'PATIENT_RECORD_VIEWED',
        resource: { type: input.resource.type, id: input.resource.id ?? null, labId: input.resource.labId ?? null, patientRef },
        outcome: { status: 'SUCCESS' },
        metadata,
        producerModule: input.producerModule,
      });
    } catch (err) {
      // OPERATIONAL best-effort extends to the whole PHI-capture path (derivation/dedupe/record).
      this.logger.warn(
        `PHI-access capture failed (${input.accessSurface}); dropped (best-effort — the read is unaffected).`,
      );
    }
  }

  /**
   * Program 2 · P2-5D — capture a SUCCESSFUL aggregate PHI list/search/queue read
   * (PATIENT_LIST_QUERIED, patientRef null). ONE event per (action, surface, execution) via the
   * frozen aggregate dedup. Emits ONLY when `resultCount > 0` (a zero-result response exposes no
   * PHI). Best-effort — never throws, so it cannot break the list read.
   */
  async recordPhiList(input: PhiListCapture): Promise<void> {
    try {
      if (input.resultCount <= 0) return; // zero-result → no PHI exposed → no event
      if (!this.phiDedup.shouldEmitAggregate({ actionCode: 'PATIENT_LIST_QUERIED', accessSurface: input.accessSurface })) {
        return;
      }
      const metadata: AuditMetadataValue = {
        accessSurface: input.accessSurface,
        accessMode: 'view',
        producerModule: input.producerModule,
        resultCount: input.resultCount,
        ...(input.pageSize !== undefined ? { pageSize: input.pageSize } : {}),
        ...(input.filterClass ? { filterClass: input.filterClass } : {}),
        ...(input.redactionState ? { redactionState: input.redactionState } : {}),
        ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
      };
      await this.record({
        category: 'PHI_ACCESS',
        actionCode: 'PATIENT_LIST_QUERIED',
        resource: { type: input.resourceType, patientRef: null }, // aggregate — no single patient
        outcome: { status: 'SUCCESS' },
        metadata,
        producerModule: input.producerModule,
      });
    } catch (err) {
      this.logger.warn(
        `PHI list capture failed (${input.accessSurface}); dropped (best-effort — the read is unaffected).`,
      );
    }
  }

  /**
   * Program 2 · P2-5D — capture a SUCCESSFUL export artifact (PHI_EXPORTED, patientRef null). ONE
   * event per (action, surface, execution). Emitted only after the export success boundary; a known
   * empty export (`resultCount === 0`) exposes no PHI and emits nothing. Best-effort — never throws.
   */
  async recordPhiExport(input: PhiExportCapture): Promise<void> {
    try {
      if (input.resultCount !== undefined && input.resultCount <= 0) return; // empty export → no PHI
      if (!this.phiDedup.shouldEmitAggregate({ actionCode: 'PHI_EXPORTED', accessSurface: input.accessSurface })) {
        return;
      }
      const metadata: AuditMetadataValue = {
        accessSurface: input.accessSurface,
        accessMode: 'export',
        producerModule: input.producerModule,
        ...(input.documentType ? { documentType: input.documentType } : {}),
        ...(input.resultCount !== undefined ? { resultCount: input.resultCount } : {}),
        ...(input.filterClass ? { filterClass: input.filterClass } : {}),
        ...(input.redactionState ? { redactionState: input.redactionState } : {}),
        ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
      };
      await this.record({
        category: 'PHI_ACCESS',
        actionCode: 'PHI_EXPORTED',
        resource: { type: input.resourceType, patientRef: null },
        outcome: { status: 'SUCCESS' },
        metadata,
        producerModule: input.producerModule,
      });
    } catch (err) {
      this.logger.warn(
        `PHI export capture failed (${input.accessSurface}); dropped (best-effort — the export is unaffected).`,
      );
    }
  }

  /**
   * Program 2 · P2-6 — capture a SUCCESSFUL administrative CONFIGURATION change (SETTING_CHANGED,
   * OPERATIONAL). Emitted after authorization + validation + successful persistence, from the
   * authoritative owner. Uses the frozen registry action + config.setting_change.v1 metadata
   * ({ settingKey, scope } — bounded codes only; NEVER secrets/tokens/credentials/PHI). Best-effort:
   * never throws, so administrative success is never blocked by an audit failure.
   */
  async recordSettingChanged(input: {
    settingKey: string; // a bounded setting/config/policy code — never a secret or free text
    scope: string; // 'lab' | 'system' | 'user'
    producerModule: string;
    resource: { type: string; id?: string | null; labId?: string | null };
  }): Promise<void> {
    try {
      await this.record({
        category: 'CONFIGURATION',
        actionCode: 'SETTING_CHANGED',
        resource: { type: input.resource.type, id: input.resource.id ?? null, labId: input.resource.labId ?? null },
        outcome: { status: 'SUCCESS' },
        metadata: { settingKey: input.settingKey, scope: input.scope },
        producerModule: input.producerModule,
      });
    } catch (err) {
      this.logger.warn(
        `SETTING_CHANGED capture failed (${input.settingKey}); dropped (best-effort — the change is unaffected).`,
      );
    }
  }

  /**
   * Record an audit event. The registry — never the producer — is the sole durability authority.
   * Each class is honored TRUTHFULLY for what the P2-3 runtime can actually provide (no outbox /
   * retry queue exists yet):
   *   - CRITICAL_TRANSACTIONAL → requires a supplied owner transaction; the chained append runs on
   *     that same tx and any failure propagates so the owner mutation rolls back. Called WITHOUT a
   *     tx it fails closed (AuditTransactionRequiredError) — it never appends outside a transaction.
   *   - REQUIRED_DURABLE → NOT supported for live capture; it fails closed
   *     (AuditDurabilityUnsupportedError) BEFORE any append. It must never log-and-swallow.
   *   - OPERATIONAL → the recorder opens ONE recorder-owned transaction (needed because the append
   *     is now multi-statement chain work) and performs the chained append inside it; a failure is
   *     logged and swallowed (best-effort, no durability claim, never breaks the business op). The
   *     transaction exists only for chain consistency, not for stronger durability — a rolled-back
   *     append consumes no sequence.
   * An unregistered event fails closed (propagates), so a mis-registered producer is surfaced.
   */
  async record(intent: AuditRecordIntent, opts?: AuditRecordOptions): Promise<void> {
    const durability = this.resolveDurability(intent);

    // Fail closed BEFORE capture for any class the runtime cannot truthfully honor.
    if (durability === 'REQUIRED_DURABLE') {
      throw new AuditDurabilityUnsupportedError(intent.category, intent.actionCode);
    }
    if (durability === 'UNKNOWN') {
      // Unregistered event — cannot be classified/chained. Surface the precise registry error.
      try {
        resolveCurrent(intent.category, intent.actionCode);
      } catch (err) {
        throw new AuditCaptureError(intent.category, intent.actionCode, err);
      }
      throw new AuditCaptureError(
        intent.category,
        intent.actionCode,
        new UnknownAuditEventError(intent.category, intent.actionCode),
      );
    }
    if (durability === 'CRITICAL_TRANSACTIONAL' && !opts?.tx) {
      throw new AuditTransactionRequiredError(intent.category, intent.actionCode);
    }

    const input = this.enrich(intent);

    if (durability === 'OPERATIONAL') {
      // Recorder-owned transaction, purely for chain-append atomicity. Best-effort: swallow on fail.
      try {
        await this.prisma.$transaction((tx) => this.persistence.append(input, tx));
      } catch {
        this.logger.warn(
          `OPERATIONAL audit capture failed (${intent.category}, ${intent.actionCode}); dropped ` +
            `(best-effort — no durability claim).`,
        );
      }
      return;
    }

    // CRITICAL_TRANSACTIONAL — append on the owner-supplied transaction; failure propagates so the
    // owner mutation rolls back together with the event and the chain-head advance.
    try {
      await this.persistence.append(input, opts!.tx!);
    } catch (err) {
      throw new AuditCaptureError(intent.category, intent.actionCode, err);
    }
  }

  /**
   * Combine producer intent + ExecutionContext attribution into the canonical AuditRecordInput.
   * Attribution comes ONLY from the context; the producer contributes only intent. Registry
   * classification is resolved later, inside the persistence boundary.
   */
  private enrich(intent: AuditRecordIntent): AuditRecordInput {
    const attribution = this.executionContext.getAttribution();
    const actor = attribution?.actor;
    const org = attribution?.organization;
    const request = attribution?.request;
    const session = attribution?.session;

    // Organization must satisfy the scope invariant; fall back to SYSTEM (no fabricated tenant)
    // when no context organization is present (e.g. an un-instrumented internal path).
    const organization: AuditOrganizationInput = org
      ? { scope: org.scope, labId: org.labId ?? null, organizationId: org.organizationId ?? null }
      : { scope: 'SYSTEM' };

    const outcome: AuditOutcomeInput = intent.outcome;

    return {
      category: intent.category,
      action: { code: intent.actionCode, detailCode: intent.detailCode ?? null },
      actor: actor
        ? {
            type: actor.actorType,
            id: actor.actorId ?? null,
            onBehalfOfId: actor.onBehalfOfActorId ?? null,
            servicePrincipal: actor.servicePrincipal ?? null,
          }
        : { type: 'SYSTEM' },
      organization,
      resource: intent.resource,
      outcome,
      request:
        request || attribution?.correlationId
          ? {
              requestId: request?.requestId ?? null,
              correlationId: attribution?.correlationId ?? null,
              ipAddress: request?.ipAddress ?? null,
              userAgent: request?.userAgent ?? null,
              deviceId: request?.deviceId ?? null,
              route: request?.apiRoute ?? null,
              httpMethod: request?.httpMethod ?? null,
            }
          : undefined,
      session: session
        ? { sessionId: session.sessionId ?? null, sessionKind: session.sessionKind ?? null }
        : undefined,
      change: intent.change,
      producerModule: intent.producerModule,
      executionId: attribution?.execution?.executionId ?? null,
      metadata: intent.metadata,
    };
  }

  /**
   * The registry is the sole durability authority — a producer intent has no durability field and
   * cannot influence this. A genuinely unknown event is reported as UNKNOWN so it propagates on
   * append rather than being swallowed.
   */
  private resolveDurability(
    intent: AuditRecordIntent,
  ): 'CRITICAL_TRANSACTIONAL' | 'REQUIRED_DURABLE' | 'OPERATIONAL' | 'UNKNOWN' {
    try {
      return resolveCurrent(intent.category, intent.actionCode).durabilityClass;
    } catch {
      return 'UNKNOWN';
    }
  }
}
