import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RecordStatus, ResultSheetEventType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { RecordsService } from '../records/records.service';
import {
  CreateResultEntryDto,
  CreateResultSheetDto,
  ResultSheetQueryDto,
  UpdateResultSheetDto,
} from './dto/result-sheet.dto';

const resultSheetSelect = {
  id: true,
  recordId: true,
  viewed: true,
  authorized: true,
  authorizedAt: true,
  authorizedById: true,
  authorizedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
  resultEntries: {
    select: {
      id: true,
      specimenId: true,
      resultLines: {
        select: { id: true, abbreviation: true, result: true, findings: true, abnormalFinding: true },
      },
    },
  },
  events: {
    select: {
      id: true,
      type: true,
      userId: true,
      user: { select: { id: true, email: true, firstName: true, lastName: true } },
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' as const },
  },
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class ResultSheetsService {
  constructor(
    private prisma: PrismaService,
    private records: RecordsService,
  ) {}

  // Build the nested entries/lines create payload. The tenancy guard stamps
  // labId on every nested tenant row at write time.
  private entriesCreate(entries?: CreateResultEntryDto[]) {
    if (!entries?.length) return undefined;
    return {
      create: entries.map((e) =>
        tenantCreate<Prisma.ResultEntryUncheckedCreateWithoutResultSheetInput>({
          specimenId: e.specimenId,
          resultLines: e.lines?.length
            ? {
                create: e.lines.map((l) =>
                  tenantCreate<Prisma.ResultLineUncheckedCreateWithoutResultEntryInput>({
                    abbreviation: l.abbreviation,
                    result: l.result,
                    findings: l.findings,
                    abnormalFinding: l.abnormalFinding ?? false,
                  }),
                ),
              }
            : undefined,
        }),
      ),
    };
  }

  async create(dto: CreateResultSheetDto, userId: string) {
    // Confirm the record exists in this lab (auto lab-scoped).
    const record = await this.prisma.record.findFirst({
      where: { id: dto.recordId },
      select: { id: true, status: true },
    });
    if (!record) throw new NotFoundException('Record not found');
    // A result sheet can only be added to a Completed record — you can't have
    // results for an unprocessed sample.
    if (record.status !== RecordStatus.Completed) {
      throw new BadRequestException('A result sheet can only be added to a Completed record');
    }

    const sheet = await this.prisma.resultSheet.create({
      data: tenantCreate<Prisma.ResultSheetUncheckedCreateInput>({
        recordId: dto.recordId,
        resultEntries: this.entriesCreate(dto.entries),
      }),
      select: resultSheetSelect,
    });

    // The record now has a result sheet: Completed -> Resulted (validated + audited).
    await this.records.updateStatus(record.id, userId, {
      status: RecordStatus.Resulted,
      notes: 'Result sheet added',
    });
    return sheet;
  }

  async findAll(query: ResultSheetQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const where: Prisma.ResultSheetWhereInput = {};
    if (query.recordId) where.recordId = query.recordId;

    const [data, total] = await Promise.all([
      this.prisma.resultSheet.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          recordId: true,
          record: { select: { identifier: true } },
          authorized: true,
          authorizedAt: true,
          viewed: true,
          createdAt: true,
          _count: { select: { resultEntries: true, reports: true } },
        },
      }),
      this.prisma.resultSheet.count({ where }),
    ]);
    return paginate(data, total, page, pageSize);
  }

  async findOne(id: string) {
    const sheet = await this.prisma.resultSheet.findFirst({ where: { id }, select: resultSheetSelect });
    if (!sheet) throw new NotFoundException('Result sheet not found');
    return sheet;
  }

  /**
   * Replace entries/lines and/or update flags. Any change to the result content
   * re-opens the sheet (de-authorizes it): a previously authorized sheet must be
   * re-authorized before a new report can be released. Already-released reports
   * remain as immutable snapshots.
   */
  async update(id: string, userId: string, dto: UpdateResultSheetDto) {
    const existing = await this.findOne(id);

    const data: Prisma.ResultSheetUncheckedUpdateInput = {};
    if (dto.viewed !== undefined) data.viewed = dto.viewed;
    if (dto.entries !== undefined) {
      // Editing results invalidates any prior authorization.
      data.authorized = false;
      data.authorizedAt = null;
      data.authorizedById = null;
      data.resultEntries = { deleteMany: {}, ...this.entriesCreate(dto.entries) };
      // Audit the de-authorization only when it actually transitions away from authorized.
      if (existing.authorized) {
        data.events = {
          create: tenantCreate<Prisma.ResultSheetEventUncheckedCreateWithoutResultSheetInput>({
            type: ResultSheetEventType.Deauthorized,
            userId,
          }),
        };
      }
    }

    return this.prisma.resultSheet.update({ where: { id }, data, select: resultSheetSelect });
  }

  /**
   * Authorization gate. Sets authorized + records who/when. The controller
   * restricts this to holders of resultsheet:authorize (the Authorizer role).
   */
  async authorize(id: string, userId: string) {
    const sheet = await this.findOne(id);
    if (sheet.authorized) throw new BadRequestException('Result sheet is already authorized');

    // First authorization vs re-authorization after a prior de-authorization.
    const priorAuthorizations = await this.prisma.resultSheetEvent.count({
      where: {
        resultSheetId: id,
        type: { in: [ResultSheetEventType.Authorized, ResultSheetEventType.Reauthorized] },
      },
    });
    const type = priorAuthorizations > 0 ? ResultSheetEventType.Reauthorized : ResultSheetEventType.Authorized;

    const authorized = await this.prisma.resultSheet.update({
      where: { id },
      data: {
        authorized: true,
        authorizedAt: new Date(),
        authorizedById: userId,
        events: {
          create: tenantCreate<Prisma.ResultSheetEventUncheckedCreateWithoutResultSheetInput>({
            type,
            userId,
          }),
        },
      },
      select: resultSheetSelect,
    });

    // Authorizing the sheet advances the record Resulted -> Approved (only from
    // Resulted, so a re-authorization on an already-advanced record is a no-op).
    const rec = await this.prisma.record.findFirst({
      where: { id: sheet.recordId },
      select: { status: true },
    });
    if (rec?.status === RecordStatus.Resulted) {
      await this.records.updateStatus(sheet.recordId, userId, {
        status: RecordStatus.Approved,
        notes: 'Result sheet authorized',
      });
    }
    return authorized;
  }
}
