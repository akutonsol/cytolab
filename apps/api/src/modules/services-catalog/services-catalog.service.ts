import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { isUniqueConflict } from '../../common/util/lab-sequence';
import { CreateServiceDto, ServiceQueryDto, UpdateServiceDto } from './dto/service.dto';

@Injectable()
export class ServicesCatalogService {
  constructor(private prisma: PrismaService) {}

  // Lab-scoped automatically by the tenancy extension.
  async findAll(query: ServiceQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const where: Prisma.ServiceWhereInput = {};
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { code: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    const [data, total] = await Promise.all([
      this.prisma.service.findMany({ where, skip, take: pageSize, orderBy: { name: 'asc' } }),
      this.prisma.service.count({ where }),
    ]);
    return paginate(data, total, page, pageSize);
  }

  async create(dto: CreateServiceDto) {
    try {
      return await this.prisma.service.create({
        data: tenantCreate<Prisma.ServiceUncheckedCreateInput>({ ...dto }),
      });
    } catch (e) {
      if (isUniqueConflict(e, 'name')) throw new ConflictException(`A service named "${dto.name}" already exists`);
      throw e;
    }
  }

  async update(id: string, dto: UpdateServiceDto) {
    const found = await this.prisma.service.findFirst({ where: { id } });
    if (!found) throw new NotFoundException('Service not found');
    try {
      return await this.prisma.service.update({ where: { id }, data: dto });
    } catch (e) {
      if (isUniqueConflict(e, 'name')) throw new ConflictException(`A service named "${dto.name}" already exists`);
      throw e;
    }
  }

  async remove(id: string) {
    const found = await this.prisma.service.findFirst({ where: { id } });
    if (!found) throw new NotFoundException('Service not found');
    // BillLine.serviceId is ON DELETE SET NULL, so historical bills keep their
    // snapshotted name/price even after the catalog entry is removed.
    await this.prisma.service.delete({ where: { id } });
    return { deleted: true };
  }
}
