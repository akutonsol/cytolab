import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserLifecycleState } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { AuditRecorder } from '../audit/audit-recorder.service';
import { LIFECYCLE_TRANSITIONS, LifecycleOp, isActiveForState } from './lifecycle-state';

/**
 * Program 7 · Phase 7B.1 — the SINGLE lifecycle command boundary (L8). It is the ONLY production writer of
 * `User.lifecycleState`, its deterministic `isActive` coordination (L1), and the coordinated deprovision/suspend
 * effects. No controller/SCIM/invitation/JIT handler may mutate those directly — they request a governed transition
 * here. Every accepted transition is atomic + single-winner (compare-and-set — L9) and writes the authoritative durable
 * evidence (`IdentityLifecycleEvent`) in the SAME transaction; the AuditEvent is emitted best-effort afterwards
 * (OPERATIONAL). Lifecycle grants no permissions and confers no clinical/AI authority (L11/L12); enforcement still
 * terminates at the existing PermissionsGuard.
 */
export interface LifecycleActor {
  reason?: string; // bounded, non-PHI, non-secret
  actorUserId?: string; // attribution of the human performing the transition
}

export interface LifecycleResult {
  userId: string;
  from: UserLifecycleState | null;
  to: UserLifecycleState;
  isActive: boolean;
  idempotent: boolean;
  changed: boolean;
}

const AUDIT_CODE: Record<LifecycleOp, string> = {
  activate: 'IDENTITY_ACTIVATED',
  suspend: 'IDENTITY_SUSPENDED',
  reactivate: 'IDENTITY_REACTIVATED',
  deprovision: 'IDENTITY_DEPROVISIONED',
};

@Injectable()
export class IdentityLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly labContext: LabContext,
    private readonly audit: AuditRecorder,
  ) {}

  activate(userId: string, actor: LifecycleActor = {}) {
    return this.transition('activate', userId, actor);
  }
  suspend(userId: string, actor: LifecycleActor = {}) {
    return this.transition('suspend', userId, actor);
  }
  reactivate(userId: string, actor: LifecycleActor = {}) {
    return this.transition('reactivate', userId, actor);
  }
  deprovision(userId: string, actor: LifecycleActor = {}) {
    return this.transition('deprovision', userId, actor);
  }

  /**
   * Record the INITIAL provisioning evidence for an identity (entry into the lifecycle). Sets the durable lifecycle
   * event (null → initialState) and coordinates `isActive`; `originProvisioningSource` is immutable creation provenance
   * (set once at row creation via the column default — never overwritten here, L2). Idempotent if already recorded.
   */
  async provision(userId: string, initialState: UserLifecycleState, actor: LifecycleActor = {}): Promise<LifecycleResult> {
    const labId = this.requireLab();
    const result = await this.labContext.runSystem(() =>
      this.prisma.$transaction(async (tx) => {
        const user = await tx.user.findFirst({ where: { id: userId, labId }, select: { id: true, lifecycleState: true } });
        if (!user) throw new NotFoundException('user not found in this lab');
        const already = await tx.identityLifecycleEvent.count({ where: { labId, userId } });
        if (already > 0) return { userId, from: user.lifecycleState, to: user.lifecycleState, isActive: isActiveForState(user.lifecycleState), idempotent: true, changed: false };
        await tx.user.updateMany({ where: { id: userId, labId }, data: { lifecycleState: initialState, isActive: isActiveForState(initialState), lifecycleUpdatedAt: new Date() } });
        await tx.identityLifecycleEvent.create({ data: this.eventData(labId, userId, null, initialState, actor) });
        return { userId, from: null, to: initialState, isActive: isActiveForState(initialState), idempotent: false, changed: true };
      }),
    );
    if (result.changed) await this.bestEffortAudit('IDENTITY_PROVISIONED', userId, result.from, result.to, actor.reason);
    return result;
  }

  /**
   * A link may be created (7B.5) ONLY for an ACTIVE identity — never for INVITED/PROVISIONED/SUSPENDED/DEPROVISIONED.
   * Exposed now so future linking paths request this governed check rather than re-implementing lifecycle logic (L4/L8).
   */
  async assertLinkable(userId: string): Promise<void> {
    const labId = this.requireLab();
    const user = await this.labContext.runSystem(() => this.prisma.user.findFirst({ where: { id: userId, labId }, select: { lifecycleState: true } }));
    if (!user) throw new NotFoundException('user not found in this lab');
    if (user.lifecycleState !== UserLifecycleState.ACTIVE) throw new ForbiddenException('identity is not in a linkable (ACTIVE) state');
  }

  private requireLab(): string {
    const labId = this.labContext.getLabId();
    if (!labId) throw new BadRequestException('lifecycle actions require a lab context');
    return labId;
  }

  private eventData(labId: string, userId: string, from: UserLifecycleState | null, to: UserLifecycleState, actor: LifecycleActor): Prisma.IdentityLifecycleEventUncheckedCreateInput {
    return { labId, userId, fromState: from, toState: to, reason: actor.reason ?? null, actorUserId: actor.actorUserId ?? null };
  }

  /**
   * Program 7 · Phase 7B.2 — additive TRANSACTION-AWARE seam. Runs `activate` (INVITED/PROVISIONED → ACTIVE) inside the
   * CALLER's transaction, so a multi-step operation (e.g. invitation acceptance) can commit the lifecycle transition
   * atomically with its own effects. Semantics are IDENTICAL to `activate()` (same CAS, deterministic mapping, durable
   * event); the ONLY difference is that the caller owns the transaction and is responsible for the best-effort audit
   * AFTER commit (L9 — the durable IdentityLifecycleEvent, written here in-tx, remains authoritative). `labId` is passed
   * explicitly (the caller runs system-scoped inside its own tx). This changes no existing behavior of the public
   * `activate/suspend/reactivate/deprovision` methods.
   */
  activateInTx(tx: Prisma.TransactionClient, userId: string, labId: string, actor: LifecycleActor = {}): Promise<LifecycleResult> {
    return this.applyTransition(tx, 'activate', userId, labId, actor);
  }

  /** The core transition (CAS + deterministic mapping + durable event + coordinated effects) run on a given tx client. */
  private async applyTransition(tx: Prisma.TransactionClient, op: LifecycleOp, userId: string, labId: string, actor: LifecycleActor): Promise<LifecycleResult> {
    const { from, to } = LIFECYCLE_TRANSITIONS[op];
    const user = await tx.user.findFirst({ where: { id: userId, labId }, select: { id: true, lifecycleState: true } });
    if (!user) throw new NotFoundException('user not found in this lab');
    // Idempotent: already in the target state (repeated request / benign retry).
    if (user.lifecycleState === to) return { userId, from: user.lifecycleState, to, isActive: isActiveForState(to), idempotent: true, changed: false };
    // Legality: the current state must be a legal `from` for this op — else fail closed (illegal transition).
    if (!from.includes(user.lifecycleState)) throw new ConflictException(`illegal ${op} transition from ${user.lifecycleState}`);
    // Single-winner CAS: only one concurrent transition may flip the state.
    const cas = await tx.user.updateMany({
      where: { id: userId, labId, lifecycleState: { in: from } },
      data: { lifecycleState: to, isActive: isActiveForState(to), lifecycleUpdatedAt: new Date(), ...(to === UserLifecycleState.DEPROVISIONED ? { deprovisionedAt: new Date() } : {}) },
    });
    if (cas.count !== 1) {
      const now = await tx.user.findFirst({ where: { id: userId, labId }, select: { lifecycleState: true } });
      if (now?.lifecycleState === to) return { userId, from: user.lifecycleState, to, isActive: isActiveForState(to), idempotent: true, changed: false };
      throw new ConflictException('lifecycle transition lost a concurrent race');
    }
    // Authoritative durable evidence (L9) — same transaction as the state change.
    await tx.identityLifecycleEvent.create({ data: this.eventData(labId, userId, user.lifecycleState, to, actor) });
    // Coordinated effects: suspension + deprovisioning revoke sessions + refresh capability.
    if (op === 'suspend' || op === 'deprovision') {
      await tx.userSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    // Deprovisioning additionally deactivates federated links (evidence; the isActive gate is the runtime block).
    if (op === 'deprovision') {
      await tx.federatedIdentity.updateMany({ where: { userId, deactivatedAt: null }, data: { deactivatedAt: new Date() } });
    }
    return { userId, from: user.lifecycleState, to, isActive: isActiveForState(to), idempotent: false, changed: true };
  }

  private async transition(op: LifecycleOp, userId: string, actor: LifecycleActor): Promise<LifecycleResult> {
    const labId = this.requireLab();
    const result = await this.labContext.runSystem(() => this.prisma.$transaction((tx) => this.applyTransition(tx, op, userId, labId, actor)));
    if (result.changed) {
      await this.bestEffortAudit(AUDIT_CODE[op], userId, result.from, LIFECYCLE_TRANSITIONS[op].to, actor.reason);
      if (op === 'deprovision') await this.bestEffortAudit('IDENTITY_LINK_DEACTIVATED', userId, result.from, LIFECYCLE_TRANSITIONS[op].to, actor.reason);
    }
    return result;
  }

  /** Best-effort OPERATIONAL audit — the durable IdentityLifecycleEvent (already committed) is authoritative (L9). */
  private async bestEffortAudit(actionCode: string, userId: string, from: UserLifecycleState | null, to: UserLifecycleState, reason?: string): Promise<void> {
    await this.audit
      .record({
        category: 'ADMINISTRATIVE',
        actionCode,
        resource: { type: 'User', id: userId },
        outcome: { status: 'SUCCESS' },
        producerModule: 'identity-lifecycle',
        metadata: { fromState: from ?? null, toState: to, ...(reason ? { reason } : {}) },
      })
      .catch(() => undefined);
  }
}
