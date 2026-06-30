import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { CreateCodeFindingDto, CreateCodeSheetDto } from './dto/code-sheet.dto';

@Injectable()
export class CodeSheetsService {
  constructor(private prisma: PrismaService) {}

  // Code sheets and code findings are independent reference tables (per legacy);
  // both are lab-scoped automatically by the tenancy extension.
  findCodeSheets() {
    return this.prisma.codeSheet.findMany({ orderBy: { abbreviation: 'asc' } });
  }

  createCodeSheet(dto: CreateCodeSheetDto) {
    return this.prisma.codeSheet.create({
      data: tenantCreate<Prisma.CodeSheetUncheckedCreateInput>({ ...dto }),
    });
  }

  async removeCodeSheet(id: string) {
    const found = await this.prisma.codeSheet.findFirst({ where: { id } });
    if (!found) throw new NotFoundException('Code sheet not found');
    await this.prisma.codeSheet.delete({ where: { id } });
    return { deleted: true };
  }

  findCodeFindings() {
    return this.prisma.codeFinding.findMany({ orderBy: { abbreviation: 'asc' } });
  }

  createCodeFinding(dto: CreateCodeFindingDto) {
    return this.prisma.codeFinding.create({
      data: tenantCreate<Prisma.CodeFindingUncheckedCreateInput>({ ...dto }),
    });
  }

  async removeCodeFinding(id: string) {
    const found = await this.prisma.codeFinding.findFirst({ where: { id } });
    if (!found) throw new NotFoundException('Code finding not found');
    await this.prisma.codeFinding.delete({ where: { id } });
    return { deleted: true };
  }
}
