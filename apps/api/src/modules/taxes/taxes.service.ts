import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { CreateTaxDto } from './dto/tax.dto';

@Injectable()
export class TaxesService {
  constructor(private prisma: PrismaService) {}

  // Lab-scoped automatically by the tenancy extension.
  findAll() {
    return this.prisma.tax.findMany({ orderBy: { name: 'asc' } });
  }

  create(dto: CreateTaxDto) {
    return this.prisma.tax.create({
      data: tenantCreate<Prisma.TaxUncheckedCreateInput>({ ...dto }),
    });
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
