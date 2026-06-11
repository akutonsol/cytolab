import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../database/prisma.service';
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

  // All queries are lab-scoped: labId always comes from the JWT, never the request body.
  async findAll(labId: string) {
    const users = await this.prisma.user.findMany({ where: { labId }, select: userSelect });
    return users.map(this.flatten);
  }

  async findOne(labId: string, id: string) {
    const user = await this.prisma.user.findFirst({ where: { id, labId }, select: userSelect });
    if (!user) throw new NotFoundException('User not found');
    return this.flatten(user);
  }

  async create(labId: string, dto: CreateUserDto) {
    const email = dto.email.toLowerCase();
    const dup = await this.prisma.user.findFirst({ where: { labId, email } });
    if (dup) throw new ConflictException('A user with this email already exists in this lab');

    const account = await this.prisma.account.findFirst({ where: { labId } });
    if (!account) throw new NotFoundException('Lab account missing');

    const user = await this.prisma.user.create({
      data: {
        labId,
        email,
        passwordHash: await argon2.hash(dto.password),
        firstName: dto.firstName,
        lastName: dto.lastName,
        accountId: account.id,
        roles: dto.roleIds?.length
          ? { create: dto.roleIds.map((roleId) => ({ roleId })) }
          : undefined,
      },
      select: userSelect,
    });
    return this.flatten(user);
  }

  async update(labId: string, id: string, dto: UpdateUserDto) {
    await this.findOne(labId, id);
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
  async setActive(labId: string, id: string, isActive: boolean) {
    await this.findOne(labId, id);
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

  private flatten(u: any) {
    return { ...u, roles: u.roles.map((r: any) => r.role) };
  }
}
