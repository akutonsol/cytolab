import { Injectable, NotFoundException } from '@nestjs/common';
import { CorrelationResult, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { CorrelationQueryDto, CreateCorrelationDto, ReviewCorrelationDto, UpdateCorrelationDto } from './dto/correlation.dto';

const RESOLVED: CorrelationResult[] = ['Concordant', 'MinorDiscordant', 'MajorDiscordant'];

const caseSelect = {
  id: true, patientId: true, cytologyRecordId: true, cytologyDate: true, cytologyDiagnosis: true, cytologyBethesdaId: true,
  histologyRecordId: true, histologyDate: true, histologyDiagnosis: true, histologySource: true, externalLabName: true,
  correlationResult: true, discordanceReason: true, reviewRequired: true, reviewedAt: true, reviewNotes: true,
  clinicalOutcome: true, followUpRequired: true, createdAt: true, updatedAt: true,
  patient: { select: { firstName: true, lastName: true, registrationNo: true } },
  cytologyRecord: { select: { labNumber: true, identifier: true, formType: true } },
  reviewedBy: { select: { firstName: true, lastName: true } },
  createdBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.CorrelationCaseSelect;

@Injectable()
export class CorrelationService {
  constructor(private prisma: PrismaService) {}

  private needsReview(result?: CorrelationResult | null): boolean {
    return result === 'MajorDiscordant';
  }

  // ── Create ────────────────────────────────────────────────────────────
  async create(dto: CreateCorrelationDto, userId: string) {
    const record = await this.prisma.record.findFirst({
      where: { id: dto.cytologyRecordId },
      select: { id: true, specimenDate: true, createdAt: true, bethesdaResult: { select: { id: true } } },
    });
    if (!record) throw new NotFoundException('Cytology record not found');

    const created = await this.prisma.correlationCase.create({
      data: tenantCreate<Prisma.CorrelationCaseUncheckedCreateInput>({
        patientId: dto.patientId,
        cytologyRecordId: dto.cytologyRecordId,
        cytologyDate: record.specimenDate ?? record.createdAt,
        cytologyDiagnosis: dto.cytologyDiagnosis,
        cytologyBethesdaId: record.bethesdaResult?.id ?? null,
        histologyRecordId: dto.histologyRecordId ?? null,
        histologyDate: dto.histologyDate ? new Date(dto.histologyDate) : null,
        histologyDiagnosis: dto.histologyDiagnosis ?? null,
        histologySource: dto.histologySource ?? 'Internal',
        externalLabName: dto.externalLabName ?? null,
        correlationResult: dto.correlationResult ?? (dto.histologyDiagnosis ? null : 'Unresolved'),
        discordanceReason: dto.discordanceReason ?? null,
        reviewRequired: this.needsReview(dto.correlationResult),
        clinicalOutcome: dto.clinicalOutcome ?? null,
        followUpRequired: dto.followUpRequired ?? false,
        createdById: userId,
      }),
      select: caseSelect,
    });
    return created;
  }

  // ── Queries ───────────────────────────────────────────────────────────
  async list(query: CorrelationQueryDto) {
    const where: Prisma.CorrelationCaseWhereInput = {
      ...(query.result && { correlationResult: query.result }),
      ...(query.reviewRequired !== undefined && { reviewRequired: query.reviewRequired }),
      ...(query.patientId && { patientId: query.patientId }),
      ...((query.dateFrom || query.dateTo) && {
        cytologyDate: { ...(query.dateFrom && { gte: new Date(query.dateFrom) }), ...(query.dateTo && { lte: new Date(query.dateTo) }) },
      }),
    };
    return this.prisma.correlationCase.findMany({ where, select: caseSelect, orderBy: { cytologyDate: 'desc' }, take: 500 });
  }

  async detail(id: string) {
    const c = await this.prisma.correlationCase.findFirst({ where: { id }, select: caseSelect });
    if (!c) throw new NotFoundException('Correlation case not found');
    return c;
  }

  byPatient(patientId: string) {
    return this.prisma.correlationCase.findMany({ where: { patientId }, select: caseSelect, orderBy: { cytologyDate: 'desc' } });
  }

  /** Correlation cases whose cytology side is this record — for composition by the
   *  Sign-Out aggregate. Owned here so correlation query logic is never duplicated. */
  byCytologyRecord(recordId: string) {
    return this.prisma.correlationCase.findMany({ where: { cytologyRecordId: recordId }, select: caseSelect, orderBy: { cytologyDate: 'desc' } });
  }

  // ── Update (add histology / set result) ───────────────────────────────
  async update(id: string, dto: UpdateCorrelationDto) {
    const existing = await this.prisma.correlationCase.findFirst({ where: { id }, select: { id: true, reviewedAt: true } });
    if (!existing) throw new NotFoundException('Correlation case not found');
    const data: Prisma.CorrelationCaseUpdateInput = {
      ...(dto.histologyRecordId !== undefined && { histologyRecordId: dto.histologyRecordId || null }),
      ...(dto.histologyDate !== undefined && { histologyDate: dto.histologyDate ? new Date(dto.histologyDate) : null }),
      ...(dto.histologyDiagnosis !== undefined && { histologyDiagnosis: dto.histologyDiagnosis || null }),
      ...(dto.histologySource !== undefined && { histologySource: dto.histologySource }),
      ...(dto.externalLabName !== undefined && { externalLabName: dto.externalLabName || null }),
      ...(dto.discordanceReason !== undefined && { discordanceReason: dto.discordanceReason || null }),
      ...(dto.clinicalOutcome !== undefined && { clinicalOutcome: dto.clinicalOutcome || null }),
      ...(dto.followUpRequired !== undefined && { followUpRequired: dto.followUpRequired }),
    };
    if (dto.correlationResult !== undefined) {
      data.correlationResult = dto.correlationResult;
      // Re-flag review for a fresh major discordance (unless already reviewed).
      if (!existing.reviewedAt) data.reviewRequired = this.needsReview(dto.correlationResult);
    }
    return this.prisma.correlationCase.update({ where: { id }, data, select: caseSelect });
  }

  async review(id: string, userId: string, dto: ReviewCorrelationDto) {
    const existing = await this.prisma.correlationCase.findFirst({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('Correlation case not found');
    return this.prisma.correlationCase.update({
      where: { id },
      data: { reviewedById: userId, reviewedAt: new Date(), reviewNotes: dto.reviewNotes ?? null, reviewRequired: false },
      select: caseSelect,
    });
  }

  // ── Analytics ─────────────────────────────────────────────────────────
  async analytics() {
    const rows = await this.prisma.correlationCase.findMany({
      select: { correlationResult: true, reviewRequired: true, reviewedAt: true, cytologyDate: true },
    });
    const count = (r: CorrelationResult) => rows.filter((x) => x.correlationResult === r).length;
    const concordant = count('Concordant');
    const minor = count('MinorDiscordant');
    const major = count('MajorDiscordant');
    const unresolved = rows.filter((x) => !x.correlationResult || x.correlationResult === 'Unresolved').length;
    const resolved = concordant + minor + major;
    const rate = (n: number) => (resolved > 0 ? Math.round((n / resolved) * 1000) / 10 : 0);

    // Last 6 months by cytologyDate.
    const now = new Date();
    const months: Record<string, { concordant: number; minorDiscordant: number; majorDiscordant: number }> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`] = { concordant: 0, minorDiscordant: 0, majorDiscordant: 0 };
    }
    for (const r of rows) {
      const d = new Date(r.cytologyDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!months[key]) continue;
      if (r.correlationResult === 'Concordant') months[key].concordant++;
      else if (r.correlationResult === 'MinorDiscordant') months[key].minorDiscordant++;
      else if (r.correlationResult === 'MajorDiscordant') months[key].majorDiscordant++;
    }

    return {
      total: rows.length,
      concordantCount: concordant,
      minorDiscordantCount: minor,
      majorDiscordantCount: major,
      unresolvedCount: unresolved,
      concordanceRate: rate(concordant),
      majorDiscordanceRate: rate(major),
      pendingReview: rows.filter((x) => x.reviewRequired && !x.reviewedAt).length,
      byMonth: Object.entries(months).map(([month, v]) => ({ month, ...v })),
    };
  }

  /**
   * Phase 5 · E1F1 — distinct, sorted cytology record ids whose cyto-histo correlation is
   * still AWAITING (not yet resolved): `correlationResult` is null (result not entered) or
   * `Unresolved` (histology not yet received) — i.e. not one of the owner's RESOLVED values
   * (Concordant / MinorDiscordant / MajorDiscordant). Anchored on `cytologyRecordId` only —
   * never patientId, never histologyRecordId, no inferred mapping. Record ids ONLY — no
   * diagnoses, discordance reason, notes, review state, external lab, dates, or patient data.
   * "Pending review" (reviewRequired && !reviewedAt) is a SEPARATE owner concept and is NOT
   * included here. Mutation-free (one grouped read); lab-scoped by the tenancy extension
   * (groupBy intercepted); no caller labId. This is "Awaiting Correlation" — not a diagnostic
   * conflict, owner error, incompleteness, or sign-out/release block.
   */
  async recordIdsAwaitingCorrelation(): Promise<string[]> {
    const rows = await this.prisma.correlationCase.groupBy({
      by: ['cytologyRecordId'],
      where: { OR: [{ correlationResult: null }, { correlationResult: CorrelationResult.Unresolved }] },
    });
    return rows.map((r) => r.cytologyRecordId).sort();
  }
}
