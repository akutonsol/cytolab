import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { deriveShortCode } from '../bethesda/bethesda.service';
import { ReviewScreeningDto } from './dto/ai-screening.dto';
import { ABNORMAL_CODES, confidenceLevelFor, FINDING_TEXT, rnd } from './ai-screening.util';

const resultSelect = {
  id: true, recordId: true, status: true, confidence: true, confidenceLevel: true,
  findings: true, primaryFinding: true, flaggedAreas: true, agreedWithAI: true, pathologistNote: true,
  processedAt: true, reviewedAt: true, reviewedById: true, createdAt: true,
  reviewedBy: { select: { firstName: true, lastName: true } },
  record: {
    select: {
      id: true, labNumber: true, identifier: true, formType: true,
      patient: { select: { firstName: true, lastName: true } },
    },
  },
} satisfies Prisma.AIScreeningResultSelect;

type Row = Prisma.AIScreeningResultGetPayload<{ select: typeof resultSelect }>;

const SIMULATE_MS = 2000;

@Injectable()
export class AIScreeningService {
  private readonly log = new Logger(AIScreeningService.name);
  constructor(private prisma: PrismaService, private labContext: LabContext) {}

  private toRow(r: Row) {
    return {
      ...r,
      patientName: r.record?.patient ? `${r.record.patient.firstName} ${r.record.patient.lastName}`.trim() : '—',
      labNo: r.record ? (r.record.labNumber ?? r.record.identifier) : '—',
      specimenType: r.record?.formType ?? null,
      reviewerName: r.reviewedBy ? `${r.reviewedBy.firstName} ${r.reviewedBy.lastName}`.trim() : null,
    };
  }

  async getByRecord(recordId: string) {
    const r = await this.prisma.aIScreeningResult.findFirst({ where: { recordId }, select: resultSelect });
    return r ? this.toRow(r) : null;
  }

  /** Create or re-run screening for a record: set Processing now, complete after a short delay. */
  async triggerScreening(recordId: string) {
    const record = await this.prisma.record.findFirst({ where: { id: recordId }, select: { id: true } });
    if (!record) throw new NotFoundException('Record not found');

    const existing = await this.prisma.aIScreeningResult.findFirst({ where: { recordId }, select: { id: true } });
    const processing = existing
      ? await this.prisma.aIScreeningResult.update({
          where: { id: existing.id },
          data: { status: 'Processing', confidence: null, confidenceLevel: null, findings: Prisma.DbNull, primaryFinding: null, flaggedAreas: 0, agreedWithAI: null, reviewedAt: null, reviewedById: null, processedAt: null },
          select: resultSelect,
        })
      : await this.prisma.aIScreeningResult.create({
          data: tenantCreate<Prisma.AIScreeningResultUncheckedCreateInput>({ recordId, status: 'Processing' }),
          select: resultSelect,
        });

    // Simulate async AI processing. Re-open a lab-scoped context inside the timer
    // (the request's AsyncLocalStorage scope is gone by the time this fires).
    const labId = this.labContext.getLabId();
    if (labId) {
      setTimeout(() => {
        this.labContext.runLabScoped(labId, () => this.completeScreening(recordId))
          .catch((e) => this.log.warn(`completeScreening(${recordId}) failed: ${(e as Error).message}`));
      }, SIMULATE_MS);
    }

    return this.toRow(processing);
  }

  /** Generate mock findings from the record's real data and mark the result Completed. */
  private async completeScreening(recordId: string) {
    const record = await this.prisma.record.findFirst({
      where: { id: recordId },
      select: { id: true, formType: true, bethesdaResult: { select: { specimenAdequacy: true, generalCategory: true, squamousCategory: true, ascSubtype: true, glandularCategory: true } } },
    });
    if (!record) return;

    const code = record.bethesdaResult ? (deriveShortCode(record.bethesdaResult as any) ?? 'NILM') : null;
    const abnormal = code ? ABNORMAL_CODES.has(code) : false;
    const confidence = abnormal ? rnd(62, 93) : rnd(78, 97);
    const primaryFinding = code
      ? (FINDING_TEXT[code] ?? code)
      : `${record.formType === 'Gynecology' ? 'Gynecologic' : 'Non-gynecologic'} cytology — no specific abnormality`;
    const flaggedAreas = code === 'UNSAT' ? 0 : abnormal ? rnd(2, 6) : rnd(0, 1);
    const findings = Array.from({ length: Math.max(flaggedAreas, abnormal ? 1 : 0) }, (_, i) => ({
      region: `Field ${i + 1}`, finding: primaryFinding, confidence: rnd(Math.max(50, confidence - 15), Math.min(99, confidence + 5)),
    }));

    await this.prisma.aIScreeningResult.update({
      where: { recordId },
      data: { status: 'Completed', confidence, confidenceLevel: confidenceLevelFor(confidence), findings, primaryFinding, flaggedAreas, processedAt: new Date() },
    });
  }

  async review(id: string, dto: ReviewScreeningDto, userId: string) {
    const r = await this.prisma.aIScreeningResult.findFirst({ where: { id }, select: { id: true } });
    if (!r) throw new NotFoundException('Screening result not found');
    return this.prisma.aIScreeningResult
      .update({ where: { id }, data: { agreedWithAI: dto.agreedWithAI, pathologistNote: dto.pathologistNote || null, reviewedAt: new Date(), reviewedById: userId }, select: resultSelect })
      .then((row) => this.toRow(row));
  }

  /** Completed results not yet reviewed — lowest confidence first (most need a human). */
  async queue() {
    const rows = await this.prisma.aIScreeningResult.findMany({
      where: { status: 'Completed', reviewedAt: null },
      select: resultSelect,
      orderBy: [{ confidence: 'asc' }],
      take: 200,
    });
    return rows.map((r) => this.toRow(r));
  }

  async analytics() {
    const completed = await this.prisma.aIScreeningResult.findMany({
      where: { status: 'Completed' },
      select: { confidence: true, confidenceLevel: true, agreedWithAI: true, reviewedAt: true, processedAt: true, createdAt: true, record: { select: { formType: true } } },
    });
    const totalScreened = completed.length;
    const pendingReview = completed.filter((r) => !r.reviewedAt).length;
    const highConfidence = completed.filter((r) => r.confidenceLevel === 'High').length;
    const mediumConfidence = completed.filter((r) => r.confidenceLevel === 'Medium').length;
    const lowConfidence = completed.filter((r) => r.confidenceLevel === 'Low').length;
    const reviewed = completed.filter((r) => r.agreedWithAI !== null);
    const agreementRate = reviewed.length ? Math.round((reviewed.filter((r) => r.agreedWithAI).length / reviewed.length) * 1000) / 10 : 0;
    const withConf = completed.filter((r) => r.confidence != null);
    const avgConfidence = withConf.length ? Math.round((withConf.reduce((s, r) => s + (r.confidence ?? 0), 0) / withConf.length) * 10) / 10 : 0;

    // By specimen type.
    const byType = new Map<string, { count: number; sum: number }>();
    for (const r of completed) {
      const t = r.record?.formType ?? 'Unknown';
      const e = byType.get(t) ?? { count: 0, sum: 0 };
      e.count++; e.sum += r.confidence ?? 0;
      byType.set(t, e);
    }
    const bySpecimenType = [...byType.entries()].map(([type, e]) => ({ type, count: e.count, avgConfidence: Math.round((e.sum / e.count) * 10) / 10 }));

    // Trend over the last 6 months.
    const now = new Date();
    const trendByMonth: { month: string; count: number; avgConfidence: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const inMonth = completed.filter((r) => { const t = new Date(r.processedAt ?? r.createdAt); return t >= d && t < next; });
      const conf = inMonth.filter((r) => r.confidence != null);
      trendByMonth.push({
        month: d.toLocaleDateString(undefined, { month: 'short' }),
        count: inMonth.length,
        avgConfidence: conf.length ? Math.round((conf.reduce((s, r) => s + (r.confidence ?? 0), 0) / conf.length) * 10) / 10 : 0,
      });
    }

    return { totalScreened, pendingReview, highConfidence, mediumConfidence, lowConfidence, agreementRate, avgConfidence, bySpecimenType, trendByMonth };
  }
}
