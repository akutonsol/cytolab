import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { ExecutionContextService } from '../../common/execution-context/execution-context.service';
import { AuditRecorder } from '../audit/audit-recorder.service';
import { SessionService } from './session.service';
import { MfaService } from './mfa.service';
import { PasswordPolicyService, PasswordPolicy } from './password-policy.service';

/**
 * Read/query + admin-action surface for the Security Center. Security records
 * (sessions, login attempts, blocked IPs, trusted devices, locks, MFA) carry no
 * labId, so every query runs unscoped via {@link LabContext.runSystem} — the
 * Security Center is a platform-wide, superuser-gated view by design.
 */
@Injectable()
export class SecurityService {
  constructor(
    private prisma: PrismaService,
    private labContext: LabContext,
    private sessions: SessionService,
    private mfa: MfaService,
    private passwordPolicy: PasswordPolicyService,
    private audit: AuditRecorder,
    private executionContext: ExecutionContextService,
  ) {}

  private readonly logger = new Logger(SecurityService.name);

  private userSelect = {
    select: { id: true, firstName: true, lastName: true, email: true },
  } as const;

  /**
   * Program 2 · P2-6E — emit a SYSTEM-scoped security-administration audit event that retains the
   * acting administrator's attribution, via the frozen P2-6E0 bridge. Wraps ONLY the audit-emission
   * call (never governing persistence). Doubly best-effort: the AuditRecorder helper swallows append
   * failures, and this wrapper additionally swallows any bridge failure (e.g. missing actor context)
   * so a completed security action is never failed or rolled back by an audit problem.
   */
  private async emitSystemScoped(emit: () => Promise<void>): Promise<void> {
    try {
      await this.executionContext.runSystemAsCurrentActor(emit);
    } catch (err) {
      this.logger.warn('Security audit emission failed; dropped (best-effort — the action is unaffected).');
    }
  }

  // --- Dashboard -------------------------------------------------------------

  async getDashboard() {
    return this.labContext.runSystem(async () => {
      const now = new Date();
      const dayAgo = new Date(now.getTime() - 24 * 3_600_000);
      const [activeSessions, failedLogins24h, lockedAccounts, openAlerts, blockedIps, recentAttempts] =
        await Promise.all([
          this.prisma.userSession.count({ where: { revokedAt: null, expiresAt: { gt: now } } }),
          this.prisma.loginAttempt.count({ where: { success: false, createdAt: { gte: dayAgo } } }),
          this.prisma.accountLock.count({ where: { unlockedAt: null } }),
          this.prisma.securityAlert.count({ where: { resolved: false } }),
          this.prisma.blockedIp.count(),
          this.prisma.loginAttempt.findMany({
            where: { createdAt: { gte: dayAgo } },
            orderBy: { createdAt: 'desc' },
            take: 500,
            select: { id: true, success: true, createdAt: true, country: true },
          }),
        ]);

      // After-hours: successful logins between 22:00 and 06:00 (local server time).
      const afterHours = recentAttempts.filter((a) => {
        if (!a.success) return false;
        const h = a.createdAt.getHours();
        return h >= 22 || h < 6;
      }).length;

      const byCountry = new Map<string, number>();
      for (const a of recentAttempts) {
        if (!a.success) continue;
        const c = a.country ?? 'Unknown';
        byCountry.set(c, (byCountry.get(c) ?? 0) + 1);
      }

      const [recentAlerts, recentLogins] = await Promise.all([
        this.prisma.securityAlert.findMany({ orderBy: { createdAt: 'desc' }, take: 10 }),
        this.prisma.loginAttempt.findMany({ orderBy: { createdAt: 'desc' }, take: 15 }),
      ]);

      return {
        kpis: { activeSessions, failedLogins24h, lockedAccounts, openAlerts, blockedIps, afterHours },
        loginsByCountry: [...byCountry.entries()]
          .map(([country, count]) => ({ country, count }))
          .sort((a, b) => b.count - a.count),
        recentAlerts,
        recentLogins,
      };
    });
  }

  // --- Sessions --------------------------------------------------------------

  listSessions(userId?: string) {
    return this.labContext.runSystem(() =>
      this.prisma.userSession.findMany({
        where: { revokedAt: null, expiresAt: { gt: new Date() }, ...(userId ? { userId } : {}) },
        orderBy: { lastActiveAt: 'desc' },
        include: { user: this.userSelect },
      }),
    );
  }

  async terminateSession(id: string) {
    // P2-6E1: revokeSession now returns a truthful outcome (true iff an active session was revoked).
    const revoked = await this.sessions.revokeSession(id);
    // Enterprise audit (P2-6E1): ONE SESSION_TERMINATED{single} event with the truthful count. A
    // zero-count success still emits — the governance fact is that an authorized admin executed the
    // single-session termination, whose outcome was zero affected rows.
    await this.emitSystemScoped(() =>
      this.audit.recordSessionTerminated({
        scope: 'single',
        terminatedCount: revoked ? 1 : 0,
        resource: { type: 'UserSession', id },
        producerModule: 'security',
      }),
    );
    return { status: 'OK' as const };
  }

  async terminateAllForUser(userId: string) {
    const count = await this.sessions.revokeAllForUser(userId);
    // Enterprise audit (P2-6E): ONE event for terminate-all, with the ACTUAL revoked count (incl. 0).
    await this.emitSystemScoped(() =>
      this.audit.recordSessionTerminated({
        scope: 'all',
        terminatedCount: count,
        resource: { type: 'User', id: userId },
        producerModule: 'security',
      }),
    );
    return { status: 'OK' as const, terminated: count };
  }

  // --- Login attempts --------------------------------------------------------

  listLoginAttempts(filters: {
    email?: string;
    ip?: string;
    success?: boolean;
    country?: string;
    from?: string;
    to?: string;
    take?: number;
  }) {
    const where: any = {};
    if (filters.email) where.email = { contains: filters.email, mode: 'insensitive' };
    if (filters.ip) where.ipAddress = { contains: filters.ip };
    if (typeof filters.success === 'boolean') where.success = filters.success;
    if (filters.country) where.country = filters.country;
    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = new Date(filters.from);
      if (filters.to) where.createdAt.lte = new Date(filters.to);
    }
    return this.labContext.runSystem(() =>
      this.prisma.loginAttempt.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(filters.take ?? 200, 500),
      }),
    );
  }

  /** A user's own recent login history (last N attempts). */
  listUserLoginHistory(userId: string, take = 10) {
    return this.labContext.runSystem(() =>
      this.prisma.loginAttempt.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take,
        select: {
          id: true,
          success: true,
          createdAt: true,
          ipAddress: true,
          country: true,
          city: true,
          browser: true,
          os: true,
          failReason: true,
        },
      }),
    );
  }

  // --- Locked users ----------------------------------------------------------

  listLockedUsers() {
    return this.labContext.runSystem(() =>
      this.prisma.accountLock.findMany({
        where: { unlockedAt: null },
        orderBy: { lockedAt: 'desc' },
        include: { user: this.userSelect },
      }),
    );
  }

  async unlockUser(userId: string, adminId: string) {
    const result = await this.labContext.runSystem(async () => {
      const lock = await this.prisma.accountLock.findUnique({ where: { userId } });
      if (lock && !lock.unlockedAt) {
        await this.prisma.accountLock.update({
          where: { userId },
          data: { unlockedAt: new Date(), unlockedById: adminId },
        });
      }
      await this.prisma.user.update({
        where: { id: userId },
        data: { failedLoginCount: 0, failedLoginAt: null },
      });
      return { status: 'OK' as const };
    });
    // Enterprise audit (P2-6E): SYSTEM-scoped, actor-attributed, after the unlock writes complete.
    await this.emitSystemScoped(() => this.audit.recordAccountUnlocked({ userId, producerModule: 'security' }));
    return result;
  }

  /** Force the user to set a new password on next login + kill their sessions. */
  async forcePasswordReset(userId: string) {
    // Governing persistence boundary: the passwordExpiresAt write.
    await this.labContext.runSystem(() =>
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordExpiresAt: new Date(Date.now() - 1000) },
      }),
    );
    // Enterprise audit (P2-6E): emitted after the governing write; the session revocation below is
    // a fire-after side effect and does not gate the event.
    await this.emitSystemScoped(() => this.audit.recordPasswordResetForced({ userId, producerModule: 'security' }));
    await this.sessions.revokeAllForUser(userId);
    return { status: 'OK' as const };
  }

  // --- Blocked IPs -----------------------------------------------------------

  listBlockedIps() {
    return this.labContext.runSystem(() =>
      this.prisma.blockedIp.findMany({ orderBy: { blockedAt: 'desc' } }),
    );
  }

  async addBlockedIp(
    dto: { ipAddress: string; reason: string; expiresAt?: string; permanent?: boolean },
    adminId: string,
  ) {
    const permanent = dto.permanent ?? false;
    const row = await this.labContext.runSystem(() =>
      this.prisma.blockedIp.upsert({
        where: { ipAddress: dto.ipAddress },
        create: {
          ipAddress: dto.ipAddress,
          reason: dto.reason,
          blockedById: adminId,
          permanent,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        },
        update: {
          reason: dto.reason,
          blockedById: adminId,
          permanent,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          blockedAt: new Date(),
        },
      }),
    );
    // Enterprise audit (P2-6E): the durable BlockedIp row id + `permanent` only. NEVER the raw IP,
    // reason, notes, or request source.
    await this.emitSystemScoped(() => this.audit.recordIpBlockAdded({ blockedIpId: row.id, permanent, producerModule: 'security' }));
    return row;
  }

  async unblockIp(id: string) {
    await this.labContext.runSystem(() => this.prisma.blockedIp.delete({ where: { id } }));
    // Enterprise audit (P2-6E): the removed row id (retained), after the delete commits. No metadata.
    await this.emitSystemScoped(() => this.audit.recordIpBlockRemoved({ blockedIpId: id, producerModule: 'security' }));
    return { status: 'OK' as const };
  }

  // --- Trusted devices -------------------------------------------------------

  listTrustedDevices(userId?: string) {
    return this.labContext.runSystem(() =>
      this.prisma.trustedDevice.findMany({
        where: userId ? { userId } : {},
        orderBy: { lastUsedAt: 'desc' },
        include: { user: this.userSelect },
      }),
    );
  }

  async revokeTrustedDevice(id: string) {
    await this.labContext.runSystem(() => this.prisma.trustedDevice.delete({ where: { id } }));
    // Enterprise audit (P2-6E): the revoked trusted-device row id (retained), after the delete commits.
    await this.emitSystemScoped(() => this.audit.recordTrustedDeviceRevoked({ trustedDeviceId: id, producerModule: 'security' }));
    return { status: 'OK' as const };
  }

  // --- MFA management --------------------------------------------------------

  listMfa() {
    return this.labContext.runSystem(async () => {
      const users = await this.prisma.user.findMany({
        where: { isActive: true },
        orderBy: { lastName: 'asc' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          mfaRequired: true,
          lastLoginAt: true,
          mfaConfig: { select: { totpEnabled: true, emailEnabled: true } },
        },
      });
      return users.map((u) => ({
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        mfaRequired: u.mfaRequired,
        lastLoginAt: u.lastLoginAt,
        totpEnabled: u.mfaConfig?.totpEnabled ?? false,
        emailEnabled: u.mfaConfig?.emailEnabled ?? false,
      }));
    });
  }

  async setMfaRequired(userId: string, required: boolean) {
    await this.labContext.runSystem(() =>
      this.prisma.user.update({ where: { id: userId }, data: { mfaRequired: required } }),
    );
    // Enterprise audit (P2-6): administrative MFA-requirement policy change, emitted OUTSIDE
    // runSystem so the acting admin's attribution is intact. Bounded metadata only.
    await this.audit.recordSettingChanged({
      settingKey: 'mfa_required',
      scope: 'user',
      producerModule: 'security',
      resource: { type: 'User', id: userId },
    });
    return { status: 'OK' as const };
  }

  async resetUserMfa(userId: string) {
    await this.mfa.resetMfa(userId);
    // Enterprise audit (P2-6E): administrative reset of ANOTHER user's MFA, after resetMfa succeeds.
    await this.emitSystemScoped(() => this.audit.recordUserMfaReset({ userId, producerModule: 'security' }));
    return { status: 'OK' as const };
  }

  // --- Alerts ----------------------------------------------------------------

  listAlerts(filters: { type?: string; severity?: string; resolved?: boolean; from?: string; to?: string }) {
    const where: any = {};
    if (filters.type) where.type = filters.type;
    if (filters.severity) where.severity = filters.severity;
    if (typeof filters.resolved === 'boolean') where.resolved = filters.resolved;
    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = new Date(filters.from);
      if (filters.to) where.createdAt.lte = new Date(filters.to);
    }
    return this.labContext.runSystem(() =>
      this.prisma.securityAlert.findMany({ where, orderBy: { createdAt: 'desc' }, take: 300 }),
    );
  }

  async resolveAlert(id: string, adminId: string) {
    const updated = await this.labContext.runSystem(async () => {
      const alert = await this.prisma.securityAlert.findUnique({ where: { id } });
      if (!alert) throw new NotFoundException('Alert not found');
      return this.prisma.securityAlert.update({
        where: { id },
        data: { resolved: true, resolvedAt: new Date(), resolvedById: adminId },
      });
    });
    // Enterprise audit (P2-6E): the alert row id only, after the update commits. No alert text/notes.
    await this.emitSystemScoped(() => this.audit.recordSecurityAlertResolved({ alertId: id, producerModule: 'security' }));
    return updated;
  }

  // --- Password policy -------------------------------------------------------

  getPasswordPolicy() {
    return this.passwordPolicy.getPolicy();
  }

  async updatePasswordPolicy(patch: Partial<PasswordPolicy>) {
    const next = await this.passwordPolicy.updatePolicy(patch);
    // Enterprise audit (P2-6): administrative security-policy change (password policy). Bounded
    // metadata only — the policy VALUES are never logged, only that the policy changed.
    await this.audit.recordSettingChanged({
      settingKey: 'password_policy',
      scope: 'system',
      producerModule: 'security',
      resource: { type: 'SystemConfig', id: 'password_policy' },
    });
    return next;
  }
}
