import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { CreateReportDto, ReportQueryDto } from './dto/report.dto';
import { ReportPdfService } from './report-pdf.service';
import { ReportDocumentData } from './report-document';
import { deriveAge } from '../../common/util/age';

// Only embed images we can trust without a network fetch (avoids SSRF / render
// failures in the PDF path). Remote URL fetching is deferred — see Phase 3.5.
const asDataUri = (url?: string | null): string | null =>
  url && url.startsWith('data:') ? url : null;

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
  constructor(
    private prisma: PrismaService,
    private pdf: ReportPdfService,
  ) {}

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

  /**
   * Render a record's report as a PDF buffer. THE GATE (re-checked here at
   * render time): the record's current result sheet must be authorized — a
   * de-authorized sheet immediately stops producing a report, so a stale PDF
   * can never outlive its authorization. Generation is on-demand/stateless;
   * nothing is persisted. The query is rooted at ResultSheet, so the tenancy
   * extension scopes everything to the current lab automatically.
   */
  async renderForRecord(recordId: string): Promise<{ buffer: Buffer; record: { identifier: string } }> {
    const sheet = await this.prisma.resultSheet.findFirst({
      where: { recordId },
      orderBy: { createdAt: 'desc' },
      select: {
        authorized: true,
        authorizedAt: true,
        authorizedBy: { select: { firstName: true, lastName: true, signatureUrl: true } },
        resultEntries: {
          select: {
            specimen: { select: { label: true, type: true } },
            resultLines: {
              select: { abbreviation: true, result: true, findings: true, abnormalFinding: true },
            },
          },
        },
        reports: {
          orderBy: { releasedAt: 'desc' },
          take: 1,
          select: { content: true, medicalEntry: true },
        },
        record: {
          select: {
            identifier: true,
            labNumber: true,
            clinicalDiagnosis: true,
            lab: { select: { name: true, address: true, phone: true, email: true, logoUrl: true } },
            patient: {
              select: {
                firstName: true,
                lastName: true,
                middleName: true,
                registrationNo: true,
                gender: true,
                bloodGroup: true,
                phoneNumber: true,
                dateOfBirth: true,
              },
            },
            client: { select: { firstName: true, lastName: true, officeName: true } },
            specimens: {
              select: { type: true, label: true, bloodGroup: true, dateReceived: true },
            },
          },
        },
      },
    });

    if (!sheet) throw new NotFoundException('No result sheet exists for this record');
    if (!sheet.authorized) {
      throw new ForbiddenException('Result sheet must be authorized before its report can be rendered');
    }

    const r = sheet.record;
    const authorizerName = sheet.authorizedBy
      ? `${sheet.authorizedBy.firstName} ${sheet.authorizedBy.lastName}`.trim()
      : 'Authorizer';
    const narrative = sheet.reports[0] ?? null;

    const data: ReportDocumentData = {
      lab: {
        name: r.lab.name,
        address: r.lab.address,
        phone: r.lab.phone,
        email: r.lab.email,
        logoDataUri: asDataUri(r.lab.logoUrl),
      },
      record: {
        identifier: r.identifier,
        labNumber: r.labNumber,
        clinicalDiagnosis: r.clinicalDiagnosis,
      },
      patient: {
        firstName: r.patient.firstName,
        lastName: r.patient.lastName,
        middleName: r.patient.middleName,
        registrationNo: r.patient.registrationNo,
        age: deriveAge(r.patient.dateOfBirth),
        gender: r.patient.gender ?? null,
        bloodGroup: r.patient.bloodGroup,
        phoneNumber: r.patient.phoneNumber,
        dateOfBirth: r.patient.dateOfBirth,
      },
      client: r.client,
      specimens: r.specimens,
      entries: sheet.resultEntries.map((e) => ({
        specimenLabel: e.specimen?.label ?? e.specimen?.type ?? null,
        lines: e.resultLines,
      })),
      narrative: narrative ? { content: narrative.content, medicalEntry: narrative.medicalEntry } : null,
      authorizer: {
        name: authorizerName,
        signedAt: sheet.authorizedAt ?? new Date(),
        signatureDataUri: asDataUri(sheet.authorizedBy?.signatureUrl),
      },
    };

    const buffer = await this.pdf.render(data);
    return { buffer, record: { identifier: r.identifier } };
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
