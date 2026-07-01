import { Injectable, NotFoundException } from '@nestjs/common';
import { RoleScope } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

export interface RoleBody {
  name: string;
  description?: string;
  isSuperRole?: boolean;
  scope?: RoleScope;
  permissionIds?: string[];
}

@Injectable()
export class RolesService {
  constructor(private prisma: PrismaService) {}

  findRoles() {
    return this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: { permissions: { include: { permission: true } } },
    });
  }

  findPermissions() {
    return this.prisma.permission.findMany({ orderBy: { code: 'asc' } });
  }

  createRole(body: RoleBody) {
    return this.prisma.role.create({
      data: {
        name: body.name,
        description: body.description,
        isSuperRole: body.isSuperRole ?? false,
        // Workspace enforcement is deferred; the column is still preserved.
        scope: body.scope ?? RoleScope.User,
        permissions: body.permissionIds?.length
          ? { create: body.permissionIds.map((permissionId) => ({ permissionId })) }
          : undefined,
      },
      include: { permissions: { include: { permission: true } } },
    });
  }

  async updateRole(id: string, body: Partial<RoleBody>) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');
    return this.prisma.role.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description,
        ...(body.isSuperRole !== undefined ? { isSuperRole: body.isSuperRole } : {}),
        ...(body.scope !== undefined ? { scope: body.scope } : {}),
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
