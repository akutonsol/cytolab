import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { MailService } from '../portal/mail/mail.service';
import { haversineKm, type RequestContext } from './request-context.util';

/** Progressive lockout ladder: [failuresAtOrAbove, lockMinutes | null(=permanent)]. */
const LOCKOUT_LADDER: Array<[number, number | null]> = [
  [10, null],
  [7, 60],
  [5, 15],
  [3, 5],
];

/** Credential-stuffing: >N failures from one IP across any accounts in the window. */
const STUFFING_THRESHOLD = 20;
const STUFFING_WINDOW_MS = 60 * 60_000; // 1 hour
const STUFFING_BLOCK_MS = 24 * 60 * 60_000; // 24 hours

/** Impossible travel: far apart AND close in time. */
const IMPOSSIBLE_TRAVEL_KM = 500;
const IMPOSSIBLE_TRAVEL_MS = 2 * 60 * 60_000; // 2 hours

export type AlertType =
  | 'IMPOSSIBLE_TRAVEL'
  | 'BRUTE_FORCE'
  | 'CREDENTIAL_STUFFING'
  | 'SUSPICIOUS_IP'
  | 'AFTER_HOURS'
  | 'MASS_EXPORT';
export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface LockState {
  locked: boolean;
  permanent: boolean;
  until?: Date;
  reason?: string;
}

@Injectable()
export class LoginProtectionService {
  private readonly logger = new Logger(LoginProtectionService.name);

  constructor(
    private prisma: PrismaService,
    private labContext: LabContext,
    private mail: MailService,
  ) {}

  /** Record a login attempt (success or failure). Runs unscoped (pre-auth). */
  async recordAttempt(params: {
    email?: string;
    username?: string;
    ctx: RequestContext;
    success: boolean;
    failReason?: string;
    userId?: string;
  }): Promise<void> {
    const { ctx } = params;
    await this.labContext.runSystem(() =>
      this.prisma.loginAttempt.create({
        data: {
          email: params.email,
          username: params.username,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
          browser: ctx.browser,
          os: ctx.os,
          device: ctx.device,
          country: ctx.country,
          city: ctx.city,
          lat: ctx.lat,
          lng: ctx.lng,
          success: params.success,
          failReason: params.failReason,
          userId: params.userId,
        },
      }),
    );
  }

  /** Raise a security alert. labId/userId optional (pre-auth signals have neither). */
  async createAlert(params: {
    type: AlertType;
    severity: AlertSeverity;
    title: string;
    detail: string;
    labId?: string;
    userId?: string;
    ipAddress?: string;
  }): Promise<void> {
    await this.labContext.runSystem(() =>
      this.prisma.securityAlert.create({
        data: {
          type: params.type,
          severity: params.severity,
          title: params.title,
          detail: params.detail,
          labId: params.labId ?? null,
          userId: params.userId ?? null,
          ipAddress: params.ipAddress ?? null,
        },
      }),
    );
  }

  /** True if the IP is currently on the denylist (non-expired). */
  async isIpBlocked(ip: string): Promise<boolean> {
    const block = await this.labContext.runSystem(() =>
      this.prisma.blockedIp.findUnique({ where: { ipAddress: ip } }),
    );
    if (!block) return false;
    if (block.permanent) return true;
    if (!block.expiresAt) return true;
    return block.expiresAt > new Date();
  }

  /** Enforce IP block as a guard would — throws 403 if blocked. */
  async assertIpAllowed(ip: string): Promise<void> {
    if (await this.isIpBlocked(ip)) throw new ForbiddenException('Access denied');
  }

  /**
   * Resolve the current lock state for a user, auto-unlocking an expired
   * auto-lock as a side effect so the ladder resets cleanly.
   */
  async getLockState(userId: string): Promise<LockState> {
    return this.labContext.runSystem(async () => {
      const lock = await this.prisma.accountLock.findUnique({ where: { userId } });
      if (!lock || lock.unlockedAt) return { locked: false, permanent: false };
      // Permanent lock (admin unlock required).
      if (!lock.autoUnlockAt) return { locked: true, permanent: true, reason: lock.reason };
      // Auto-lock still in effect.
      if (lock.autoUnlockAt > new Date()) {
        return { locked: true, permanent: false, until: lock.autoUnlockAt, reason: lock.reason };
      }
      // Auto-lock elapsed → release it.
      await this.prisma.accountLock.update({
        where: { userId },
        data: { unlockedAt: new Date() },
      });
      return { locked: false, permanent: false };
    });
  }

  /**
   * Handle a failed login: record it, bump the counter, apply progressive
   * lockout, and run the credential-stuffing sweep for the source IP.
   */
  async handleFailure(params: {
    user?: { id: string; labId: string } | null;
    email: string;
    ctx: RequestContext;
    reason: string;
  }): Promise<void> {
    const { user, email, ctx, reason } = params;
    await this.recordAttempt({ email, ctx, success: false, failReason: reason, userId: user?.id });

    if (user) {
      const updated = await this.labContext.runSystem(() =>
        this.prisma.user.update({
          where: { id: user.id },
          data: { failedLoginCount: { increment: 1 }, failedLoginAt: new Date() },
          select: { failedLoginCount: true },
        }),
      );
      await this.applyProgressiveLockout(user, updated.failedLoginCount, ctx);
    }

    await this.checkCredentialStuffing(ctx);
  }

  private async applyProgressiveLockout(
    user: { id: string; labId: string },
    failures: number,
    ctx: RequestContext,
  ): Promise<void> {
    const rung = LOCKOUT_LADDER.find(([threshold]) => failures >= threshold);
    if (!rung) return;
    const [, minutes] = rung;
    const permanent = minutes === null;
    const autoUnlockAt = permanent ? null : new Date(Date.now() + minutes! * 60_000);
    const reason = permanent
      ? `Permanently locked after ${failures} failed login attempts`
      : `Locked for ${minutes} minutes after ${failures} failed login attempts`;

    await this.labContext.runSystem(() =>
      this.prisma.accountLock.upsert({
        where: { userId: user.id },
        create: { userId: user.id, reason, autoUnlockAt },
        update: { reason, autoUnlockAt, lockedAt: new Date(), unlockedAt: null },
      }),
    );

    await this.createAlert({
      type: 'BRUTE_FORCE',
      severity: permanent ? 'CRITICAL' : failures >= 7 ? 'HIGH' : 'MEDIUM',
      title: permanent ? 'Account permanently locked' : 'Account temporarily locked',
      detail: reason,
      labId: user.labId,
      userId: user.id,
      ipAddress: ctx.ipAddress,
    });
  }

  /** Auto-block an IP producing too many failures across accounts within the window. */
  private async checkCredentialStuffing(ctx: RequestContext): Promise<void> {
    const since = new Date(Date.now() - STUFFING_WINDOW_MS);
    const failures = await this.labContext.runSystem(() =>
      this.prisma.loginAttempt.count({
        where: { ipAddress: ctx.ipAddress, success: false, createdAt: { gte: since } },
      }),
    );
    if (failures < STUFFING_THRESHOLD) return;

    const already = await this.isIpBlocked(ctx.ipAddress);
    if (already) return;

    await this.labContext.runSystem(() =>
      this.prisma.blockedIp.upsert({
        where: { ipAddress: ctx.ipAddress },
        create: {
          ipAddress: ctx.ipAddress,
          reason: `Auto-blocked: ${failures} failed logins in 1h (credential stuffing)`,
          expiresAt: new Date(Date.now() + STUFFING_BLOCK_MS),
        },
        update: {
          reason: `Auto-blocked: ${failures} failed logins in 1h (credential stuffing)`,
          expiresAt: new Date(Date.now() + STUFFING_BLOCK_MS),
          blockedAt: new Date(),
        },
      }),
    );
    await this.createAlert({
      type: 'CREDENTIAL_STUFFING',
      severity: 'CRITICAL',
      title: 'Credential stuffing detected',
      detail: `${failures} failed logins from ${ctx.ipAddress} in the last hour — IP auto-blocked for 24h.`,
      ipAddress: ctx.ipAddress,
    });
  }

  /**
   * On a correct-credentials login: reset the failure counter, clear an
   * auto-expirable lock, then evaluate risk — impossible travel and device
   * trust — to decide whether MFA must be stepped up.
   */
  async handleSuccess(params: {
    user: { id: string; labId: string; email: string; firstName: string };
    ctx: RequestContext;
  }): Promise<{ impossibleTravel: boolean; trustedDevice: boolean }> {
    const { user, ctx } = params;
    await this.recordAttempt({ email: user.email, ctx, success: true, userId: user.id });

    await this.labContext.runSystem(async () => {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: 0,
          failedLoginAt: null,
          lastLoginAt: new Date(),
          lastLoginIp: ctx.ipAddress,
        },
      });
      // Clear an auto-expirable lock; leave permanent locks for admin action.
      await this.prisma.accountLock.updateMany({
        where: { userId: user.id, unlockedAt: null, autoUnlockAt: { not: null } },
        data: { unlockedAt: new Date() },
      });
    });

    const impossibleTravel = await this.detectImpossibleTravel(user, ctx);
    const trustedDevice = await this.isTrustedDevice(user.id, ctx.deviceId);
    return { impossibleTravel, trustedDevice };
  }

  /** Compare this login's geo against the user's most recent prior session. */
  private async detectImpossibleTravel(
    user: { id: string; labId: string; email: string; firstName: string },
    ctx: RequestContext,
  ): Promise<boolean> {
    if (ctx.lat == null || ctx.lng == null) return false;
    const prior = await this.labContext.runSystem(() =>
      this.prisma.userSession.findFirst({
        where: { userId: user.id, lat: { not: null }, lng: { not: null } },
        orderBy: { createdAt: 'desc' },
      }),
    );
    if (!prior || prior.lat == null || prior.lng == null) return false;

    const km = haversineKm(
      { lat: prior.lat, lng: prior.lng },
      { lat: ctx.lat, lng: ctx.lng },
    );
    const deltaMs = Date.now() - prior.createdAt.getTime();
    if (km <= IMPOSSIBLE_TRAVEL_KM || deltaMs >= IMPOSSIBLE_TRAVEL_MS) return false;

    await this.createAlert({
      type: 'IMPOSSIBLE_TRAVEL',
      severity: 'HIGH',
      title: 'Impossible travel detected',
      detail: `Login ${Math.round(km)}km from prior session ${Math.round(
        deltaMs / 60_000,
      )} min earlier (${ctx.city ?? ctx.country ?? ctx.ipAddress}).`,
      labId: user.labId,
      userId: user.id,
      ipAddress: ctx.ipAddress,
    });
    // Notify the user out-of-band. Mail failures never block login.
    await this.mail.send(
      user.email,
      'Unusual sign-in to your Cytolab account',
      `<p>Hi ${user.firstName},</p>
       <p>We detected a sign-in from an unusual location (${ctx.city ?? ''} ${ctx.country ?? ''}).
       If this was you, you can ignore this message. If not, change your password immediately
       and review your active sessions.</p>`,
    );
    return true;
  }

  async isTrustedDevice(userId: string, deviceId: string): Promise<boolean> {
    const device = await this.labContext.runSystem(() =>
      this.prisma.trustedDevice.findUnique({ where: { userId_deviceId: { userId, deviceId } } }),
    );
    return !!device;
  }

  /** Register the current device as trusted (after a successful MFA challenge). */
  async trustDevice(userId: string, ctx: RequestContext): Promise<void> {
    await this.labContext.runSystem(() =>
      this.prisma.trustedDevice.upsert({
        where: { userId_deviceId: { userId, deviceId: ctx.deviceId } },
        create: {
          userId,
          deviceId: ctx.deviceId,
          deviceName: ctx.deviceName,
          browser: ctx.browser,
          os: ctx.os,
          ipAddress: ctx.ipAddress,
        },
        update: { lastUsedAt: new Date(), ipAddress: ctx.ipAddress },
      }),
    );
  }
}
