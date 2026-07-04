import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { CreateWorkspaceDto, UpdateWorkspaceDto, WorkspaceQueryDto } from './dto/workspace.dto';

const listSelect = {
  id: true,
  name: true,
  accountId: true,
  createdAt: true,
  users: { select: { id: true, firstName: true, lastName: true }, take: 3 },
  _count: { select: { users: true, records: true, clients: true } },
} as const;

/**
 * Workspaces (departments / branches). Every query is lab-scoped by the tenancy
 * guard; a workspace can only be deleted once nothing references it.
 */
@Injectable()
export class WorkspacesService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: WorkspaceQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const skip = (page - 1) * pageSize;
    const [data, total] = await Promise.all([
      this.prisma.workspace.findMany({ skip, take: pageSize, orderBy: { createdAt: 'desc' }, select: listSelect }),
      this.prisma.workspace.count(),
    ]);
    return paginate(data, total, page, pageSize);
  }

  async findOne(id: string) {
    const workspace = await this.prisma.workspace.findFirst({ where: { id }, select: listSelect });
    if (!workspace) throw new NotFoundException('Workspace not found');
    return workspace;
  }

  async create(dto: CreateWorkspaceDto) {
    // Default to the lab's account when the caller doesn't specify one.
    const accountId = dto.accountId ?? (await this.prisma.account.findFirst({ select: { id: true } }))?.id;
    if (!accountId) throw new BadRequestException('No account available for this lab');

    return this.prisma.workspace.create({
      data: tenantCreate<Prisma.WorkspaceUncheckedCreateInput>({ name: dto.name.trim(), accountId }),
      select: listSelect,
    });
  }

  async update(id: string, dto: UpdateWorkspaceDto) {
    await this.findOne(id); // lab-scoped existence check
    return this.prisma.workspace.update({ where: { id }, data: { name: dto.name.trim() }, select: listSelect });
  }

  async remove(id: string) {
    const workspace = await this.prisma.workspace.findFirst({
      where: { id },
      select: { id: true, _count: { select: { users: true, records: true, clients: true } } },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');
    const { users, records, clients } = workspace._count;
    if (users + records + clients > 0) {
      const parts = [
        users ? `${users} user${users === 1 ? '' : 's'}` : null,
        records ? `${records} record${records === 1 ? '' : 's'}` : null,
        clients ? `${clients} client${clients === 1 ? '' : 's'}` : null,
      ].filter(Boolean);
      throw new BadRequestException(`Cannot delete — reassign ${parts.join(', ')} first.`);
    }
    await this.prisma.workspace.delete({ where: { id } });
    return { deleted: true };
  }
}
