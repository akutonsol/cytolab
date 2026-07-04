import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { CreateDepartmentDto, DepartmentQueryDto, UpdateDepartmentDto } from './dto/department.dto';

const listSelect = {
  id: true,
  name: true,
  description: true,
  managerId: true,
  manager: { select: { id: true, firstName: true, lastName: true } },
  _count: { select: { employees: true } },
  createdAt: true,
} as const;

/**
 * Departments (teams/branches). Every query is lab-scoped automatically by the
 * tenancy extension; a department can only be deleted once no employee is in it.
 */
@Injectable()
export class DepartmentsService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: DepartmentQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 100;
    const skip = (page - 1) * pageSize;
    const [data, total] = await Promise.all([
      this.prisma.department.findMany({ skip, take: pageSize, orderBy: { name: 'asc' }, select: listSelect }),
      this.prisma.department.count(),
    ]);
    return paginate(data, total, page, pageSize);
  }

  async findOne(id: string) {
    const dept = await this.prisma.department.findFirst({ where: { id }, select: listSelect });
    if (!dept) throw new NotFoundException('Department not found');
    return dept;
  }

  async create(dto: CreateDepartmentDto) {
    return this.prisma.department.create({
      data: tenantCreate<Prisma.DepartmentUncheckedCreateInput>({
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        managerId: dto.managerId || null,
      }),
      select: listSelect,
    });
  }

  async update(id: string, dto: UpdateDepartmentDto) {
    await this.findOne(id); // lab-scoped existence check
    return this.prisma.department.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.description !== undefined && { description: dto.description?.trim() || null }),
        ...(dto.managerId !== undefined && { managerId: dto.managerId || null }),
      },
      select: listSelect,
    });
  }

  async remove(id: string) {
    const dept = await this.prisma.department.findFirst({
      where: { id },
      select: { id: true, _count: { select: { employees: true } } },
    });
    if (!dept) throw new NotFoundException('Department not found');
    if (dept._count.employees > 0) {
      throw new BadRequestException(
        `Cannot delete — reassign ${dept._count.employees} employee${dept._count.employees === 1 ? '' : 's'} first.`,
      );
    }
    await this.prisma.department.delete({ where: { id } });
    return { deleted: true };
  }
}
