import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditRecordInput, PLATFORM_OWNED_FIELDS } from './audit.contract';
import { resolveCurrent } from './audit.registry';
import { validateMetadata } from './audit-metadata';
import {
  assertOrganizationScope,
  validateChangeEvidence,
} from './audit-validation';

export class AuditPlatformFieldError extends Error {
  constructor(field: string) {
    super(
      `Producer supplied platform-owned field "${field}"; it is resolved by the Audit ` +
        `owner and prohibited by contract on input.`,
    );
    this.name = 'AuditPlatformFieldError';
  }
}

/** Current storage-envelope version. Bumped only on a structural storage migration. */
export const AUDIT_SCHEMA_VERSION = 1;

/**
 * Program 2 · P2-1 — Audit ledger persistence boundary (append-only).
 *
 * This is the ONLY code permitted to touch the Prisma `AuditEvent` model. It exposes a
 * single append path and DELIBERATELY provides NO update or delete method — the audit
 * ledger is immutable by contract (§Immutability). Row-level UPDATE/DELETE revocation at
 * the database role level is a P2-10 certification obligation, not claimed here.
 *
 * It is NOT the producer-facing capture API. AuditRecorder (request enrichment, attribution
 * enforcement, hash-chain assignment) is P2-2..P2-4. This service is intentionally not wired
 * into any domain owner in P2-1; it exists so the owner boundary and immutability guarantees
 * can be built and tested truthfully without implying live capture.
 */
@Injectable()
export class AuditPersistenceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validate an event against the contract and append it to the ledger. Resolves all
   * platform-owned classification from the registry (severity, data/PHI/retention/durability,
   * eventVersion) — a producer cannot set them. Runs inside the caller's transaction when a
   * `tx` client is supplied (CRITICAL_TRANSACTIONAL durability, P2-3).
   *
   * @returns the new event's id (eventId). No mutable handle to the row is returned.
   */
  async append(
    input: AuditRecordInput,
    tx?: Prisma.TransactionClient,
  ): Promise<string> {
    const data = this.buildCreateData(input);
    const client = tx ?? this.prisma;
    const created = await client.auditEvent.create({
      data,
      select: { id: true },
    });
    return created.id;
  }

  /**
   * The COMPLETE validation boundary. `append()` is the only insertion route and it calls this
   * — there is no unchecked, raw, or Prisma-shaped path into the ledger. Exposed (internal to
   * the owner) so the boundary can be unit-tested without a database. Order:
   *   reject platform-owned fields → resolve current registry definition → resolve platform
   *   eventVersion → apply registry defaults → validate scope → validate metadata contract →
   *   validate change evidence → map only validated canonical values to Prisma.
   * A producer can never set eventVersion or any platform-owned field.
   */
  buildCreateData(input: AuditRecordInput): Prisma.AuditEventCreateInput {
    this.rejectPlatformOwnedFields(input);

    // Registry membership + platform-owned event version (never producer-supplied).
    const entry = resolveCurrent(input.category, input.action.code);

    assertOrganizationScope(input.organization);
    const metadata = validateMetadata(entry.metadataContractId, input.metadata);
    validateChangeEvidence(input.change);

    return {
      // identity — platform-owned; id/recordedAt default, sequence/integrity stay null (P2-4)
      occurredAt: input.occurredAt ?? new Date(),
      schemaVersion: AUDIT_SCHEMA_VERSION,
      eventVersion: entry.eventVersion,

      // classification — resolved from the registry, never from the producer
      category: input.category,
      severity: entry.defaultSeverity,
      phiIndicator: entry.phiIndicator,
      dataClass: entry.dataClass,
      retentionClass: entry.retentionClass,
      durabilityClass: entry.durabilityClass,

      // actor
      actorType: input.actor.type,
      actorId: input.actor.id ?? null,
      onBehalfOfActorId: input.actor.onBehalfOfId ?? null,
      servicePrincipal: input.actor.servicePrincipal ?? null,

      // organization / scope (scopeLabId, not labId — opts out of tenancy auto-scoping)
      organizationScope: input.organization.scope,
      scopeLabId: input.organization.labId ?? null,
      organizationId: input.organization.organizationId ?? null,

      // request context (optional)
      requestId: input.request?.requestId ?? null,
      correlationId: input.request?.correlationId ?? null,
      ipAddress: input.request?.ipAddress ?? null,
      userAgent: input.request?.userAgent ?? null,
      deviceId: input.request?.deviceId ?? null,
      route: input.request?.route ?? null,
      httpMethod: input.request?.httpMethod ?? null,

      // session context (optional)
      sessionId: input.session?.sessionId ?? null,
      sessionKind: input.session?.sessionKind ?? null,

      // resource
      resourceType: input.resource.type,
      resourceId: input.resource.id ?? null,
      resourceLabId: input.resource.labId ?? null,
      parentResourceType: input.resource.parentType ?? null,
      parentResourceId: input.resource.parentId ?? null,
      patientRef: input.resource.patientRef ?? null,

      // action + outcome
      actionCode: input.action.code,
      detailCode: input.action.detailCode ?? null,
      outcome: input.outcome.status,
      statusCode: input.outcome.statusCode ?? null,
      errorCode: input.outcome.errorCode ?? null,
      reasonCode: input.outcome.reasonCode ?? null,

      // change evidence (names + hashes only)
      changedFields: input.change?.changedFields ?? [],
      beforeHash: input.change?.beforeHash ?? null,
      afterHash: input.change?.afterHash ?? null,

      // producer attribution + typed metadata
      producerModule: input.producerModule,
      executionId: input.executionId ?? null,
      metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    };
  }

  /**
   * Runtime backstop for the compile-time exclusion in the contract: even a caller that casts
   * around the type cannot smuggle a platform-owned field (eventId, sequence, integrity, …)
   * onto a persisted event. The typed contract already omits them; this rejects them if present.
   */
  private rejectPlatformOwnedFields(input: AuditRecordInput): void {
    const raw = input as unknown as Record<string, unknown>;
    for (const field of PLATFORM_OWNED_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(raw, field)) {
        throw new AuditPlatformFieldError(field);
      }
    }
  }
}
