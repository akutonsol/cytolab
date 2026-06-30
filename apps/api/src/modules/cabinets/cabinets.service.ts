import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { paginate, PaginationDto } from '../../common/dto/pagination.dto';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { CreateCabinetDto, UpdateCabinetDto } from './dto/cabinet.dto';

@Injectable()
export class CabinetsService {
  constructor(private prisma: PrismaService) {}

  // All queries are lab-scoped automatically by the tenancy extension.
  findAll() {
    return this.prisma.cabinet.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const cabinet = await this.prisma.cabinet.findFirst({ where: { id } });
    if (!cabinet) throw new NotFoundException('Cabinet not found');
    return cabinet;
  }

  create(dto: CreateCabinetDto) {
    return this.prisma.cabinet.create({
      data: tenantCreate<Prisma.CabinetUncheckedCreateInput>({ ...dto }),
    });
  }

  async update(id: string, dto: UpdateCabinetDto) {
    await this.findOne(id);
    return this.prisma.cabinet.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    // Record.cabinetId is ON DELETE SET NULL, so filed records are simply unfiled.
    await this.prisma.cabinet.delete({ where: { id } });
    return { deleted: true };
  }

  /** Records filed in a cabinet (legacy GET /cabinet/records/:id). */
  async records(id: string, query: PaginationDto) {
    await this.findOne(id);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const where = { cabinetId: id };
    const [data, total] = await Promise.all([
      this.prisma.record.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          identifier: true,
          status: true,
          patientId: true,
          patient: { select: { firstName: true, lastName: true, registrationNo: true } },
          createdAt: true,
        },
      }),
      this.prisma.record.count({ where }),
    ]);
    return paginate(data, total, page, pageSize);
  }
}
