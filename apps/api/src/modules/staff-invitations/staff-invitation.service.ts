import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma, UserLifecycleState } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { AuditRecorder } from '../audit/audit-recorder.service';
import { AuditMetadataValue } from '../audit/audit-metadata';
import { IdentityLifecycleService } from '../identity-lifecycle/identity-lifecycle.service';
import { MailService } from '../portal/mail/mail.service';
import { STAFF_INVITATION_TTL_MS, generateInvitationToken, generatePlaceholderSecret, hashInvitationToken } from './staff-invitation-token';

/**
 * Program 7 · Phase 7B.2 — Staff Invitations. A governed administrative workflow that provisions a staff identity into
 * the frozen 7B.1 lifecycle at INVITED and, on acceptance, takes it to ACTIVE — **only through `IdentityLifecycleService`
 * (the sole lifecycle writer, L8)**. It grants NO permissions, mints NO session, performs NO SCIM/JIT, and changes NO
 * tenancy. Model C: the invited user carries a random PLACEHOLDER Argon2id hash (never NULL); acceptance replaces it.
 * The token is stored HASH-ONLY; email is ADVISORY (the DB commit is authoritative). Coded audit only — never the token
 * or password.
 */
export interface IssueInvitationInput {
  email: string;
  firstName: string;
  lastName: string;
}

@Injectable()
export class StaffInvitationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly labContext: LabContext,
    private readonly audit: AuditRecorder,
    private readonly lifecycle: IdentityLifecycleService,
    private readonly mail: MailService,
  ) {}

  private requireLab(): string {
    const labId = this.labContext.getLabId();
    if (!labId) throw new BadRequestException('staff invitations require a lab context');
    return labId;
  }

  private async bestEffortAudit(actionCode: string, resourceId: string, metadata: AuditMetadataValue): Promise<void> {
    await this.audit
      .record({ category: 'ADMINISTRATIVE', actionCode, resource: { type: 'User', id: resourceId }, outcome: { status: 'SUCCESS' }, producerModule: 'staff-invitations', metadata })
      .catch(() => undefined);
  }

  /**
   * Issue an invitation: create the User in lifecycle INVITED (isActive=false, placeholder Argon2id hash — Model C),
   * record the durable lifecycle entry via the boundary, persist a hash-only single-use token (authoritative on commit),
   * and email an OPAQUE link (advisory). Returns the raw token for the caller to email (never persisted/returned via HTTP).
   */
  async issue(input: IssueInvitationInput, actorUserId?: string): Promise<{ invitationId: string; userId: string; rawToken: string }> {
    const labId = this.requireLab();
    const email = input.email.toLowerCase();
    const rawToken = generateInvitationToken();

    const created = await this.labContext.runSystem(() =>
      this.prisma.$transaction(async (tx) => {
        const dup = await tx.user.findFirst({ where: { labId, email }, select: { id: true } });
        if (dup) throw new ConflictException('a user with this email already exists in this lab');
        const account = await tx.account.findFirst({ where: { labId }, select: { id: true } });
        if (!account) throw new NotFoundException('lab account missing');
        // Model C: NOT NULL passwordHash — a random, unusable placeholder until acceptance. INVITED ⇒ isActive=false.
        const user = await tx.user.create({
          data: { labId, accountId: account.id, email, firstName: input.firstName, lastName: input.lastName, passwordHash: await argon2.hash(generatePlaceholderSecret()), isActive: false, lifecycleState: UserLifecycleState.INVITED, originProvisioningSource: 'INVITATION' },
          select: { id: true },
        });
        const inv = await tx.staffInvitation.create({
          data: { labId, userId: user.id, tokenHash: hashInvitationToken(rawToken), status: 'PENDING', expiresAt: new Date(Date.now() + STAFF_INVITATION_TTL_MS), invitedById: actorUserId ?? null },
          select: { id: true },
        });
        return { invitationId: inv.id, userId: user.id, email };
      }),
    );

    // Durable lifecycle entry evidence through the sole-writer boundary (records IDENTITY_PROVISIONED + null→INVITED).
    await this.labContext.runLabScoped(labId, () => this.lifecycle.provision(created.userId, UserLifecycleState.INVITED, { actorUserId, reason: 'staff invitation issued' }));
    await this.bestEffortAudit('IDENTITY_INVITED', created.userId, { invitationId: created.invitationId });
    await this.sendInvitationEmail(created.email, rawToken); // advisory only — failures never roll back state
    return { invitationId: created.invitationId, userId: created.userId, rawToken };
  }

  /**
   * Accept an invitation — the FROZEN order (I8): (1) validate token → (2) CAS consume → (3) verify lifecycle still
   * INVITED → (4) persist Argon2id password (commit) → (5) activate via the lifecycle boundary → (6) audit → (7)
   * best-effort welcome email. Activation NEVER precedes durable password persistence. No session, no permission grant.
   */
  async accept(rawToken: string, password: string): Promise<{ status: 'OK' }> {
    if (!rawToken || !password) throw new BadRequestException('missing token or password');
    const tokenHash = hashInvitationToken(rawToken);

    // (1) validate token — public (no lab context); resolve via the hash only (opaque URL).
    const inv = await this.labContext.runSystem(() => this.prisma.staffInvitation.findFirst({ where: { tokenHash }, select: { id: true, labId: true, userId: true, status: true, expiresAt: true } }));
    if (!inv) throw new UnauthorizedException('invalid or expired invitation');
    if (inv.status !== 'PENDING') throw new UnauthorizedException('invalid or expired invitation');
    if (inv.expiresAt.getTime() < Date.now()) {
      await this.labContext.runSystem(() => this.prisma.staffInvitation.updateMany({ where: { id: inv.id, status: 'PENDING' }, data: { status: 'EXPIRED' } }));
      throw new UnauthorizedException('invalid or expired invitation');
    }

    // (2) CAS consume + (3) verify still INVITED + (4) persist Argon2id password — atomic; commits before activation.
    const passwordHash = await argon2.hash(password);
    await this.labContext.runSystem(() =>
      this.prisma.$transaction(async (tx) => {
        const cas = await tx.staffInvitation.updateMany({ where: { id: inv.id, status: 'PENDING' }, data: { status: 'ACCEPTED', acceptedAt: new Date() } });
        if (cas.count !== 1) throw new UnauthorizedException('invalid or expired invitation'); // already consumed (single-use)
        const user = await tx.user.findFirst({ where: { id: inv.userId, labId: inv.labId }, select: { lifecycleState: true } });
        if (!user || user.lifecycleState !== UserLifecycleState.INVITED) throw new UnauthorizedException('invitation is not in an acceptable state');
        // Persist the password (NOT isActive/lifecycleState — those transition via the lifecycle boundary in step 5).
        await tx.user.update({ where: { id: inv.userId }, data: { passwordHash } });
      }),
    );

    // (5) activate ONLY through the sole lifecycle writer (INVITED→ACTIVE) — after the password is durably persisted.
    await this.labContext.runLabScoped(inv.labId, () => this.lifecycle.activate(inv.userId, { reason: 'staff invitation accepted' }));
    // (6) audit — coded, no token/password.
    await this.bestEffortAudit('IDENTITY_INVITATION_ACCEPTED', inv.userId, { invitationId: inv.id });
    // (7) best-effort welcome email (advisory; never gates activation).
    await this.sendWelcomeEmail(inv.labId, inv.userId);
    return { status: 'OK' }; // NO session minted, NO permission granted — the user logs in later via 7A.
  }

  /** Cancel a PENDING invitation (voids the token). Never changes lifecycle state (deprovision — 7B.1 L5 — does that). */
  async cancel(invitationId: string, actorUserId?: string): Promise<{ status: string }> {
    const labId = this.requireLab();
    const inv = await this.prisma.staffInvitation.findFirst({ where: { id: invitationId }, select: { id: true, userId: true, status: true } });
    if (!inv) throw new NotFoundException('invitation not found');
    if (inv.status === 'CANCELLED') return { status: 'CANCELLED' }; // idempotent
    const cas = await this.labContext.runSystem(() => this.prisma.staffInvitation.updateMany({ where: { id: inv.id, labId, status: 'PENDING' }, data: { status: 'CANCELLED', cancelledAt: new Date() } }));
    if (cas.count !== 1) throw new ConflictException('invitation cannot be cancelled (already accepted/expired/cancelled)');
    await this.bestEffortAudit('IDENTITY_INVITATION_CANCELLED', inv.userId, { invitationId: inv.id, actorUserId: actorUserId ?? null });
    return { status: 'CANCELLED' };
  }

  /** Re-issue a fresh token for a PENDING invitation (supersedes the prior token) and re-email it. */
  async resend(invitationId: string, _actorUserId?: string): Promise<{ invitationId: string; rawToken: string }> {
    const labId = this.requireLab();
    const rawToken = generateInvitationToken();
    const updated = await this.labContext.runSystem(() =>
      this.prisma.$transaction(async (tx) => {
        const inv = await tx.staffInvitation.findFirst({ where: { id: invitationId, labId }, select: { id: true, userId: true, status: true } });
        if (!inv) throw new NotFoundException('invitation not found');
        if (inv.status !== 'PENDING') throw new ConflictException('only a pending invitation can be resent');
        await tx.staffInvitation.update({ where: { id: inv.id }, data: { tokenHash: hashInvitationToken(rawToken), expiresAt: new Date(Date.now() + STAFF_INVITATION_TTL_MS) } });
        const user = await tx.user.findFirst({ where: { id: inv.userId, labId }, select: { email: true } });
        return { invitationId: inv.id, email: user?.email ?? '' };
      }),
    );
    if (updated.email) await this.sendInvitationEmail(updated.email, rawToken);
    return { invitationId: updated.invitationId, rawToken };
  }

  // ── email (advisory only — never authoritative, never rolls back identity state) ─────────────────────────────────
  private async sendInvitationEmail(to: string, rawToken: string): Promise<void> {
    const base = process.env.APP_BASE_URL ?? 'https://app.osieri';
    const url = `${base}/staff/accept-invitation#token=${encodeURIComponent(rawToken)}`; // opaque: token only
    await this.mail.send(to, 'You are invited to Osieri', `<p>You have been invited. <a href="${url}">Set your password</a> to activate your account.</p>`).catch(() => undefined);
  }
  private async sendWelcomeEmail(labId: string, userId: string): Promise<void> {
    const email = (await this.labContext.runSystem(() => this.prisma.user.findFirst({ where: { id: userId, labId }, select: { email: true } })))?.email;
    if (email) await this.mail.send(email, 'Welcome to Osieri', `<p>Your account is now active. You can sign in.</p>`).catch(() => undefined);
  }
}
