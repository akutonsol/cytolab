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
import { AuditRecorder } from '../audit/audit-recorder.service';
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
  constructor(
    private prisma: PrismaService,
    private audit: AuditRecorder,
  ) {}

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
    // Enterprise audit (P2-6C): administrative principal provisioning. After successful persistence.
    await this.audit.recordEntityCreated({ resource: { type: 'User', id: user.id }, producerModule: 'users' });
    // Enterprise audit (P2-6D): initial role-set assignment on the new principal (counts only).
    if (dto.roleIds?.length) {
      await this.audit.recordRoleAssignmentChanged({
        userId: user.id,
        rolesAddedCount: dto.roleIds.length,
        rolesRemovedCount: 0,
        resultingRoleCount: dto.roleIds.length,
        producerModule: 'users',
      });
    }
    return this.flatten(user);
  }

  async update(id: string, dto: UpdateUserDto) {
    const prev = await this.findOne(id);
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
    // Enterprise audit (P2-6C): administrative attribute update. Only the profile field NAMES are
    // recorded (change-evidence channel) — no values. Role-set changes (dto.roleIds) are an
    // AUTHORIZATION concern owned by P2-6D and are deliberately NOT audited here.
    const changedFields = (['firstName', 'lastName'] as const).filter((f) => dto[f] !== undefined);
    if (changedFields.length > 0) {
      await this.audit.recordEntityUpdated({
        resource: { type: 'User', id },
        changedFields: [...changedFields],
        producerModule: 'users',
      });
    }
    // Enterprise audit (P2-6D): role-set replacement (AUTHORIZATION). ONE event after the successful
    // replacement, counts only. A no-op re-submission of the same set (added == removed == 0) is not
    // a privilege change and emits nothing (consistent with the P2-6C no-op state guard).
    if (dto.roleIds !== undefined) {
      const prevRoleIds: string[] = prev.roles.map((r: { id: string }) => r.id);
      const newRoleIds = dto.roleIds;
      const rolesAddedCount = newRoleIds.filter((rid) => !prevRoleIds.includes(rid)).length;
      const rolesRemovedCount = prevRoleIds.filter((rid) => !newRoleIds.includes(rid)).length;
      if (rolesAddedCount > 0 || rolesRemovedCount > 0) {
        await this.audit.recordRoleAssignmentChanged({
          userId: id,
          rolesAddedCount,
          rolesRemovedCount,
          resultingRoleCount: newRoleIds.length,
          producerModule: 'users',
        });
      }
    }
    return this.flatten(user);
  }

  /** Legacy parity: PATCH /user/authAccess/{id} — enable/disable login */
  async setActive(id: string, isActive: boolean) {
    const prev = await this.findOne(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: { isActive },
      select: userSelect,
    });
    // Enterprise audit (P2-6C): account activation/deactivation state transition.
    await this.audit.recordEntityStateChanged({
      resource: { type: 'User', id },
      stateKey: 'account_active',
      previousValue: prev.isActive,
      newValue: isActive,
      producerModule: 'users',
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
