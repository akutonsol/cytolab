import { Injectable, NotFoundException } from '@nestjs/common';
import { RoleScope } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditRecorder } from '../audit/audit-recorder.service';

export interface RoleBody {
  name: string;
  description?: string;
  isSuperRole?: boolean;
  scope?: RoleScope;
  permissionIds?: string[];
}

@Injectable()
export class RolesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditRecorder,
  ) {}

  findRoles() {
    return this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: { permissions: { include: { permission: true } } },
    });
  }

  findPermissions() {
    return this.prisma.permission.findMany({ orderBy: { code: 'asc' } });
  }

  async createRole(body: RoleBody) {
    const created = await this.prisma.role.create({
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
    // Enterprise audit (P2-6D): role (permission bundle) created, after successful persistence.
    await this.audit.recordRoleCreated({ roleId: created.id, producerModule: 'roles' });
    return created;
  }

  async updateRole(id: string, body: Partial<RoleBody>) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');
    const updated = await this.prisma.role.update({
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
    // Enterprise audit (P2-6D): role attribute/permission-set change. Field NAMES only — the
    // permission list is a security-relevant fact recorded as 'permissions', never enumerated.
    const changedFields = (['name', 'description', 'isSuperRole', 'scope'] as const).filter((f) => body[f] !== undefined) as string[];
    if (body.permissionIds !== undefined) changedFields.push('permissions');
    if (changedFields.length > 0) {
      await this.audit.recordRoleUpdated({ roleId: id, changedFields, producerModule: 'roles' });
    }
    return updated;
  }

  async deleteRole(id: string) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');
    await this.prisma.role.delete({ where: { id } });
    // Enterprise audit (P2-6D): role deletion, after the delete commits.
    await this.audit.recordRoleDeleted({ roleId: id, producerModule: 'roles' });
    return { deleted: true };
  }
}
