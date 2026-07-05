import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import type { Response } from 'express';
import { sha256 } from '../../common/crypto/phi-crypto';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import type { RequestContext } from './request-context.util';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';

const REFRESH_BYTES = 64;
const DEFAULT_IDLE_MINUTES = 15;
const DEFAULT_MAX_HOURS = 12;
const REFRESH_DAYS = 7;
/** Only rewrite lastActiveAt when it's this stale, to avoid a write per request. */
const ACTIVITY_WRITE_THROTTLE_MS = 60_000;

/**
 * Owns opaque refresh tokens, tracked device sessions, the HttpOnly cookie
 * contract, and idle/max-lifetime enforcement.
 *
 * Not tenant-scoped: RefreshToken/UserSession carry no labId, and login/refresh
 * run before a lab context exists, so all reads/writes go through
 * {@link LabContext.runSystem}.
 */
@Injectable()
export class SessionService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private labContext: LabContext,
  ) {}

  private get idleMs(): number {
    return Number(this.config.get('SESSION_IDLE_MINUTES') ?? DEFAULT_IDLE_MINUTES) * 60_000;
  }
  private get maxLifetimeMs(): number {
    return Number(this.config.get('SESSION_MAX_HOURS') ?? DEFAULT_MAX_HOURS) * 3_600_000;
  }
  private get refreshMs(): number {
    return REFRESH_DAYS * 86_400_000;
  }

  /**
   * Create a fresh device session + its first refresh token for a user who has
   * just cleared authentication (and MFA, if required). Returns the raw refresh
   * token (only time it exists un-hashed) and the session id for the JWT `sid`.
   */
  async createSession(
    userId: string,
    ctx: RequestContext,
  ): Promise<{ sessionId: string; refreshToken: string }> {
    const now = Date.now();
    return this.labContext.runSystem(async () => {
      const session = await this.prisma.userSession.create({
        data: {
          userId,
          deviceId: ctx.deviceId,
          deviceName: ctx.deviceName,
          browser: ctx.browser,
          os: ctx.os,
          ipAddress: ctx.ipAddress,
          country: ctx.country,
          city: ctx.city,
          lat: ctx.lat,
          lng: ctx.lng,
          expiresAt: new Date(now + this.maxLifetimeMs),
        },
      });
      const refreshToken = await this.mintRefreshToken(userId, ctx.deviceId, ctx);
      return { sessionId: session.id, refreshToken };
    });
  }

  /** Insert a hashed refresh token row and return the raw token. */
  private async mintRefreshToken(userId: string, deviceId: string, ctx: RequestContext): Promise<string> {
    const raw = randomBytes(REFRESH_BYTES).toString('hex');
    await this.prisma.refreshToken.create({
      data: {
        userId,
        token: sha256(raw),
        deviceId,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        expiresAt: new Date(Date.now() + this.refreshMs),
      },
    });
    return raw;
  }

  /**
   * Validate + rotate a refresh token: verify it's live, enforce the 12h session
   * max lifetime and the idle window, delete the old token, and issue a new one.
   * Returns the userId and the new raw token. Throws on any failure.
   */
  async rotateRefreshToken(
    rawToken: string,
    ctx: RequestContext,
  ): Promise<{ userId: string; refreshToken: string; sessionId?: string }> {
    return this.labContext.runSystem(async () => {
      const hash = sha256(rawToken);
      const existing = await this.prisma.refreshToken.findUnique({ where: { token: hash } });
      if (!existing || existing.revokedAt || existing.expiresAt < new Date()) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // The device is the one bound to the token, not a recomputed one.
      const deviceId = existing.deviceId;

      // Enforce max session lifetime + idle window against the device session.
      const session = await this.prisma.userSession.findFirst({
        where: { userId: existing.userId, deviceId, revokedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      if (session) {
        const now = Date.now();
        if (session.createdAt.getTime() + this.maxLifetimeMs < now || session.expiresAt < new Date()) {
          await this.revokeSession(session.id);
          throw new UnauthorizedException({ code: 'SESSION_EXPIRED', message: 'Session expired' });
        }
        if (session.lastActiveAt.getTime() + this.idleMs < now) {
          await this.revokeSession(session.id);
          throw new UnauthorizedException({ code: 'SESSION_IDLE_TIMEOUT', message: 'Session timed out' });
        }
        await this.prisma.userSession.update({
          where: { id: session.id },
          data: { lastActiveAt: new Date() },
        });
      }

      // Rotate: delete the presented token, mint a replacement on the same device.
      await this.prisma.refreshToken.delete({ where: { id: existing.id } });
      const refreshToken = await this.mintRefreshToken(existing.userId, deviceId, ctx);
      return { userId: existing.userId, refreshToken, sessionId: session?.id };
    });
  }

  /**
   * Per-request idle enforcement + activity touch, keyed on the JWT `sid` claim.
   * Returns false when the session is dead/idle (caller should 401). No-ops
   * (returns true) for legacy tokens minted before sessions existed.
   */
  async touchSession(sessionId: string | undefined): Promise<boolean> {
    if (!sessionId) return true;
    return this.labContext.runSystem(async () => {
      const session = await this.prisma.userSession.findUnique({ where: { id: sessionId } });
      if (!session || session.revokedAt) return false;
      const now = Date.now();
      if (session.lastActiveAt.getTime() + this.idleMs < now || session.expiresAt < new Date()) {
        await this.revokeSession(session.id);
        return false;
      }
      if (session.lastActiveAt.getTime() + ACTIVITY_WRITE_THROTTLE_MS < now) {
        await this.prisma.userSession.update({
          where: { id: session.id },
          data: { lastActiveAt: new Date() },
        });
      }
      return true;
    });
  }

  /** Revoke a single session and all its refresh tokens. */
  async revokeSession(sessionId: string): Promise<void> {
    await this.labContext.runSystem(async () => {
      const session = await this.prisma.userSession.findUnique({ where: { id: sessionId } });
      if (!session) return;
      await this.prisma.userSession.update({
        where: { id: sessionId },
        data: { revokedAt: new Date() },
      });
      await this.prisma.refreshToken.updateMany({
        where: { userId: session.userId, deviceId: session.deviceId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  /** Revoke a refresh token (by raw value) and its session — used on logout. */
  async revokeByRefreshToken(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    await this.labContext.runSystem(async () => {
      const hash = sha256(rawToken);
      const token = await this.prisma.refreshToken.findUnique({ where: { token: hash } });
      if (!token) return;
      await this.prisma.refreshToken.update({ where: { id: token.id }, data: { revokedAt: new Date() } });
      await this.prisma.userSession.updateMany({
        where: { userId: token.userId, deviceId: token.deviceId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  /** Revoke all of a user's sessions except one (self "terminate other sessions"). */
  async revokeOthersForUser(userId: string, keepSessionId: string): Promise<number> {
    return this.labContext.runSystem(async () => {
      const others = await this.prisma.userSession.findMany({
        where: { userId, revokedAt: null, id: { not: keepSessionId } },
        select: { id: true, deviceId: true },
      });
      for (const s of others) await this.revokeSession(s.id);
      return others.length;
    });
  }

  /** Revoke every active session + refresh token for a user (admin / "terminate all"). */
  async revokeAllForUser(userId: string): Promise<number> {
    return this.labContext.runSystem(async () => {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const res = await this.prisma.userSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return res.count;
    });
  }

  // --- Cookie contract -------------------------------------------------------

  private cookieBase() {
    const isProd = (this.config.get('NODE_ENV') ?? process.env.NODE_ENV) === 'production';
    const secure = (this.config.get('COOKIE_SECURE') ?? String(isProd)) === 'true' || isProd;
    return { httpOnly: true, secure, sameSite: 'strict' as const, path: '/' };
  }

  setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
    const base = this.cookieBase();
    res.cookie(ACCESS_COOKIE, accessToken, { ...base, maxAge: 15 * 60_000 });
    res.cookie(REFRESH_COOKIE, refreshToken, { ...base, maxAge: this.refreshMs });
  }

  clearAuthCookies(res: Response): void {
    const base = this.cookieBase();
    res.clearCookie(ACCESS_COOKIE, base);
    res.clearCookie(REFRESH_COOKIE, base);
  }
}
