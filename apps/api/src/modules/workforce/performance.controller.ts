import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { PerformanceService } from './performance.service';
import { CreateGoalDto, CreateReviewDto, GoalQuery, ReviewQuery, UpdateGoalDto, UpdateReviewDto } from './dto/workforce-phase3.dto';

@ApiTags('workforce-performance')
@ApiBearerAuth()
@Controller()
export class PerformanceController {
  constructor(private performance: PerformanceService) {}

  // ── Reviews (static before /:id) ──────────────────────────────────────────────
  @Post('workforce/performance/reviews')
  @RequirePermissions('employee:change')
  createReview(@Body() dto: CreateReviewDto, @CurrentUser() user: AuthUser) {
    return this.performance.createReview(dto, user.userId);
  }

  @Get('workforce/performance/reviews')
  @RequirePermissions('record:view')
  listReviews(@Query() q: ReviewQuery) {
    return this.performance.listReviews(q);
  }

  @Get('workforce/performance/reviews/:id')
  @RequirePermissions('record:view')
  getReview(@Param('id') id: string) {
    return this.performance.getReview(id);
  }

  @Patch('workforce/performance/reviews/:id/submit')
  @RequirePermissions('employee:change')
  submitReview(@Param('id') id: string) {
    return this.performance.submitReview(id);
  }

  @Patch('workforce/performance/reviews/:id/acknowledge')
  @RequirePermissions('record:view')
  acknowledgeReview(@Param('id') id: string) {
    return this.performance.acknowledgeReview(id);
  }

  @Patch('workforce/performance/reviews/:id')
  @RequirePermissions('employee:change')
  updateReview(@Param('id') id: string, @Body() dto: UpdateReviewDto) {
    return this.performance.updateReview(id, dto);
  }

  // ── Goals ─────────────────────────────────────────────────────────────────────
  @Post('workforce/performance/goals')
  @RequirePermissions('employee:change')
  createGoal(@Body() dto: CreateGoalDto) {
    return this.performance.createGoal(dto);
  }

  @Get('workforce/performance/goals')
  @RequirePermissions('record:view')
  listGoals(@Query() q: GoalQuery) {
    return this.performance.listGoals(q);
  }

  @Patch('workforce/performance/goals/:id')
  @RequirePermissions('employee:change')
  updateGoal(@Param('id') id: string, @Body() dto: UpdateGoalDto) {
    return this.performance.updateGoal(id, dto);
  }

  // ── Composite score ───────────────────────────────────────────────────────────
  @Get('workforce/performance/score/:employeeId')
  @RequirePermissions('record:view')
  score(@Param('employeeId') employeeId: string) {
    return this.performance.score(employeeId);
  }
}
