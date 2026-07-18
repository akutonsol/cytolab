import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
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
  ) {}

  private userSelect = {
    select: { id: true, firstName: true, lastName: true, email: true },
  } as const;

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
    await this.sessions.revokeSession(id);
    return { status: 'OK' as const };
  }

  async terminateAllForUser(userId: string) {
    const count = await this.sessions.revokeAllForUser(userId);
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
    return this.labContext.runSystem(async () => {
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
  }

  /** Force the user to set a new password on next login + kill their sessions. */
  async forcePasswordReset(userId: string) {
    await this.labContext.runSystem(() =>
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordExpiresAt: new Date(Date.now() - 1000) },
      }),
    );
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
    return this.labContext.runSystem(() =>
      this.prisma.blockedIp.upsert({
        where: { ipAddress: dto.ipAddress },
        create: {
          ipAddress: dto.ipAddress,
          reason: dto.reason,
          blockedById: adminId,
          permanent: dto.permanent ?? false,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        },
        update: {
          reason: dto.reason,
          blockedById: adminId,
          permanent: dto.permanent ?? false,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          blockedAt: new Date(),
        },
      }),
    );
  }

  async unblockIp(id: string) {
    await this.labContext.runSystem(() => this.prisma.blockedIp.delete({ where: { id } }));
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
    return this.labContext.runSystem(async () => {
      const alert = await this.prisma.securityAlert.findUnique({ where: { id } });
      if (!alert) throw new NotFoundException('Alert not found');
      return this.prisma.securityAlert.update({
        where: { id },
        data: { resolved: true, resolvedAt: new Date(), resolvedById: adminId },
      });
    });
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
