import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ClockEventType, PerformanceGoalStatus, PerformanceReviewStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { WorkforceNotificationService } from './workforce-notification.service';
import { CreateGoalDto, CreateReviewDto, GoalQuery, ReviewQuery, UpdateGoalDto, UpdateReviewDto } from './dto/workforce-phase3.dto';

const DAY = 86_400_000;
const round = (n: number) => Math.round(n);
const clamp100 = (n: number) => Math.max(0, Math.min(100, n));
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

// Score composition weights and productivity target.
const W_ATTENDANCE = 0.25, W_PRODUCTIVITY = 0.35, W_QUALITY = 0.25, W_REVIEW = 0.15;
const EXPECTED_WORK_DAYS_30 = 22; // ~ working days in a rolling month
const SPECIMENS_TARGET_PER_DAY = 20;

@Injectable()
export class PerformanceService {
  constructor(
    private prisma: PrismaService,
    private notifications: WorkforceNotificationService,
  ) {}

  // ── Reviews ─────────────────────────────────────────────────────────────────
  createReview(dto: CreateReviewDto, reviewerId: string) {
    return this.prisma.performanceReview.create({
      data: {
        employeeId: dto.employeeId, reviewerId, period: dto.period,
        overallScore: dto.overallScore ?? 0, attendanceScore: dto.attendanceScore ?? 0,
        productivityScore: dto.productivityScore ?? 0, qualityScore: dto.qualityScore ?? 0,
        comments: dto.comments ?? null, goals: (dto.goals ?? undefined) as Prisma.InputJsonValue,
        status: PerformanceReviewStatus.DRAFT,
      } as Prisma.PerformanceReviewUncheckedCreateInput,
    });
  }

  listReviews(q: ReviewQuery) {
    const where: Prisma.PerformanceReviewWhereInput = {};
    if (q.employeeId) where.employeeId = q.employeeId;
    if (q.period) where.period = q.period;
    if (q.status) where.status = q.status as PerformanceReviewStatus;
    return this.prisma.performanceReview.findMany({
      where, orderBy: { createdAt: 'desc' },
      include: {
        employee: { include: { user: { select: { firstName: true, lastName: true } }, department: { select: { name: true } } } },
        reviewer: { select: { firstName: true, lastName: true } },
      },
    });
  }

  async getReview(id: string) {
    const review = await this.prisma.performanceReview.findFirst({
      where: { id },
      include: {
        employee: { include: { user: { select: { firstName: true, lastName: true } }, department: { select: { name: true } } } },
        reviewer: { select: { firstName: true, lastName: true } },
      },
    });
    if (!review) throw new NotFoundException('Performance review not found');
    return review;
  }

  async updateReview(id: string, dto: UpdateReviewDto) {
    const review = await this.prisma.performanceReview.findFirst({ where: { id } });
    if (!review) throw new NotFoundException('Performance review not found');
    if (review.status === PerformanceReviewStatus.ACKNOWLEDGED) throw new BadRequestException('Acknowledged reviews are locked');
    return this.prisma.performanceReview.update({
      where: { id },
      data: {
        overallScore: dto.overallScore, attendanceScore: dto.attendanceScore,
        productivityScore: dto.productivityScore, qualityScore: dto.qualityScore,
        comments: dto.comments,
        ...(dto.goals !== undefined ? { goals: dto.goals as Prisma.InputJsonValue } : {}),
      },
    });
  }

  async submitReview(id: string) {
    const review = await this.prisma.performanceReview.findFirst({ where: { id }, include: { employee: { select: { userId: true } } } });
    if (!review) throw new NotFoundException('Performance review not found');
    if (review.status !== PerformanceReviewStatus.DRAFT) throw new BadRequestException(`Review is ${review.status}, not DRAFT`);
    const updated = await this.prisma.performanceReview.update({ where: { id }, data: { status: PerformanceReviewStatus.SUBMITTED } });
    await this.notifications.notify(
      review.employee.userId, 'PERFORMANCE_REVIEW_SUBMITTED', 'Performance review shared',
      `Your ${review.period} performance review is ready — please review and acknowledge.`, id, 'PerformanceReview',
    );
    return updated;
  }

  async acknowledgeReview(id: string) {
    const review = await this.prisma.performanceReview.findFirst({ where: { id } });
    if (!review) throw new NotFoundException('Performance review not found');
    if (review.status !== PerformanceReviewStatus.SUBMITTED) throw new BadRequestException(`Review is ${review.status}, not SUBMITTED`);
    return this.prisma.performanceReview.update({ where: { id }, data: { status: PerformanceReviewStatus.ACKNOWLEDGED } });
  }

  // ── Goals ───────────────────────────────────────────────────────────────────
  createGoal(dto: CreateGoalDto) {
    return this.prisma.performanceGoal.create({
      data: {
        employeeId: dto.employeeId, title: dto.title, description: dto.description ?? null,
        targetDate: new Date(dto.targetDate), progress: dto.progress ?? 0, status: PerformanceGoalStatus.ACTIVE,
      } as Prisma.PerformanceGoalUncheckedCreateInput,
    });
  }

  listGoals(q: GoalQuery) {
    const where: Prisma.PerformanceGoalWhereInput = {};
    if (q.employeeId) where.employeeId = q.employeeId;
    if (q.status) where.status = q.status as PerformanceGoalStatus;
    return this.prisma.performanceGoal.findMany({
      where, orderBy: { targetDate: 'asc' },
      include: { employee: { include: { user: { select: { firstName: true, lastName: true } } } } },
    });
  }

  async updateGoal(id: string, dto: UpdateGoalDto) {
    const goal = await this.prisma.performanceGoal.findFirst({ where: { id } });
    if (!goal) throw new NotFoundException('Performance goal not found');
    return this.prisma.performanceGoal.update({
      where: { id },
      data: {
        title: dto.title, description: dto.description,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined,
        progress: dto.progress, status: dto.status as PerformanceGoalStatus | undefined,
      },
    });
  }

  // ── Computed composite score ──────────────────────────────────────────────────
  async score(employeeId: string) {
    const emp = await this.prisma.employee.findFirst({ where: { id: employeeId } });
    if (!emp) throw new NotFoundException('Employee not found');
    const now = new Date();
    const since = new Date(+now - 30 * DAY);

    // Attendance: distinct clock-in days over the last 30 days vs expected working days.
    const clockIns = await this.prisma.clockEvent.findMany({
      where: { employeeId, type: ClockEventType.ClockIn, timestamp: { gte: since, lte: now } },
      select: { timestamp: true },
    });
    const presentDays = new Set(clockIns.map((c) => c.timestamp.toISOString().slice(0, 10))).size;
    const attendanceScore = clamp100(round((presentDays / EXPECTED_WORK_DAYS_30) * 100));

    // Productivity + quality from recent metrics.
    const metrics = await this.prisma.productivityMetric.findMany({ where: { employeeId, date: { gte: since, lte: now } } });
    const latestReview = await this.prisma.performanceReview.findFirst({ where: { employeeId }, orderBy: { createdAt: 'desc' } });

    const avgSpecimens = avg(metrics.map((m) => m.specimensProcessed));
    const productivityScore = metrics.length
      ? clamp100(round((avgSpecimens / SPECIMENS_TARGET_PER_DAY) * 100))
      : (latestReview?.productivityScore ?? 0);
    const qualityScore = metrics.length
      ? clamp100(round(avg(metrics.filter((m) => m.qualityScore > 0).map((m) => m.qualityScore))))
      : (latestReview?.qualityScore ?? 0);
    const reviewScore = latestReview?.overallScore ?? 0;

    const score = round(
      attendanceScore * W_ATTENDANCE +
      productivityScore * W_PRODUCTIVITY +
      qualityScore * W_QUALITY +
      reviewScore * W_REVIEW,
    );

    return {
      employeeId,
      score,
      breakdown: {
        attendance: { score: attendanceScore, weight: W_ATTENDANCE, presentDays, expectedDays: EXPECTED_WORK_DAYS_30 },
        productivity: { score: productivityScore, weight: W_PRODUCTIVITY, avgSpecimensPerDay: round(avgSpecimens) },
        quality: { score: qualityScore, weight: W_QUALITY },
        review: { score: reviewScore, weight: W_REVIEW, period: latestReview?.period ?? null },
      },
    };
  }
}
