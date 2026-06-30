import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { CreateReportDto, ReportQueryDto } from './dto/report.dto';

const reportSelect = {
  id: true,
  resultSheetId: true,
  authorizerReference: true,
  content: true,
  signature: true,
  digitalSignature: true,
  medicalEntry: true,
  writtenById: true,
  writtenBy: { select: { id: true, email: true, firstName: true, lastName: true } },
  releasedAt: true,
  resultSheet: {
    select: { recordId: true, authorized: true, record: { select: { identifier: true } } },
  },
  createdAt: true,
} as const;

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Release a report from a result sheet. THE GATE: the sheet must be
   * authorized first — an unauthorized result sheet can never produce a
   * releasable report. (Reports module owns this; legacy did it via
   * PUT /resultsheet/reports/:id.)
   */
  async create(dto: CreateReportDto, userId: string) {
    const sheet = await this.prisma.resultSheet.findFirst({
      where: { id: dto.resultSheetId },
      select: { id: true, authorized: true },
    });
    if (!sheet) throw new NotFoundException('Result sheet not found');
    if (!sheet.authorized) {
      throw new ForbiddenException('Result sheet must be authorized before a report can be released');
    }

    return this.prisma.report.create({
      data: tenantCreate<Prisma.ReportUncheckedCreateInput>({
        resultSheetId: dto.resultSheetId,
        writtenById: userId,
        content: dto.content,
        authorizerReference: dto.authorizerReference,
        signature: dto.signature,
        digitalSignature: dto.digitalSignature,
        medicalEntry: dto.medicalEntry,
      }),
      select: reportSelect,
    });
  }

  async findAll(query: ReportQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const where: Prisma.ReportWhereInput = {};
    if (query.resultSheetId) where.resultSheetId = query.resultSheetId;

    const [data, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { releasedAt: 'desc' },
        select: reportSelect,
      }),
      this.prisma.report.count({ where }),
    ]);
    return paginate(data, total, page, pageSize);
  }

  async findOne(id: string) {
    const report = await this.prisma.report.findFirst({ where: { id }, select: reportSelect });
    if (!report) throw new NotFoundException('Report not found');
    return report;
  }

  /** Reporting summary (legacy GET /reports/summary). */
  async summary() {
    const [reports, resultSheets, authorizedSheets] = await Promise.all([
      this.prisma.report.count(),
      this.prisma.resultSheet.count(),
      this.prisma.resultSheet.count({ where: { authorized: true } }),
    ]);
    return {
      reports,
      resultSheets,
      authorizedSheets,
      unauthorizedSheets: resultSheets - authorizedSheets,
    };
  }
}
