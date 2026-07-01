import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { isUniqueConflict } from '../../common/util/lab-sequence';
import { CreateTaxDto, UpdateTaxDto } from './dto/tax.dto';

@Injectable()
export class TaxesService {
  constructor(private prisma: PrismaService) {}

  // Lab-scoped automatically by the tenancy extension.
  findAll() {
    return this.prisma.tax.findMany({ orderBy: { name: 'asc' } });
  }

  async create(dto: CreateTaxDto) {
    try {
      return await this.prisma.tax.create({
        data: tenantCreate<Prisma.TaxUncheckedCreateInput>({ ...dto }),
      });
    } catch (e) {
      if (isUniqueConflict(e, 'name')) throw new ConflictException(`A tax named "${dto.name}" already exists`);
      throw e;
    }
  }

  async update(id: string, dto: UpdateTaxDto) {
    const found = await this.prisma.tax.findFirst({ where: { id } });
    if (!found) throw new NotFoundException('Tax not found');
    try {
      return await this.prisma.tax.update({ where: { id }, data: dto });
    } catch (e) {
      if (isUniqueConflict(e, 'name')) throw new ConflictException(`A tax named "${dto.name}" already exists`);
      throw e;
    }
  }

  async remove(id: string) {
    const found = await this.prisma.tax.findFirst({ where: { id } });
    if (!found) throw new NotFoundException('Tax not found');
    // BillTax.taxId is SET NULL on delete, so historical bills keep their
    // snapshotted tax name/rate.
    await this.prisma.tax.delete({ where: { id } });
    return { deleted: true };
  }
}
