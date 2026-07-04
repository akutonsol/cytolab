import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma, RecordStatus, TATAlertStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { TAT_PRIORITY_RANK, hoursElapsed, tatPriority } from '../../common/util/tat-priority';
import { ResultSheetsService } from '../result-sheets/result-sheets.service';
import { BatchAuthorizeDto, BatchPreviewQueryDto } from './dto/batch.dto';

const MAX_BATCH = 50;
// Eligible pre-authorization statuses (per spec: Resulted or Processing).
const ELIGIBLE_STATUS: RecordStatus[] = [RecordStatus.Resulted, RecordStatus.Processing];
const OPEN_ESCALATION: string[] = ['Pending', 'Acknowledged', 'UnderReview'];

export interface SkippedRecord { recordId: string; labNo: string; reason: string }

@Injectable()
export class BatchService {
  private readonly log = new Logger(BatchService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly labContext: LabContext,
    private readonly resultSheets: ResultSheetsService,
  ) {}

  private async thresholdHours(): Promise<number> {
    const labId = this.labContext.getLabId();
    const lab = labId ? await this.prisma.lab.findFirst({ where: { id: labId }, select: { targetTatDays: true } }) : null;
    return (lab?.targetTatDays ?? 3) * 24;
  }

  /** The first unauthorized sheet on a record that has non-empty narrative. */
  private eligibleSheet(sheets: { id: string; authorized: boolean; narrative: string | null }[]) {
    return sheets.find((s) => !s.authorized && !!s.narrative && s.narrative.trim().length > 0) ?? null;
  }

  // ── Preview eligible cases ────────────────────────────────────────────
  async preview(q: BatchPreviewQueryDto) {
    const types = q.specimenType ? q.specimenType.split(',').map((t) => t.trim()).filter(Boolean) : [];
    const where: Prisma.RecordWhereInput = {
      status: { in: ELIGIBLE_STATUS },
      resultSheets: { some: { authorized: false } },
      ...(q.formType && { formType: q.formType }),
      ...(q.clientId && { clientId: q.clientId }),
      ...(q.assignedToId && { assignedToId: q.assignedToId }),
      ...(types.length && { specimens: { some: { type: { in: types as any } } } }),
      ...((q.dateFrom || q.dateTo) && {
        specimenDate: { ...(q.dateFrom && { gte: new Date(q.dateFrom) }), ...(q.dateTo && { lte: new Date(q.dateTo) }) },
      }),
    };

    const [rows, threshold] = await Promise.all([
      this.prisma.record.findMany({
        where,
        select: {
          id: true, labNumber: true, identifier: true, formType: true, status: true, urgent: true,
          specimenDate: true, createdAt: true,
          patient: { select: { firstName: true, lastName: true } },
          specimens: { select: { type: true }, take: 1 },
          assignedTo: { select: { firstName: true, lastName: true } },
          resultSheets: { select: { id: true, authorized: true, narrative: true } },
        },
        orderBy: { specimenDate: 'asc' },
        take: 300,
      }),
      this.thresholdHours(),
    ]);

    // Keep only records with an eligible (unauthorized, non-empty narrative) sheet.
    const eligible = rows.filter((r) => this.eligibleSheet(r.resultSheets));
    const ids = eligible.map((r) => r.id);
    const escalations = ids.length
      ? await this.prisma.escalationRecord.findMany({ where: { recordId: { in: ids }, status: { in: OPEN_ESCALATION as any } }, select: { recordId: true } })
      : [];
    const escalated = new Set(escalations.map((e) => e.recordId));
    const now = Date.now();

    const cases = eligible.map((r) => {
      const sheet = this.eligibleSheet(r.resultSheets)!;
      const startedAt = r.specimenDate ?? r.createdAt;
      return {
        id: r.id,
        labNo: r.labNumber ?? r.identifier,
        patientName: r.patient ? `${r.patient.firstName} ${r.patient.lastName}`.trim() : '—',
        formType: r.formType,
        specimenType: r.specimens[0]?.type ?? null,
        narrativePreview: (sheet.narrative ?? '').trim().slice(0, 100),
        narrative: (sheet.narrative ?? '').trim(),
        assignedTo: r.assignedTo ? `${r.assignedTo.firstName} ${r.assignedTo.lastName}`.trim() : null,
        tatPriority: tatPriority({ urgent: r.urgent, startedAt, thresholdHours: threshold, now }),
        hasEscalation: escalated.has(r.id),
      };
    });

    cases.sort((a, b) => TAT_PRIORITY_RANK[b.tatPriority] - TAT_PRIORITY_RANK[a.tatPriority]);
    const gyn = cases.filter((c) => c.formType === 'Gynecology').length;
    return { total: cases.length, gyn, nonGyn: cases.length - gyn, cases };
  }

  // ── Batch authorize ───────────────────────────────────────────────────
  async authorize(dto: BatchAuthorizeDto, userId: string) {
    const ids = [...new Set(dto.recordIds ?? [])];
    if (ids.length === 0) throw new BadRequestException('No records provided');
    if (ids.length > MAX_BATCH) throw new BadRequestException(`A batch may contain at most ${MAX_BATCH} records`);

    // Tenancy auto-scopes: records from another lab simply won't be found here.
    const records = await this.prisma.record.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, labNumber: true, identifier: true, status: true,
        resultSheets: { select: { id: true, authorized: true, narrative: true } },
      },
    });
    const byId = new Map(records.map((r) => [r.id, r]));

    const validationSkips: SkippedRecord[] = [];
    const errorRecords: SkippedRecord[] = [];
    let authorized = 0;
    const note = dto.batchNote?.trim();

    for (const recordId of ids) {
      const rec = byId.get(recordId);
      if (!rec) { validationSkips.push({ recordId, labNo: recordId.slice(0, 8), reason: 'Record not found in this lab' }); continue; }
      const labNo = rec.labNumber ?? rec.identifier;
      if (!ELIGIBLE_STATUS.includes(rec.status)) { validationSkips.push({ recordId, labNo, reason: `Status is ${rec.status} (not Resulted/Processing)` }); continue; }
      const sheet = this.eligibleSheet(rec.resultSheets);
      if (!sheet) {
        const hasSheet = rec.resultSheets.length > 0;
        validationSkips.push({ recordId, labNo, reason: hasSheet ? 'Result sheet already authorized or has no narrative' : 'No result sheet' });
        continue;
      }

      try {
        if (note) {
          await this.prisma.resultSheet.update({ where: { id: sheet.id }, data: { narrative: `${sheet.narrative}\n\n${note}` } });
        }
        // Reuse the single-record gate: sets authorized + event, advances the
        // record Resulted→Approved, and runs EscalationService.evaluateRecord.
        await this.resultSheets.authorize(sheet.id, userId);
        // Resolve any open TAT alerts for the record.
        await this.prisma.tATAlert.updateMany({
          where: { recordId, status: { not: TATAlertStatus.Resolved } },
          data: { status: TATAlertStatus.Resolved, resolvedAt: new Date() },
        });
        authorized++;
      } catch (e) {
        this.log.warn(`batch authorize ${recordId} failed: ${(e as Error).message}`);
        errorRecords.push({ recordId, labNo, reason: (e as Error).message });
      }
    }

    return {
      authorized,
      skipped: validationSkips.length,
      skippedRecords: [...validationSkips, ...errorRecords],
      errors: errorRecords.length,
    };
  }
}
