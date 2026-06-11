import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class RolesService {
  constructor(private prisma: PrismaService) {}

  findRoles() {
    return this.prisma.role.findMany({
      include: { permissions: { include: { permission: true } } },
    });
  }

  findPermissions() {
    return this.prisma.permission.findMany({ orderBy: { code: 'asc' } });
  }

  createRole(body: { name: string; description?: string; permissionIds?: string[] }) {
    return this.prisma.role.create({
      data: {
        name: body.name,
        description: body.description,
        permissions: body.permissionIds?.length
          ? { create: body.permissionIds.map((permissionId) => ({ permissionId })) }
          : undefined,
      },
      include: { permissions: { include: { permission: true } } },
    });
  }

  async updateRole(
    id: string,
    body: { name?: string; description?: string; permissionIds?: string[] },
  ) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');
    return this.prisma.role.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description,
        ...(body.permissionIds
          ? {
              permissions: {
                deleteMany: {},
                create: body.permissionIds.map((permissionId) => ({ permissionId })),
              },
            }
          : {}),
      },
      include: { permissions: { include: { permission: true } } },
    });
  }

  async deleteRole(id: string) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');
    await this.prisma.role.delete({ where: { id } });
    return { deleted: true };
  }
}
