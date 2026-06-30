import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PortalTokenType } from '@prisma/client';
import * as argon2 from 'argon2';
import { LabContext } from '../../../common/tenancy/lab-context';
import { PrismaService } from '../../../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { PORTAL_AUDIENCE, PortalJwtPayload, PortalPrincipal } from '../common/portal-principal';
import { expiryFromNow, generateRawToken, hashToken, RESET_TTL_HOURS } from '../common/portal-token.util';
import { PortalLoginDto, ResetRequestDto, SetPasswordDto } from './dto/portal-auth.dto';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MINUTES = 15;
// Identical generic message for every auth failure (anti-enumeration).
const INVALID_CREDENTIALS = 'Invalid credentials';

@Injectable()
export class PortalAuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private labContext: LabContext,
    private mail: MailService,
  ) {}

  // Lazily-computed argon2 hash used to equalise verify timing when no user (or
  // no password) is found, so "wrong password" and "no such email" are
  // indistinguishable by both response AND latency.
  private dummyHashPromise?: Promise<string>;
  private dummyHash(): Promise<string> {
    return (this.dummyHashPromise ??= argon2.hash('portal-anti-enumeration-timing-equalizer'));
  }

  /**
   * Portal login. Anti-enumeration: exactly one argon2 verify runs on every
   * path (real hash if the user exists and has one, else the dummy hash), and
   * every failure returns the same 401 'Invalid credentials'. An attacker cannot
   * tell a wrong password from a non-existent/never-onboarded portal email.
   */
  async login(dto: PortalLoginDto, ip?: string) {
    const email = dto.email.toLowerCase();

    // Cross-scope lookup (no lab/client context yet) — bypass tenancy.
    const user = await this.labContext.runSystem(() =>
      this.prisma.portalUser.findFirst({ where: { email } }),
    );

    // Lockout window keyed to portal attempts for this email (portal flag set).
    const windowStart = new Date(Date.now() - LOCKOUT_WINDOW_MINUTES * 60_000);
    const recentFailures = await this.labContext.runSystem(() =>
      this.prisma.authAttempt.count({
        where: { portal: true, email, success: false, createdAt: { gte: windowStart } },
      }),
    );
    if (recentFailures >= MAX_FAILED_ATTEMPTS) {
      throw new ForbiddenException(
        `Account temporarily locked after ${MAX_FAILED_ATTEMPTS} failed attempts. Try again later.`,
      );
    }

    let valid = false;
    if (user?.passwordHash) {
      valid = user.isActive && (await argon2.verify(user.passwordHash, dto.password));
    } else {
      // No user, or invited-but-not-onboarded: burn an equivalent verify so the
      // timing matches the "user exists" branch.
      await argon2.verify(await this.dummyHash(), dto.password);
    }

    await this.labContext.runSystem(() =>
      this.prisma.authAttempt.create({
        data: { portal: true, email, ip, success: valid, portalUserId: user?.id ?? null },
      }),
    );

    if (!valid) throw new UnauthorizedException(INVALID_CREDENTIALS);

    await this.labContext.runSystem(() =>
      this.prisma.portalUser.update({ where: { id: user!.id }, data: { lastLoginAt: new Date() } }),
    );
    return this.issueTokens(user!);
  }

  async refresh(refreshToken: string) {
    let payload: PortalJwtPayload;
    try {
      payload = await this.jwt.verifyAsync<PortalJwtPayload>(refreshToken, {
        secret: this.config.get<string>('JWT_PORTAL_REFRESH_SECRET') ?? 'dev-portal-refresh-secret',
        audience: PORTAL_AUDIENCE,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (payload.type !== 'refresh' || payload.scope !== 'portal') {
      throw new UnauthorizedException('Invalid token type');
    }

    const user = await this.labContext.runSystem(() =>
      this.prisma.portalUser.findUnique({ where: { id: payload.sub } }),
    );
    if (!user || !user.isActive) throw new UnauthorizedException('Account is no longer active');
    return this.issueTokens(user);
  }

  /** Current portal user (lab + client scoped — reads own row). */
  async me(principal: PortalPrincipal) {
    const user = await this.prisma.portalUser.findFirst({
      where: { id: principal.portalUserId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        labId: true,
        clientId: true,
        client: { select: { id: true, firstName: true, lastName: true, officeName: true } },
        notifyByEmail: true,
        notifyInApp: true,
        lastLoginAt: true,
      },
    });
    if (!user) throw new UnauthorizedException();
    return user;
  }

  /**
   * Consume an invite or reset token and set the password. Unauthenticated and
   * cross-scope, so it runs under system scope. The token is looked up by hash,
   * must be unused and unexpired; it is marked used in the same transaction.
   */
  async setPassword(dto: SetPasswordDto) {
    const tokenHash = hashToken(dto.token);
    const passwordHash = await argon2.hash(dto.password);

    return this.labContext.runSystem(() =>
      this.prisma.$transaction(async (tx) => {
        const token = await tx.portalAccessToken.findUnique({
          where: { tokenHash },
          include: { portalUser: { select: { id: true, isActive: true } } },
        });
        if (!token || token.usedAt || token.expiresAt < new Date()) {
          throw new UnauthorizedException('Invalid or expired token');
        }
        await tx.portalAccessToken.update({ where: { id: token.id }, data: { usedAt: new Date() } });
        // Accepting an invite also activates the account.
        const activate = token.type === PortalTokenType.Invite ? { isActive: true } : {};
        await tx.portalUser.update({
          where: { id: token.portalUserId },
          data: { passwordHash, ...activate },
        });
        return { ok: true };
      }),
    );
  }

  /**
   * Request a password reset. Anti-enumeration: ALWAYS returns the same generic
   * response whether or not the email exists. A token is only minted/emailed when
   * the account exists and is onboarded.
   */
  async requestReset(dto: ResetRequestDto) {
    const email = dto.email.toLowerCase();
    const user = await this.labContext.runSystem(() =>
      this.prisma.portalUser.findFirst({
        where: { email },
        select: { id: true, labId: true, firstName: true, isActive: true, passwordHash: true },
      }),
    );

    if (user && user.isActive && user.passwordHash) {
      const raw = generateRawToken();
      await this.labContext.runSystem(() =>
        this.prisma.portalAccessToken.create({
          data: {
            labId: user.labId,
            portalUserId: user.id,
            type: PortalTokenType.Reset,
            tokenHash: hashToken(raw),
            expiresAt: expiryFromNow(RESET_TTL_HOURS),
          },
        }),
      );
      const lab = await this.labContext.runSystem(() =>
        this.prisma.lab.findUnique({ where: { id: user.labId }, select: { name: true } }),
      );
      await this.mail.sendReset(email, user.firstName, lab?.name ?? 'the lab', raw);
    }

    // Identical response regardless of whether the account exists.
    return { ok: true, message: 'If an account exists for that email, a reset link has been sent.' };
  }

  private async issueTokens(user: { id: string; labId: string; clientId: string; email: string }) {
    const base = {
      sub: user.id,
      labId: user.labId,
      clientId: user.clientId,
      email: user.email,
      scope: 'portal' as const,
    };
    const accessToken = await this.jwt.signAsync(
      { ...base, type: 'access' },
      {
        secret: this.config.get<string>('JWT_PORTAL_SECRET') ?? 'dev-portal-secret',
        expiresIn: this.config.get<string>('JWT_PORTAL_EXPIRES_IN') ?? '15m',
        audience: PORTAL_AUDIENCE,
      },
    );
    const refreshToken = await this.jwt.signAsync(
      { ...base, type: 'refresh' },
      {
        secret: this.config.get<string>('JWT_PORTAL_REFRESH_SECRET') ?? 'dev-portal-refresh-secret',
        expiresIn: this.config.get<string>('JWT_PORTAL_REFRESH_EXPIRES_IN') ?? '7d',
        audience: PORTAL_AUDIENCE,
      },
    );
    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, clientId: user.clientId },
    };
  }
}
