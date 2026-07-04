import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma, ProfTestStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { NotificationsHelper } from '../notifications/notifications.helper';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import {
  CreateCaseDto, CreateTestDto, RespondDto, TestQueryDto, UpdateCaseDto, UpdateTestDto,
} from './dto/proficiency.dto';

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const quarterOf = (d: Date) => `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;

@Injectable()
export class ProficiencyService {
  constructor(private prisma: PrismaService, private notifs: NotificationsHelper) {}

  private canSeeExpected(test: { createdById: string | null; status: ProfTestStatus }, user: AuthUser): boolean {
    return user.isSuperRole === true || test.createdById === user.userId || test.status === 'Completed';
  }

  // ── Tests ─────────────────────────────────────────────────────────────
  async list(query: TestQueryDto) {
    const tests = await this.prisma.proficiencyTest.findMany({
      where: { ...(query.status && { status: query.status }), ...(query.testType && { testType: query.testType }) },
      select: {
        id: true, name: true, description: true, testType: true, status: true, startDate: true, endDate: true,
        passingScore: true, createdAt: true,
        createdBy: { select: { firstName: true, lastName: true } },
        _count: { select: { cases: true } },
        responses: { select: { responderId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return tests.map((t) => {
      const responders = new Set(t.responses.map((r) => r.responderId));
      const { responses, _count, ...rest } = t;
      return { ...rest, caseCount: _count.cases, responderCount: responders.size };
    });
  }

  create(dto: CreateTestDto, userId: string) {
    return this.prisma.proficiencyTest.create({
      data: tenantCreate<Prisma.ProficiencyTestUncheckedCreateInput>({
        name: dto.name.trim(),
        description: dto.description ?? null,
        testType: dto.testType ?? 'Internal',
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        passingScore: dto.passingScore ?? 80,
        createdById: userId,
      }),
      select: { id: true },
    });
  }

  async detail(id: string, user: AuthUser) {
    const test = await this.prisma.proficiencyTest.findFirst({
      where: { id },
      select: {
        id: true, name: true, description: true, testType: true, status: true, startDate: true, endDate: true,
        passingScore: true, createdById: true, createdAt: true,
        createdBy: { select: { firstName: true, lastName: true } },
        cases: {
          orderBy: { caseNumber: 'asc' },
          select: {
            id: true, caseNumber: true, specimenType: true, clinicalHistory: true, imageUrl: true, difficulty: true,
            expectedDiagnosis: true, expectedBethesda: true, _count: { select: { responses: true } },
          },
        },
        responses: { select: { responderId: true, caseId: true, isCorrect: true, score: true, gradedAt: true, responder: { select: { firstName: true, lastName: true } } } },
      },
    });
    if (!test) throw new NotFoundException('Proficiency test not found');
    const canSee = this.canSeeExpected(test, user);

    const totalCases = test.cases.length;
    // Per-responder summary for the Responses tab.
    const byResponder = new Map<string, { name: string; done: number; correct: number; graded: boolean }>();
    for (const r of test.responses) {
      const key = r.responderId;
      const name = r.responder ? `${r.responder.firstName} ${r.responder.lastName}`.trim() : '—';
      const e = byResponder.get(key) ?? { name, done: 0, correct: 0, graded: false };
      e.done++;
      if (r.isCorrect) e.correct++;
      if (r.gradedAt) e.graded = true;
      byResponder.set(key, e);
    }
    const responseSummary = [...byResponder.entries()].map(([userId, v]) => ({
      userId, name: v.name, casesCompleted: v.done, correctCount: v.correct,
      percentage: v.graded && totalCases ? Math.round((v.correct / totalCases) * 1000) / 10 : null,
      graded: v.graded, passed: v.graded && totalCases ? (v.correct / totalCases) * 100 >= test.passingScore : null,
    }));

    const { responses, cases, ...rest } = test;
    return {
      ...rest,
      totalCases,
      responderCount: byResponder.size,
      cases: cases.map((c) => ({
        id: c.id, caseNumber: c.caseNumber, specimenType: c.specimenType, clinicalHistory: c.clinicalHistory,
        imageUrl: c.imageUrl, difficulty: c.difficulty, responseCount: c._count.responses,
        expectedDiagnosis: canSee ? c.expectedDiagnosis : '***',
        expectedBethesda: canSee ? c.expectedBethesda : c.expectedBethesda ? '***' : null,
      })),
      responseSummary,
      expectedVisible: canSee,
    };
  }

  async update(id: string, dto: UpdateTestDto) {
    await this.getTest(id);
    return this.prisma.proficiencyTest.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.description !== undefined && { description: dto.description || null }),
        ...(dto.startDate !== undefined && { startDate: new Date(dto.startDate) }),
        ...(dto.endDate !== undefined && { endDate: new Date(dto.endDate) }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.passingScore !== undefined && { passingScore: dto.passingScore }),
      },
      select: { id: true, status: true },
    });
  }

  async remove(id: string) {
    const test = await this.getTest(id);
    if (test.status !== 'Draft') throw new BadRequestException('Only draft tests can be deleted');
    await this.prisma.proficiencyTest.update({ where: { id }, data: { status: 'Archived' } });
    return { ok: true };
  }

  private async getTest(id: string) {
    const test = await this.prisma.proficiencyTest.findFirst({ where: { id }, select: { id: true, name: true, status: true, passingScore: true, createdById: true } });
    if (!test) throw new NotFoundException('Proficiency test not found');
    return test;
  }

  // ── Cases ─────────────────────────────────────────────────────────────
  async addCase(testId: string, dto: CreateCaseDto) {
    await this.getTest(testId);
    const last = await this.prisma.proficiencyCase.findFirst({ where: { testId }, orderBy: { caseNumber: 'desc' }, select: { caseNumber: true } });
    return this.prisma.proficiencyCase.create({
      data: tenantCreate<Prisma.ProficiencyCaseUncheckedCreateInput>({
        testId,
        caseNumber: (last?.caseNumber ?? 0) + 1,
        specimenType: dto.specimenType,
        clinicalHistory: dto.clinicalHistory ?? null,
        imageUrl: dto.imageUrl ?? null,
        expectedDiagnosis: dto.expectedDiagnosis,
        expectedBethesda: dto.expectedBethesda ?? null,
        difficulty: dto.difficulty ?? 'Standard',
      }),
      select: { id: true, caseNumber: true },
    });
  }

  async updateCase(caseId: string, dto: UpdateCaseDto) {
    const c = await this.prisma.proficiencyCase.findFirst({ where: { id: caseId }, select: { id: true } });
    if (!c) throw new NotFoundException('Case not found');
    return this.prisma.proficiencyCase.update({
      where: { id: caseId },
      data: {
        ...(dto.specimenType !== undefined && { specimenType: dto.specimenType }),
        ...(dto.clinicalHistory !== undefined && { clinicalHistory: dto.clinicalHistory || null }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl || null }),
        ...(dto.expectedDiagnosis !== undefined && { expectedDiagnosis: dto.expectedDiagnosis }),
        ...(dto.expectedBethesda !== undefined && { expectedBethesda: dto.expectedBethesda || null }),
        ...(dto.difficulty !== undefined && { difficulty: dto.difficulty }),
      },
      select: { id: true },
    });
  }

  async removeCase(caseId: string) {
    const c = await this.prisma.proficiencyCase.findFirst({ where: { id: caseId }, select: { id: true } });
    if (!c) throw new NotFoundException('Case not found');
    await this.prisma.proficiencyCase.delete({ where: { id: caseId } });
    return { ok: true };
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────
  async activate(id: string) {
    const test = await this.getTest(id);
    if (test.status !== 'Draft') throw new BadRequestException('Only draft tests can be activated');
    const cases = await this.prisma.proficiencyCase.count({ where: { testId: id } });
    if (cases === 0) throw new BadRequestException('Add at least one case before activating');
    await this.prisma.proficiencyTest.update({ where: { id }, data: { status: 'Active' } });
    await this.notifs.notifyPermission('resultsheet:authorize', {
      type: NotificationType.SYSTEM_ALERT,
      title: 'Proficiency test available',
      body: `New proficiency test available: ${test.name}. Please complete your blind review.`,
      link: `/proficiency/${id}/respond`,
      entityId: id,
      entityType: 'proficiencytest',
    });
    return { id, status: 'Active' };
  }

  async close(id: string) {
    const test = await this.getTest(id);
    if (test.status !== 'Active') throw new BadRequestException('Only active tests can be closed');
    await this.prisma.proficiencyTest.update({ where: { id }, data: { status: 'Grading' } });
    return { id, status: 'Grading' };
  }

  async grade(id: string, userId: string) {
    const test = await this.getTest(id);
    if (test.status !== 'Grading' && test.status !== 'Active') throw new BadRequestException('Close the test before grading');

    const [cases, responses] = await Promise.all([
      this.prisma.proficiencyCase.findMany({ where: { testId: id }, select: { id: true, expectedDiagnosis: true } }),
      this.prisma.proficiencyResponse.findMany({ where: { testId: id }, select: { id: true, caseId: true, responderId: true, diagnosis: true } }),
    ]);
    const expectedByCase = new Map(cases.map((c) => [c.id, norm(c.expectedDiagnosis)]));
    const totalCases = cases.length;

    const now = new Date();
    for (const r of responses) {
      const correct = expectedByCase.get(r.caseId) === norm(r.diagnosis);
      await this.prisma.proficiencyResponse.update({
        where: { id: r.id },
        data: { isCorrect: correct, score: correct ? 100 : 0, gradedAt: now, gradedById: userId },
      });
    }
    await this.prisma.proficiencyTest.update({ where: { id }, data: { status: 'Completed' } });

    // Notify each responder of their score.
    const byResponder = new Map<string, number>();
    for (const r of responses) {
      const correct = expectedByCase.get(r.caseId) === norm(r.diagnosis) ? 1 : 0;
      byResponder.set(r.responderId, (byResponder.get(r.responderId) ?? 0) + correct);
    }
    for (const [responderId, correct] of byResponder) {
      const pct = totalCases ? Math.round((correct / totalCases) * 1000) / 10 : 0;
      const passed = totalCases ? (correct / totalCases) * 100 >= test.passingScore : false;
      await this.notifs.notifyUser(responderId, {
        type: NotificationType.SYSTEM_ALERT,
        title: 'Proficiency test graded',
        body: `Your score for "${test.name}": ${pct}% — ${passed ? 'Pass' : 'Fail'}.`,
        link: `/proficiency/${id}`,
        entityId: id,
        entityType: 'proficiencytest',
      });
    }
    return { id, status: 'Completed', graded: responses.length };
  }

  // ── Responses (pathologist) ───────────────────────────────────────────
  async myResponse(id: string, userId: string) {
    const test = await this.prisma.proficiencyTest.findFirst({
      where: { id },
      select: {
        id: true, name: true, status: true, passingScore: true,
        cases: { orderBy: { caseNumber: 'asc' }, select: { id: true, caseNumber: true, specimenType: true, clinicalHistory: true, imageUrl: true, difficulty: true } },
      },
    });
    if (!test) throw new NotFoundException('Proficiency test not found');
    const responses = await this.prisma.proficiencyResponse.findMany({
      where: { testId: id, responderId: userId },
      select: { caseId: true, diagnosis: true, bethesdaAnswer: true, confidence: true, notes: true },
    });
    return { test: { id: test.id, name: test.name, status: test.status, passingScore: test.passingScore }, cases: test.cases, responses };
  }

  async respond(id: string, userId: string, dto: RespondDto) {
    const test = await this.getTest(id);
    if (test.status !== 'Active') throw new BadRequestException('This test is not accepting responses');
    const c = await this.prisma.proficiencyCase.findFirst({ where: { id: dto.caseId, testId: id }, select: { id: true } });
    if (!c) throw new NotFoundException('Case not found in this test');

    const existing = await this.prisma.proficiencyResponse.findFirst({ where: { caseId: dto.caseId, responderId: userId }, select: { id: true } });
    const payload = {
      diagnosis: dto.diagnosis, bethesdaAnswer: dto.bethesdaAnswer ?? null,
      confidence: dto.confidence ?? 'Moderate', notes: dto.notes ?? null,
    };
    if (existing) {
      await this.prisma.proficiencyResponse.update({ where: { id: existing.id }, data: payload });
    } else {
      await this.prisma.proficiencyResponse.create({
        data: tenantCreate<Prisma.ProficiencyResponseUncheckedCreateInput>({ testId: id, caseId: dto.caseId, responderId: userId, ...payload }),
      });
    }
    return { ok: true };
  }

  // ── Results (Completed only) ──────────────────────────────────────────
  async results(id: string) {
    const test = await this.prisma.proficiencyTest.findFirst({
      where: { id },
      select: {
        id: true, name: true, status: true, passingScore: true,
        cases: { orderBy: { caseNumber: 'asc' }, select: { id: true, caseNumber: true, specimenType: true, expectedDiagnosis: true } },
      },
    });
    if (!test) throw new NotFoundException('Proficiency test not found');
    if (test.status !== 'Completed') throw new BadRequestException('Results are available only after grading');

    const responses = await this.prisma.proficiencyResponse.findMany({
      where: { testId: id },
      select: { caseId: true, responderId: true, diagnosis: true, isCorrect: true, responder: { select: { firstName: true, lastName: true } } },
    });
    const totalCases = test.cases.length;

    const cases = test.cases.map((c) => ({
      caseId: c.id, caseNumber: c.caseNumber, specimenType: c.specimenType, expected: c.expectedDiagnosis,
      responses: responses.filter((r) => r.caseId === c.id).map((r) => ({
        responder: r.responder ? `${r.responder.firstName} ${r.responder.lastName}`.trim() : '—',
        answer: r.diagnosis, isCorrect: r.isCorrect,
      })),
    }));

    const byResponder = new Map<string, { name: string; correct: number; total: number }>();
    for (const r of responses) {
      const name = r.responder ? `${r.responder.firstName} ${r.responder.lastName}`.trim() : '—';
      const e = byResponder.get(r.responderId) ?? { name, correct: 0, total: 0 };
      e.total++;
      if (r.isCorrect) e.correct++;
      byResponder.set(r.responderId, e);
    }
    const scores = [...byResponder.entries()].map(([userId, v]) => {
      const percentage = totalCases ? Math.round((v.correct / totalCases) * 1000) / 10 : 0;
      return { userId, name: v.name, correct: v.correct, total: totalCases, percentage, passed: percentage >= test.passingScore };
    }).sort((a, b) => b.percentage - a.percentage);

    const labAverage = scores.length ? Math.round((scores.reduce((a, s) => a + s.percentage, 0) / scores.length) * 10) / 10 : 0;
    const passRate = scores.length ? Math.round((scores.filter((s) => s.passed).length / scores.length) * 1000) / 10 : 0;
    return { testName: test.name, passingScore: test.passingScore, cases, scores, labAverage, passRate };
  }

  // ── Analytics ─────────────────────────────────────────────────────────
  async analytics() {
    const [totalTests, completedTests, gradedResponses] = await Promise.all([
      this.prisma.proficiencyTest.count({ where: { status: { not: 'Archived' } } }),
      this.prisma.proficiencyTest.count({ where: { status: 'Completed' } }),
      this.prisma.proficiencyResponse.findMany({
        where: { gradedAt: { not: null } },
        select: { testId: true, responderId: true, isCorrect: true, responder: { select: { firstName: true, lastName: true } }, test: { select: { passingScore: true, endDate: true } } },
      }),
    ]);

    // Per (responder, test) aggregate → passed if their % ≥ passingScore.
    const perUserTest = new Map<string, { name: string; correct: number; total: number; passing: number; endDate: Date }>();
    for (const r of gradedResponses) {
      const key = `${r.responderId}:${r.testId}`;
      const name = r.responder ? `${r.responder.firstName} ${r.responder.lastName}`.trim() : '—';
      const e = perUserTest.get(key) ?? { name, correct: 0, total: 0, passing: r.test.passingScore, endDate: r.test.endDate };
      e.total++;
      if (r.isCorrect) e.correct++;
      perUserTest.set(key, e);
    }

    const attempts = [...perUserTest.entries()].map(([key, v]) => ({
      userId: key.split(':')[0], name: v.name, pct: v.total ? (v.correct / v.total) * 100 : 0,
      passed: v.total ? (v.correct / v.total) * 100 >= v.passing : false, endDate: v.endDate,
    }));

    const labAverageScore = attempts.length ? Math.round((attempts.reduce((a, x) => a + x.pct, 0) / attempts.length) * 10) / 10 : 0;
    const passingRate = attempts.length ? Math.round((attempts.filter((x) => x.passed).length / attempts.length) * 1000) / 10 : 0;

    const byUser = new Map<string, { name: string; sum: number; n: number }>();
    for (const a of attempts) {
      const e = byUser.get(a.userId) ?? { name: a.name, sum: 0, n: 0 };
      e.sum += a.pct; e.n++;
      byUser.set(a.userId, e);
    }
    const byPathologist = [...byUser.values()].map((v) => ({ name: v.name, avgScore: Math.round((v.sum / v.n) * 10) / 10, testsCompleted: v.n })).sort((a, b) => b.avgScore - a.avgScore);

    const byQuarter = new Map<string, { sum: number; n: number }>();
    for (const a of attempts) {
      const q = quarterOf(new Date(a.endDate));
      const e = byQuarter.get(q) ?? { sum: 0, n: 0 };
      e.sum += a.pct; e.n++;
      byQuarter.set(q, e);
    }
    const trendByQuarter = [...byQuarter.entries()].map(([quarter, v]) => ({ quarter, avgScore: Math.round((v.sum / v.n) * 10) / 10 }))
      .sort((a, b) => a.quarter.localeCompare(b.quarter));

    return { totalTests, completedTests, labAverageScore, passingRate, byPathologist, trendByQuarter };
  }
}
