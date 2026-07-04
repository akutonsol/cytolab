import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { ChangePasswordDto, CreateUserDto, UpdateUserDto } from './dto/user.dto';

const userSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  isActive: true,
  createdAt: true,
  roles: { select: { role: { select: { id: true, name: true } } } },
} as const;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  // All queries are lab-scoped automatically by the tenancy extension: labId
  // comes from the JWT request context, never from the request body.
  async findAll() {
    const users = await this.prisma.user.findMany({ select: userSelect });
    return users.map(this.flatten);
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findFirst({ where: { id }, select: userSelect });
    if (!user) throw new NotFoundException('User not found');
    return this.flatten(user);
  }

  async create(dto: CreateUserDto) {
    const email = dto.email.toLowerCase();
    const dup = await this.prisma.user.findFirst({ where: { email } });
    if (dup) throw new ConflictException('A user with this email already exists in this lab');

    const account = await this.prisma.account.findFirst();
    if (!account) throw new NotFoundException('Lab account missing');

    const user = await this.prisma.user.create({
      data: tenantCreate<Prisma.UserUncheckedCreateInput>({
        email,
        passwordHash: await argon2.hash(dto.password),
        firstName: dto.firstName,
        lastName: dto.lastName,
        accountId: account.id,
        roles: dto.roleIds?.length
          ? { create: dto.roleIds.map((roleId) => ({ roleId })) }
          : undefined,
      }),
      select: userSelect,
    });
    return this.flatten(user);
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        ...(dto.roleIds
          ? {
              roles: {
                deleteMany: {},
                create: dto.roleIds.map((roleId) => ({ roleId })),
              },
            }
          : {}),
      },
      select: userSelect,
    });
    return this.flatten(user);
  }

  /** Legacy parity: PATCH /user/authAccess/{id} — enable/disable login */
  async setActive(id: string, isActive: boolean) {
    await this.findOne(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: { isActive },
      select: userSelect,
    });
    return this.flatten(user);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await argon2.verify(user.passwordHash, dto.currentPassword))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await argon2.hash(dto.newPassword) },
    });
    return { changed: true };
  }

  // ── Signature (used when authorizing result sheets; rendered on reports) ──
  async getMySignature(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId },
      select: { signatureUrl: true },
    });
    return { signatureUrl: user?.signatureUrl ?? null };
  }

  async saveMySignature(userId: string, signatureDataUri: string) {
    // Validate it's a PNG data URI.
    if (!signatureDataUri.startsWith('data:image/png;base64,')) {
      throw new BadRequestException('Invalid signature format');
    }
    // Store as a data URI directly (no file upload needed for now).
    // Phase 6: migrate to a GCS bucket URL.
    await this.prisma.user.update({
      where: { id: userId },
      data: { signatureUrl: signatureDataUri },
    });
    return { ok: true };
  }

  private flatten(u: any) {
    return { ...u, roles: u.roles.map((r: any) => r.role) };
  }
}
