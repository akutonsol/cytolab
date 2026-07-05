import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import * as bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { LabContext } from '../../common/tenancy/lab-context';
import { PrismaService } from '../../database/prisma.service';
import { ARGON2_OPTS, PasswordPolicyService } from '../security/password-policy.service';
import { LoginProtectionService } from '../security/login-protection.service';
import { MfaService } from '../security/mfa.service';
import { SessionService, REFRESH_COOKIE } from '../security/session.service';
import { buildRequestContext } from '../security/request-context.util';
import { LoginDto, RegisterLabDto } from './dto/login.dto';

const GENERIC_LOGIN_ERROR = 'Invalid username or password.';

/**
 * Version of the staff-token CLAIMS shape. Bump this whenever the permission
 * model changes what claims the app relies on.
 *   v1: sub/labId/email/roles/permissions
 *   v2: + isSuperRole (flag-driven super bypass)
 *   v3: + sid (session id, for idle-timeout enforcement)
 */
export const TOKEN_CLAIMS_VERSION = 3;

export interface JwtPayload {
  sub: string; // user id
  labId: string;
  email: string;
  roles: string[];
  permissions: string[];
  isSuperRole?: boolean;
  ver?: number;
  sid?: string; // session id (present on cookie-era tokens)
  type: 'access' | 'refresh';
  scope: 'staff';
}

/** Short-lived token proving password was accepted, pending the MFA step. */
interface MfaTokenPayload {
  sub: string;
  type: 'mfa';
  scope: 'staff';
}

type UserWithRoles = {
  id: string;
  labId: string;
  email: string;
  firstName: string;
  isActive: boolean;
  passwordHash: string;
  mfaRequired: boolean;
  roles: { role: { name: string; isSuperRole: boolean; permissions: { permission: { code: string } }[] } }[];
};

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private labContext: LabContext,
    private passwordPolicy: PasswordPolicyService,
    private loginProtection: LoginProtectionService,
    private mfa: MfaService,
    private sessions: SessionService,
  ) {}

  /** Bootstrap: create a Lab, its Account, default Workspace, Superuser role, and first user. */
  async registerLab(dto: RegisterLabDto) {
    const existing = await this.prisma.lab.findUnique({ where: { slug: dto.labSlug } });
    if (existing) throw new ConflictException('Lab slug already taken');

    // Enforce the password policy at bootstrap too (specific errors are safe:
    // the caller is provisioning their own first account).
    await this.passwordPolicy.assertCompliant(dto.password);
    const passwordHash = await argon2.hash(dto.password, ARGON2_OPTS);

    const result = await this.labContext.runSystem(() =>
      this.prisma.$transaction(async (tx: any) => {
        const lab = await tx.lab.create({ data: { name: dto.labName, slug: dto.labSlug } });
        const account = await tx.account.create({ data: { name: dto.labName, labId: lab.id } });
        const workspace = await tx.workspace.create({
          data: { name: 'Global', labId: lab.id, accountId: account.id },
        });
        const superuser = await tx.role.upsert({
          where: { name: 'Superuser' },
          update: { isSuperRole: true },
          create: { name: 'Superuser', description: 'Full access', isSuperRole: true },
        });
        const user = await tx.user.create({
          data: {
            labId: lab.id,
            email: dto.email.toLowerCase(),
            passwordHash,
            firstName: dto.firstName,
            lastName: dto.lastName,
            accountId: account.id,
            workspaceId: workspace.id,
            passwordChangedAt: new Date(),
            roles: { create: { roleId: superuser.id } },
          },
        });
        await tx.passwordHistory.create({ data: { userId: user.id, hash: passwordHash } });
        return { labId: lab.id, userId: user.id };
      }),
    );
    return result;
  }

  /**
   * Staff login. Verifies credentials (migrating any legacy bcrypt hash to
   * Argon2id), enforces lockout, records the attempt, then either completes the
   * session (HttpOnly cookies) or returns an MFA challenge token.
   */
  async login(dto: LoginDto, req: Request, res: Response) {
    const email = dto.email.toLowerCase();
    const user = (await this.labContext.runSystem(() =>
      this.prisma.user.findFirst({ where: { email }, include: this.rolesInclude() }),
    )) as UserWithRoles | null;

    const ctx = buildRequestContext(user?.id ?? email, req);

    // Account lock gate (does not disclose credential correctness).
    if (user) {
      const lock = await this.loginProtection.getLockState(user.id);
      if (lock.locked) {
        await this.loginProtection.recordAttempt({
          email,
          ctx,
          success: false,
          failReason: 'account_locked',
          userId: user.id,
        });
        throw new ForbiddenException({
          code: 'ACCOUNT_LOCKED',
          message: lock.permanent
            ? 'Your account is locked. Contact an administrator.'
            : 'Your account is temporarily locked. Try again later.',
        });
      }
    }

    const valid = !!user && user.isActive && (await this.verifyAndMigrate(user, dto.password));
    if (!user || !valid) {
      await this.loginProtection.handleFailure({
        user: user ? { id: user.id, labId: user.labId } : null,
        email,
        ctx,
        reason: user ? 'bad_password' : 'unknown_user',
      });
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }

    const risk = await this.loginProtection.handleSuccess({
      user: { id: user.id, labId: user.labId, email: user.email, firstName: user.firstName },
      ctx,
    });

    // Decide MFA: challenge only if the user has an enrolled method, and either
    // the device isn't trusted or impossible travel forces a step-up.
    const hasMfa = await this.mfa.hasMfa(user.id);
    const needsMfa = hasMfa && (!risk.trustedDevice || risk.impossibleTravel);
    if (needsMfa) {
      const mfaToken = await this.jwt.signAsync(
        { sub: user.id, type: 'mfa', scope: 'staff' } satisfies MfaTokenPayload,
        { secret: this.config.get('JWT_SECRET'), expiresIn: '5m', audience: 'staff' },
      );
      const methods = await this.mfa.getStatus(user.id);
      // If email is the only method, send the code now so the user isn't stuck.
      if (methods.emailEnabled && !methods.totpEnabled) {
        await this.mfa.sendEmailOtp({ id: user.id, email: user.email, firstName: user.firstName });
      }
      return { status: 'MFA_REQUIRED' as const, mfaToken, methods };
    }

    return this.completeLogin(user, ctx, res);
  }

  /** Second leg of MFA login: validate the code against the mfaToken and finish the session. */
  async completeMfaChallenge(mfaToken: string, code: string, req: Request, res: Response) {
    let payload: MfaTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<MfaTokenPayload>(mfaToken, {
        secret: this.config.get('JWT_SECRET'),
        audience: 'staff',
      });
    } catch {
      throw new UnauthorizedException('MFA session expired. Sign in again.');
    }
    if (payload.type !== 'mfa') throw new UnauthorizedException('Invalid MFA token');

    const user = (await this.labContext.runSystem(() =>
      this.prisma.user.findUnique({ where: { id: payload.sub }, include: this.rolesInclude() }),
    )) as UserWithRoles | null;
    if (!user || !user.isActive) throw new UnauthorizedException('MFA session expired. Sign in again.');

    const ctx = buildRequestContext(user.id, req);
    const ok = await this.mfa.verifyLoginCode({ id: user.id, email: user.email }, code);
    if (!ok) {
      await this.loginProtection.recordAttempt({
        email: user.email,
        ctx,
        success: false,
        failReason: 'bad_mfa_code',
        userId: user.id,
      });
      throw new UnauthorizedException('Invalid verification code.');
    }

    // Passing MFA trusts this device for future logins.
    await this.loginProtection.trustDevice(user.id, ctx);
    return this.completeLogin(user, ctx, res);
  }

  /** Resend the email OTP during the MFA login step (authorised by the mfaToken). */
  async sendLoginEmailOtp(mfaToken: string) {
    let payload: MfaTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<MfaTokenPayload>(mfaToken, {
        secret: this.config.get('JWT_SECRET'),
        audience: 'staff',
      });
    } catch {
      throw new UnauthorizedException('MFA session expired. Sign in again.');
    }
    if (payload.type !== 'mfa') throw new UnauthorizedException('Invalid MFA token');
    const user = await this.labContext.runSystem(() =>
      this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, firstName: true },
      }),
    );
    if (!user) throw new UnauthorizedException('MFA session expired. Sign in again.');
    await this.mfa.sendEmailOtp(user);
    return { status: 'OK' as const };
  }

  /** Rotate the opaque refresh token (cookie) and re-issue a fresh access cookie. */
  async refresh(req: Request, res: Response) {
    const raw = this.readRefreshToken(req);
    if (!raw) throw new UnauthorizedException('No refresh token');
    const ctx = buildRequestContext('refresh', req);
    const { userId, refreshToken, sessionId } = await this.sessions.rotateRefreshToken(raw, ctx);

    const user = (await this.labContext.runSystem(() =>
      this.prisma.user.findUnique({ where: { id: userId }, include: this.rolesInclude() }),
    )) as UserWithRoles | null;
    if (!user || !user.isActive) throw new UnauthorizedException('User no longer active');

    const accessToken = await this.buildAccessToken(user, sessionId);
    this.sessions.setAuthCookies(res, accessToken, refreshToken);
    return { status: 'OK' as const, user: this.userSummary(user) };
  }

  /** Revoke the presented refresh token + its session and clear cookies. */
  async logout(req: Request, res: Response) {
    const raw = this.readRefreshToken(req);
    await this.sessions.revokeByRefreshToken(raw);
    this.sessions.clearAuthCookies(res);
    return { status: 'OK' as const };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        labId: true,
        mfaRequired: true,
        passwordExpiresAt: true,
        lab: { select: { name: true, slug: true } },
        roles: {
          select: {
            role: {
              select: {
                name: true,
                isSuperRole: true,
                permissions: { select: { permission: { select: { code: true } } } },
              },
            },
          },
        },
        mfaConfig: { select: { totpEnabled: true, emailEnabled: true } },
      },
    });
    if (!user) throw new UnauthorizedException();
    const isSuperRole = user.roles.some((r: any) => r.role.isSuperRole);
    const permissions = [
      ...new Set(
        user.roles.flatMap((r: any) => r.role.permissions.map((p: any) => p.permission.code)),
      ),
    ];
    return {
      ...user,
      roles: user.roles.map((r: any) => r.role.name),
      permissions,
      isSuperRole,
      // Lets the cookie-era web client gate nav without decoding a token.
      ver: TOKEN_CLAIMS_VERSION,
      mfaEnabled: !!(user.mfaConfig?.totpEnabled || user.mfaConfig?.emailEnabled),
    };
  }

  /** Authenticated self-service password change (enforces policy + no-reuse). */
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });
    if (!user) throw new UnauthorizedException();
    const ok = await argon2.verify(user.passwordHash, currentPassword).catch(() => false);
    if (!ok) throw new UnauthorizedException('Current password is incorrect.');

    await this.passwordPolicy.assertCompliant(newPassword);
    await this.passwordPolicy.assertNotReused(userId, newPassword);
    const hash = await this.passwordPolicy.hashAndRecord(userId, newPassword);
    const passwordExpiresAt = await this.passwordPolicy.computeExpiry();
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hash, passwordChangedAt: new Date(), passwordExpiresAt },
    });
    // Force re-auth on other devices after a password change.
    await this.sessions.revokeAllForUser(userId);
    return { status: 'OK' as const };
  }

  // --- internals -------------------------------------------------------------

  private rolesInclude() {
    return {
      roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
    };
  }

  /**
   * Verify a password against the stored hash. If the hash is legacy bcrypt,
   * verify with bcrypt then transparently re-hash to Argon2id and persist —
   * seamless migration on next login.
   */
  private async verifyAndMigrate(user: UserWithRoles, password: string): Promise<boolean> {
    const hash = user.passwordHash;
    if (hash.startsWith('$2')) {
      const ok = await bcrypt.compare(password, hash).catch(() => false);
      if (ok) {
        const newHash = await argon2.hash(password, ARGON2_OPTS);
        await this.labContext.runSystem(async () => {
          await this.prisma.user.update({
            where: { id: user.id },
            data: { passwordHash: newHash, passwordChangedAt: new Date() },
          });
          await this.prisma.passwordHistory.create({ data: { userId: user.id, hash: newHash } });
        });
      }
      return ok;
    }
    return argon2.verify(hash, password).catch(() => false);
  }

  private async completeLogin(user: UserWithRoles, ctx: ReturnType<typeof buildRequestContext>, res: Response) {
    const { sessionId, refreshToken } = await this.sessions.createSession(user.id, ctx);
    const accessToken = await this.buildAccessToken(user, sessionId);
    this.sessions.setAuthCookies(res, accessToken, refreshToken);
    return { status: 'OK' as const, user: this.userSummary(user) };
  }

  private buildClaims(user: UserWithRoles) {
    const roles = user.roles.map((r) => r.role.name);
    const isSuperRole = user.roles.some((r) => r.role.isSuperRole);
    const permissions = [
      ...new Set(user.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.code))),
    ];
    return { roles, isSuperRole, permissions };
  }

  private async buildAccessToken(user: UserWithRoles, sessionId?: string): Promise<string> {
    const { roles, isSuperRole, permissions } = this.buildClaims(user);
    return this.jwt.signAsync(
      {
        sub: user.id,
        labId: user.labId,
        email: user.email,
        roles,
        permissions,
        isSuperRole,
        ver: TOKEN_CLAIMS_VERSION,
        sid: sessionId,
        type: 'access',
        scope: 'staff' as const,
      },
      {
        secret: this.config.get<string>('JWT_SECRET'),
        expiresIn: this.config.get<string>('JWT_EXPIRES_IN') ?? '15m',
        audience: 'staff',
      },
    );
  }

  private userSummary(user: UserWithRoles) {
    const { roles, permissions } = this.buildClaims(user);
    return { id: user.id, email: user.email, roles, permissions };
  }

  private readRefreshToken(req: Request): string | undefined {
    return (req as any).cookies?.[REFRESH_COOKIE];
  }
}
