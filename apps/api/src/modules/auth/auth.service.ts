import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { LabContext } from '../../common/tenancy/lab-context';
import { PrismaService } from '../../database/prisma.service';
import { LoginDto, RegisterLabDto } from './dto/login.dto';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MINUTES = 15;

export interface JwtPayload {
  sub: string; // user id
  labId: string;
  email: string;
  roles: string[];
  permissions: string[];
  type: 'access' | 'refresh';
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private labContext: LabContext,
  ) {}

  /** Bootstrap: create a Lab, its Account, default Workspace, Superuser role, and first user. */
  async registerLab(dto: RegisterLabDto) {
    const existing = await this.prisma.lab.findUnique({ where: { slug: dto.labSlug } });
    if (existing) throw new ConflictException('Lab slug already taken');

    const passwordHash = await argon2.hash(dto.password);

    // Bootstrap runs before any lab is authenticated: create tenant rows
    // (account/workspace/user) with explicit labIds, outside tenancy scoping.
    return this.labContext.runSystem(() =>
      this.prisma.$transaction(async (tx: any) => {
        const lab = await tx.lab.create({
          data: { name: dto.labName, slug: dto.labSlug },
        });
        const account = await tx.account.create({
          data: { name: dto.labName, labId: lab.id },
        });
        const workspace = await tx.workspace.create({
          data: { name: 'Global', labId: lab.id, accountId: account.id },
        });
        const superuser = await tx.role.upsert({
          where: { name: 'Superuser' },
          update: {},
          create: { name: 'Superuser', description: 'Full access' },
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
            roles: { create: { roleId: superuser.id } },
          },
        });
        return { labId: lab.id, userId: user.id };
      }),
    );
  }

  async login(dto: LoginDto, ip?: string) {
    const email = dto.email.toLowerCase();
    // Cross-lab lookup: the user's lab is discovered here, so it can't be scoped yet.
    const user = await this.labContext.runSystem(() =>
      this.prisma.user.findFirst({
        where: { email },
        include: {
          roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
        },
      }),
    );

    // Lockout check (legacy parity: AuthAttempt tracking)
    const windowStart = new Date(Date.now() - LOCKOUT_WINDOW_MINUTES * 60_000);
    const recentFailures = await this.prisma.authAttempt.count({
      where: { email, success: false, createdAt: { gte: windowStart } },
    });
    if (recentFailures >= MAX_FAILED_ATTEMPTS) {
      throw new ForbiddenException(
        `Account temporarily locked after ${MAX_FAILED_ATTEMPTS} failed attempts. Try again later.`,
      );
    }

    const valid =
      user && user.isActive && (await argon2.verify(user.passwordHash, dto.password));

    await this.prisma.authAttempt.create({
      data: { email, ip, success: !!valid, userId: user?.id ?? null },
    });

    if (!valid) throw new UnauthorizedException('Invalid credentials');

    return this.issueTokens(user);
  }

  async refresh(refreshToken: string) {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (payload.type !== 'refresh') throw new UnauthorizedException('Invalid token type');

    // Public endpoint: no request lab context, so resolve the user unscoped.
    const user = await this.labContext.runSystem(() =>
      this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: {
          roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
        },
      }),
    );
    if (!user || !user.isActive) throw new UnauthorizedException('User no longer active');

    return this.issueTokens(user);
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
        lab: { select: { name: true, slug: true } },
        roles: { select: { role: { select: { name: true } } } },
      },
    });
    if (!user) throw new UnauthorizedException();
    return { ...user, roles: user.roles.map((r: any) => r.role.name) };
  }

  private async issueTokens(user: {
    id: string;
    labId: string;
    email: string;
    roles: { role: { name: string; permissions: { permission: { code: string } }[] } }[];
  }) {
    const roles = user.roles.map((r: any) => r.role.name);
    const permissions = [
      ...new Set(user.roles.flatMap((r: any) => r.role.permissions.map((p: any) => p.permission.code))),
    ];

    const base = { sub: user.id, labId: user.labId, email: user.email, roles, permissions };

    const accessToken = await this.jwt.signAsync(
      { ...base, type: 'access' },
      {
        secret: this.config.get<string>('JWT_SECRET'),
        expiresIn: this.config.get<string>('JWT_EXPIRES_IN') ?? '15m',
      },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, labId: user.labId, email: user.email, roles: [], permissions: [], type: 'refresh' },
      {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d',
      },
    );

    return { accessToken, refreshToken, user: { id: user.id, email: user.email, roles, permissions } };
  }
}
