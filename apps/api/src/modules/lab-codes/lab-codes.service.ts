import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { isUniqueConflict } from '../../common/util/lab-sequence';
import { CreateLabCodeDto, UpdateLabCodeDto } from './dto/lab-code.dto';

@Injectable()
export class LabCodesService {
  constructor(private prisma: PrismaService) {}

  // Lab-scoped automatically by the tenancy extension.
  findAll() {
    return this.prisma.labCode.findMany({ orderBy: { code: 'asc' } });
  }

  async create(dto: CreateLabCodeDto) {
    try {
      return await this.prisma.labCode.create({
        data: tenantCreate<Prisma.LabCodeUncheckedCreateInput>({ ...dto }),
      });
    } catch (e) {
      if (isUniqueConflict(e, 'code')) throw new ConflictException(`Lab code "${dto.code}" already exists`);
      throw e;
    }
  }

  async update(id: string, dto: UpdateLabCodeDto) {
    const found = await this.prisma.labCode.findFirst({ where: { id } });
    if (!found) throw new NotFoundException('Lab code not found');
    try {
      return await this.prisma.labCode.update({ where: { id }, data: dto });
    } catch (e) {
      if (isUniqueConflict(e, 'code')) throw new ConflictException(`Lab code "${dto.code}" already exists`);
      throw e;
    }
  }

  async remove(id: string) {
    const found = await this.prisma.labCode.findFirst({ where: { id } });
    if (!found) throw new NotFoundException('Lab code not found');
    await this.prisma.labCode.delete({ where: { id } });
    return { deleted: true };
  }
}
