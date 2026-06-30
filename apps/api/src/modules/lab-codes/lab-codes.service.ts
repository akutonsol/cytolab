import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { CreateLabCodeDto } from './dto/lab-code.dto';

@Injectable()
export class LabCodesService {
  constructor(private prisma: PrismaService) {}

  // Lab-scoped automatically by the tenancy extension.
  findAll() {
    return this.prisma.labCode.findMany({ orderBy: { code: 'asc' } });
  }

  create(dto: CreateLabCodeDto) {
    return this.prisma.labCode.create({
      data: tenantCreate<Prisma.LabCodeUncheckedCreateInput>({ ...dto }),
    });
  }

  async remove(id: string) {
    const found = await this.prisma.labCode.findFirst({ where: { id } });
    if (!found) throw new NotFoundException('Lab code not found');
    await this.prisma.labCode.delete({ where: { id } });
    return { deleted: true };
  }
}
