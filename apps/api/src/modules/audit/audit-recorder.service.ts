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
  AdminStateKey,
  AuditMetadataValue,
  SessionTerminationScope,
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
   * Program 2 · P2-6C — administrative lifecycle capture (ADMINISTRATIVE, OPERATIONAL best-effort).
   * Four entity-neutral verbs; the entity is carried by `resource.type` (User | Client | ClientType |
   * Lab | Workspace). Emitted from the authoritative owner AFTER authorization + validation +
   * successful persistence. Organization scope + actor come from the ExecutionContext (never producer-
   * set). Every helper is best-effort: it NEVER throws, so an administrative success is never blocked
   * by an audit failure. No entity values, secrets, PHI, URLs, or free text ever enter the payload.
   */
  async recordEntityCreated(input: {
    resource: { type: string; id?: string | null; labId?: string | null };
    producerModule: string;
  }): Promise<void> {
    try {
      await this.record({
        category: 'ADMINISTRATIVE',
        actionCode: 'ENTITY_CREATED',
        resource: { type: input.resource.type, id: input.resource.id ?? null, labId: input.resource.labId ?? null },
        outcome: { status: 'SUCCESS' },
        producerModule: input.producerModule,
      });
    } catch (err) {
      this.logger.warn(
        `ENTITY_CREATED capture failed (${input.resource.type}); dropped (best-effort — the change is unaffected).`,
      );
    }
  }

  /**
   * ENTITY_UPDATED — mutable attributes of an existing administrative entity changed. `changedFields`
   * carries field NAMES only (the change-evidence channel); no before/after values are recorded.
   * By contract, `changedFields` lists the REQUESTED mutable fields written by the owner, not
   * semantically value-diffed fields — owners must NOT perform deep before/after value comparison to
   * populate it (that would risk reading/leaking values). Requested-fields is the intended semantics.
   */
  async recordEntityUpdated(input: {
    resource: { type: string; id?: string | null; labId?: string | null };
    changedFields: string[];
    producerModule: string;
  }): Promise<void> {
    try {
      await this.record({
        category: 'ADMINISTRATIVE',
        actionCode: 'ENTITY_UPDATED',
        resource: { type: input.resource.type, id: input.resource.id ?? null, labId: input.resource.labId ?? null },
        outcome: { status: 'SUCCESS' },
        change: { changedFields: input.changedFields },
        producerModule: input.producerModule,
      });
    } catch (err) {
      this.logger.warn(
        `ENTITY_UPDATED capture failed (${input.resource.type}); dropped (best-effort — the change is unaffected).`,
      );
    }
  }

  /**
   * ENTITY_STATE_CHANGED — an activation/block state transition. Bounded stateKey + before/after
   * booleans via admin.state_change.v1 (no values, PHI, or free text).
   */
  async recordEntityStateChanged(input: {
    resource: { type: string; id?: string | null; labId?: string | null };
    stateKey: AdminStateKey;
    previousValue?: boolean;
    newValue: boolean;
    producerModule: string;
  }): Promise<void> {
    try {
      const metadata: AuditMetadataValue = {
        stateKey: input.stateKey,
        newValue: input.newValue,
        ...(input.previousValue !== undefined ? { previousValue: input.previousValue } : {}),
      };
      await this.record({
        category: 'ADMINISTRATIVE',
        actionCode: 'ENTITY_STATE_CHANGED',
        resource: { type: input.resource.type, id: input.resource.id ?? null, labId: input.resource.labId ?? null },
        outcome: { status: 'SUCCESS' },
        metadata,
        producerModule: input.producerModule,
      });
    } catch (err) {
      this.logger.warn(
        `ENTITY_STATE_CHANGED capture failed (${input.resource.type}/${input.stateKey}); dropped (best-effort).`,
      );
    }
  }

  /**
   * ENTITY_DELETED — an administrative entity was deleted (routine admin CRUD, distinct from
   * DATA_MAINTENANCE:GOVERNED_DELETION_EXECUTED). Emitted after the delete commits.
   */
  async recordEntityDeleted(input: {
    resource: { type: string; id?: string | null; labId?: string | null };
    producerModule: string;
  }): Promise<void> {
    try {
      await this.record({
        category: 'ADMINISTRATIVE',
        actionCode: 'ENTITY_DELETED',
        resource: { type: input.resource.type, id: input.resource.id ?? null, labId: input.resource.labId ?? null },
        outcome: { status: 'SUCCESS' },
        producerModule: input.producerModule,
      });
    } catch (err) {
      this.logger.warn(
        `ENTITY_DELETED capture failed (${input.resource.type}); dropped (best-effort — the change is unaffected).`,
      );
    }
  }

  /**
   * Program 2 · P2-6D — authorization governance capture (AUTHORIZATION, OPERATIONAL best-effort).
   * Role lifecycle (ROLE_CREATED/UPDATED/DELETED — resource is the Role) and role-set assignment
   * (ROLE_ASSIGNMENT_CHANGED — resource is the grantee User, counts-only metadata). Emitted from the
   * authoritative owner AFTER authorization + validation + successful persistence. Best-effort: never
   * throws, so an authorization change is never blocked by an audit failure. No role ids/names,
   * permission lists, user names, or free text ever enter the payload.
   */
  async recordRoleCreated(input: {
    roleId: string;
    producerModule: string;
  }): Promise<void> {
    try {
      await this.record({
        category: 'AUTHORIZATION',
        actionCode: 'ROLE_CREATED',
        resource: { type: 'Role', id: input.roleId },
        outcome: { status: 'SUCCESS' },
        producerModule: input.producerModule,
      });
    } catch (err) {
      this.logger.warn(`ROLE_CREATED capture failed; dropped (best-effort — the change is unaffected).`);
    }
  }

  /**
   * ROLE_UPDATED — a role's attributes/permission set changed. `changedFields` carries field NAMES
   * only (the change-evidence channel) — never values. By contract, a permission-bundle change is
   * recorded as the single field name 'permissions', NEVER the individual permission ids or the
   * permission list; this is the intended, fixed semantics for future maintainers.
   */
  async recordRoleUpdated(input: {
    roleId: string;
    changedFields: string[];
    producerModule: string;
  }): Promise<void> {
    try {
      await this.record({
        category: 'AUTHORIZATION',
        actionCode: 'ROLE_UPDATED',
        resource: { type: 'Role', id: input.roleId },
        outcome: { status: 'SUCCESS' },
        change: { changedFields: input.changedFields },
        producerModule: input.producerModule,
      });
    } catch (err) {
      this.logger.warn(`ROLE_UPDATED capture failed; dropped (best-effort — the change is unaffected).`);
    }
  }

  /** ROLE_DELETED — a role was deleted. Emitted after the delete commits. */
  async recordRoleDeleted(input: {
    roleId: string;
    producerModule: string;
  }): Promise<void> {
    try {
      await this.record({
        category: 'AUTHORIZATION',
        actionCode: 'ROLE_DELETED',
        resource: { type: 'Role', id: input.roleId },
        outcome: { status: 'SUCCESS' },
        producerModule: input.producerModule,
      });
    } catch (err) {
      this.logger.warn(`ROLE_DELETED capture failed; dropped (best-effort — the change is unaffected).`);
    }
  }

  /**
   * ROLE_ASSIGNMENT_CHANGED — the set of roles held by a principal was replaced. ONE event per
   * replacement (never per-role, never split add/remove). Counts-only metadata via
   * authz.role_assignment.v1 — no role ids, names, permission lists, or user names.
   */
  async recordRoleAssignmentChanged(input: {
    userId: string;
    rolesAddedCount: number;
    rolesRemovedCount: number;
    resultingRoleCount?: number;
    producerModule: string;
  }): Promise<void> {
    try {
      const metadata: AuditMetadataValue = {
        rolesAddedCount: input.rolesAddedCount,
        rolesRemovedCount: input.rolesRemovedCount,
        ...(input.resultingRoleCount !== undefined ? { resultingRoleCount: input.resultingRoleCount } : {}),
      };
      await this.record({
        category: 'AUTHORIZATION',
        actionCode: 'ROLE_ASSIGNMENT_CHANGED',
        resource: { type: 'User', id: input.userId },
        outcome: { status: 'SUCCESS' },
        metadata,
        producerModule: input.producerModule,
      });
    } catch (err) {
      this.logger.warn(`ROLE_ASSIGNMENT_CHANGED capture failed; dropped (best-effort — the change is unaffected).`);
    }
  }

  /**
   * Program 2 · P2-6E — security-administration capture (SECURITY, OPERATIONAL best-effort). Each
   * helper emits ONE SUCCESS-only event from the authoritative SecurityService method after the
   * governing persistence completes, wrapped by the caller in the P2-6E0 runSystemAsCurrentActor
   * bridge so the event is SYSTEM-scoped yet retains the acting administrator's attribution. Bounded
   * resource ids + bounded metadata ONLY — never a raw IP, token, session token, device fingerprint,
   * email, block reason, or alert text. Best-effort: never throws, so a completed security action is
   * never blocked by an audit failure.
   */
  async recordAccountUnlocked(input: { userId: string; producerModule: string }): Promise<void> {
    try {
      await this.record({
        category: 'SECURITY',
        actionCode: 'ACCOUNT_UNLOCKED',
        resource: { type: 'User', id: input.userId },
        outcome: { status: 'SUCCESS' },
        producerModule: input.producerModule,
      });
    } catch (err) {
      this.logger.warn(`ACCOUNT_UNLOCKED capture failed; dropped (best-effort — the change is unaffected).`);
    }
  }

  async recordPasswordResetForced(input: { userId: string; producerModule: string }): Promise<void> {
    try {
      await this.record({
        category: 'SECURITY',
        actionCode: 'PASSWORD_RESET_FORCED',
        resource: { type: 'User', id: input.userId },
        outcome: { status: 'SUCCESS' },
        producerModule: input.producerModule,
      });
    } catch (err) {
      this.logger.warn(`PASSWORD_RESET_FORCED capture failed; dropped (best-effort — the change is unaffected).`);
    }
  }

  async recordUserMfaReset(input: { userId: string; producerModule: string }): Promise<void> {
    try {
      await this.record({
        category: 'SECURITY',
        actionCode: 'USER_MFA_RESET',
        resource: { type: 'User', id: input.userId },
        outcome: { status: 'SUCCESS' },
        producerModule: input.producerModule,
      });
    } catch (err) {
      this.logger.warn(`USER_MFA_RESET capture failed; dropped (best-effort — the change is unaffected).`);
    }
  }

  /**
   * SESSION_TERMINATED — ONE event per termination operation (never per-session fan-out).
   * `single` → resource is the UserSession; `all` → resource is the User. Bounded scope + count only.
   */
  async recordSessionTerminated(input: {
    scope: SessionTerminationScope;
    terminatedCount: number;
    resource: { type: string; id?: string | null };
    producerModule: string;
  }): Promise<void> {
    try {
      await this.record({
        category: 'SECURITY',
        actionCode: 'SESSION_TERMINATED',
        resource: { type: input.resource.type, id: input.resource.id ?? null },
        outcome: { status: 'SUCCESS' },
        metadata: { terminationScope: input.scope, terminatedCount: input.terminatedCount },
        producerModule: input.producerModule,
      });
    } catch (err) {
      this.logger.warn(`SESSION_TERMINATED capture failed; dropped (best-effort — the change is unaffected).`);
    }
  }

  /** IP_BLOCK_ADDED — resource is the durable BlockedIp row id; metadata carries only `permanent`. */
  async recordIpBlockAdded(input: { blockedIpId: string; permanent: boolean; producerModule: string }): Promise<void> {
    try {
      await this.record({
        category: 'SECURITY',
        actionCode: 'IP_BLOCK_ADDED',
        resource: { type: 'BlockedIp', id: input.blockedIpId },
        outcome: { status: 'SUCCESS' },
        metadata: { permanent: input.permanent },
        producerModule: input.producerModule,
      });
    } catch (err) {
      this.logger.warn(`IP_BLOCK_ADDED capture failed; dropped (best-effort — the change is unaffected).`);
    }
  }

  /** IP_BLOCK_REMOVED — resource is the removed BlockedIp row id (never the raw IP); no metadata. */
  async recordIpBlockRemoved(input: { blockedIpId: string; producerModule: string }): Promise<void> {
    try {
      await this.record({
        category: 'SECURITY',
        actionCode: 'IP_BLOCK_REMOVED',
        resource: { type: 'BlockedIp', id: input.blockedIpId },
        outcome: { status: 'SUCCESS' },
        producerModule: input.producerModule,
      });
    } catch (err) {
      this.logger.warn(`IP_BLOCK_REMOVED capture failed; dropped (best-effort — the change is unaffected).`);
    }
  }

  async recordTrustedDeviceRevoked(input: { trustedDeviceId: string; producerModule: string }): Promise<void> {
    try {
      await this.record({
        category: 'SECURITY',
        actionCode: 'TRUSTED_DEVICE_REVOKED',
        resource: { type: 'TrustedDevice', id: input.trustedDeviceId },
        outcome: { status: 'SUCCESS' },
        producerModule: input.producerModule,
      });
    } catch (err) {
      this.logger.warn(`TRUSTED_DEVICE_REVOKED capture failed; dropped (best-effort — the change is unaffected).`);
    }
  }

  async recordSecurityAlertResolved(input: { alertId: string; producerModule: string }): Promise<void> {
    try {
      await this.record({
        category: 'SECURITY',
        actionCode: 'SECURITY_ALERT_RESOLVED',
        resource: { type: 'SecurityAlert', id: input.alertId },
        outcome: { status: 'SUCCESS' },
        producerModule: input.producerModule,
      });
    } catch (err) {
      this.logger.warn(`SECURITY_ALERT_RESOLVED capture failed; dropped (best-effort — the change is unaffected).`);
    }
  }

  /**
   * Program 2 · P2-7C — capture a SUCCESSFUL PHI-projection read of the audit ledger
   * (SECURITY:AUDIT_EVENT_PHI_ACCESSED). Unlike the best-effort admin producers, this is FAIL-CLOSED:
   * the registry classifies it CRITICAL_TRANSACTIONAL, so this helper appends inside a recorder-owned
   * transaction and any failure PROPAGATES (it is NOT swallowed) — letting AuditQueryService withhold
   * the PHI response when capture fails. Actor/request/session/correlation come from the execution
   * context (never the producer); organization scope is context-derived (LAB, or SYSTEM via the P2-6E0
   * bridge at the call site). Bounded, NON-PHI metadata only — never patientRef, queried metadata,
   * filter values, cursors, or lab-id lists. The queried events are never mutated.
   */
  async recordAuditEventPhiAccessed(input: {
    accessMode: 'list' | 'detail';
    queryScope: 'LAB' | 'SYSTEM' | 'CROSS_LAB';
    resultCount: number;
    selectedLabCount?: number;
    pageSize?: number;
    hasMore?: boolean;
    resource: { type: string; id: string };
  }): Promise<void> {
    const metadata: AuditMetadataValue = {
      accessMode: input.accessMode,
      queryScope: input.queryScope,
      resultCount: input.resultCount,
      ...(input.selectedLabCount !== undefined ? { selectedLabCount: input.selectedLabCount } : {}),
      ...(input.pageSize !== undefined ? { pageSize: input.pageSize } : {}),
      ...(input.hasMore !== undefined ? { hasMore: input.hasMore } : {}),
    };
    // Fail-closed: append inside a recorder-owned transaction; a failure propagates (no best-effort
    // swallow). record() honors CRITICAL_TRANSACTIONAL by appending on this supplied tx.
    await this.prisma.$transaction((tx) =>
      this.record(
        {
          category: 'SECURITY',
          actionCode: 'AUDIT_EVENT_PHI_ACCESSED',
          resource: { type: input.resource.type, id: input.resource.id },
          outcome: { status: 'SUCCESS' },
          metadata,
          producerModule: 'audit-query',
        },
        { tx },
      ),
    );
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
