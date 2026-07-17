import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditRecordInput, PLATFORM_OWNED_FIELDS } from './audit.contract';
import { resolveCurrent } from './audit.registry';
import { validateMetadata, AuditMetadataValue } from './audit-metadata';
import {
  assertOrganizationScope,
  validateChangeEvidence,
} from './audit-validation';
import { AUDIT_HASH_ALGORITHM, deriveChainId } from './audit-chain';
import { AuditCanonicalFields, computeSelfHash } from './audit-hash';
import { AuditChainService } from './audit-chain.service';

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
 * Program 2 · P2-4C — Audit ledger persistence boundary (append-only, hash-chained).
 *
 * The ONLY code permitted to touch the Prisma `AuditEvent` model. It exposes a single append
 * path and provides NO update/delete method — the ledger is immutable by contract. DB-role
 * revocation is a P2-10 obligation.
 *
 * `append` now runs the full chain activation INSIDE the caller-supplied transaction: derive the
 * trusted chainId, allocate a gapless sequence + prevHash under a chain-head lock, app-stamp id +
 * recordedAt, compute selfHash via the shared P2-4B helper, insert the event, and advance the head
 * — all atomically. It never opens its own transaction; the caller (recorder for OPERATIONAL, owner
 * for CRITICAL_TRANSACTIONAL) owns the transaction. Legacy pre-P2-4 rows are never touched.
 */
@Injectable()
export class AuditPersistenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chain: AuditChainService,
  ) {}

  /**
   * Validate, chain-link, and insert an audit event within the supplied transaction. Resolves all
   * platform-owned classification + integrity (chainId, sequence, prevHash, selfHash, hashAlgorithm)
   * — a producer can set none of them. The insert and the chain-head advance commit or roll back
   * together, so a rolled-back write consumes no sequence.
   *
   * @returns the new event's id (eventId). No mutable handle to the row is returned.
   */
  async append(input: AuditRecordInput, tx: Prisma.TransactionClient): Promise<string> {
    // Validation + registry classification (throws for unregistered / platform-field / scope / etc.)
    const data = this.buildCreateData(input);

    // Trusted chain partition (derived from the resolved scope, never the producer) + allocation.
    const chainId = deriveChainId(input.organization.scope, input.organization.labId ?? null);
    const { sequence, prevHash } = await this.chain.allocate(tx, chainId);

    // App-stamp identity + record time BEFORE hashing (a post-insert UPDATE would break append-only).
    const id = randomUUID();
    const recordedAt = new Date();
    const selfHash = computeSelfHash(
      this.toCanonicalFields(data, { id, recordedAt, chainId, sequence, prevHash }),
    );

    await tx.auditEvent.create({
      data: {
        ...data,
        id,
        recordedAt,
        chainId,
        sequence,
        prevHash,
        selfHash,
        hashAlgorithm: AUDIT_HASH_ALGORITHM,
      },
      select: { id: true },
    });

    await this.chain.advance(tx, chainId, sequence, selfHash);
    return id;
  }

  /**
   * The COMPLETE validation boundary (no integrity yet). Exposed (internal to the owner) so the
   * boundary can be unit-tested without a database. Order: reject platform-owned fields → resolve
   * current registry definition + eventVersion → validate scope → validate metadata → validate
   * change evidence → map only validated canonical values. A producer can never set eventVersion,
   * any platform-owned field, or any integrity field.
   */
  buildCreateData(input: AuditRecordInput): Prisma.AuditEventCreateInput {
    this.rejectPlatformOwnedFields(input);

    // Registry membership + platform-owned event version (never producer-supplied).
    const entry = resolveCurrent(input.category, input.action.code);

    assertOrganizationScope(input.organization);
    const metadata = validateMetadata(entry.metadataContractId, input.metadata);
    validateChangeEvidence(input.change);

    return {
      // identity/time — id + recordedAt are app-stamped in append(); integrity is added there too.
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
   * Map the validated create-data + the allocated integrity values into the shared canonical
   * fields (P2-4B). Runtime values are plain scalars; the casts widen Prisma's enum/union types to
   * the canonical `string` shape. `selfHash` is intentionally NOT part of its own input. NOTE:
   * per the approved P2-4A/B field list, request/session/correlation context is attribution — it
   * is persisted but NOT part of the integrity hash (covered by append-only immutability).
   */
  private toCanonicalFields(
    data: Prisma.AuditEventCreateInput,
    integ: { id: string; recordedAt: Date; chainId: string; sequence: bigint; prevHash: string },
  ): AuditCanonicalFields {
    return {
      id: integ.id,
      occurredAt: data.occurredAt as Date,
      recordedAt: integ.recordedAt,
      schemaVersion: data.schemaVersion as number,
      eventVersion: data.eventVersion as number,
      category: data.category as string,
      actionCode: data.actionCode as string,
      detailCode: (data.detailCode ?? null) as string | null,
      severity: data.severity as string,
      phiIndicator: data.phiIndicator as boolean,
      dataClass: data.dataClass as string,
      retentionClass: data.retentionClass as string,
      durabilityClass: data.durabilityClass as string,
      actorType: data.actorType as string,
      actorId: (data.actorId ?? null) as string | null,
      onBehalfOfActorId: (data.onBehalfOfActorId ?? null) as string | null,
      servicePrincipal: (data.servicePrincipal ?? null) as string | null,
      organizationScope: data.organizationScope as string,
      scopeLabId: (data.scopeLabId ?? null) as string | null,
      organizationId: (data.organizationId ?? null) as string | null,
      resourceType: data.resourceType as string,
      resourceId: (data.resourceId ?? null) as string | null,
      resourceLabId: (data.resourceLabId ?? null) as string | null,
      parentResourceType: (data.parentResourceType ?? null) as string | null,
      parentResourceId: (data.parentResourceId ?? null) as string | null,
      patientRef: (data.patientRef ?? null) as string | null,
      outcome: data.outcome as string,
      statusCode: (data.statusCode ?? null) as number | null,
      errorCode: (data.errorCode ?? null) as string | null,
      reasonCode: (data.reasonCode ?? null) as string | null,
      changedFields: (data.changedFields as string[] | undefined) ?? [],
      beforeHash: (data.beforeHash ?? null) as string | null,
      afterHash: (data.afterHash ?? null) as string | null,
      producerModule: data.producerModule as string,
      executionId: (data.executionId ?? null) as string | null,
      hashAlgorithm: AUDIT_HASH_ALGORITHM,
      metadata: (data.metadata ?? null) as AuditMetadataValue | null,
      sequence: integ.sequence,
      chainId: integ.chainId,
      prevHash: integ.prevHash,
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
