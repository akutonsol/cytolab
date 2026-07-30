import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { HumanReviewService } from './human-review.service';
import { CreateReviewRequestDto, AssignReviewDto, SubmitReviewDecisionDto, ReopenReviewDto } from './dto/human-review.dto';

/**
 * Program 6 · Phase 6E — human review API. Lab scope comes from the JWT principal (never the body).
 * Authorization: `review:view` (read), `review:request` (open a review), `review:assign` (assign a reviewer),
 * `review:submit` (a human ACCEPT/REJECT/MODIFY decision), `review:manage` (administrative workflow — reopen/cancel).
 * None granted to a default role. The reviewer identity for a submitted decision is the AUTHENTICATED principal
 * (`user.userId`), never a client-supplied field — the human owns the diagnosis. There is NO decision-mutation route
 * (decisions are immutable) and NO clinical sign-out route (6E never authorizes/finalizes a diagnosis).
 */
@ApiTags('ai-human-review')
@ApiBearerAuth()
@Controller('ai/reviews')
export class HumanReviewController {
  constructor(private readonly svc: HumanReviewService) {}

  @Post()
  @RequirePermissions('review:request')
  createRequest(@CurrentUser() user: AuthUser, @Body() dto: CreateReviewRequestDto) {
    return this.svc.createRequest(dto, user.userId);
  }

  @Get()
  @RequirePermissions('review:view')
  listRequests() {
    return this.svc.listRequests();
  }

  @Get(':id')
  @RequirePermissions('review:view')
  getRequest(@Param('id') id: string) {
    return this.svc.getRequest(id);
  }

  @Post(':id/assign')
  @RequirePermissions('review:assign')
  assign(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AssignReviewDto) {
    return this.svc.assignReview(id, dto, user.userId);
  }

  @Post(':id/decisions')
  @RequirePermissions('review:submit')
  submitDecision(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SubmitReviewDecisionDto) {
    // The reviewer is the AUTHENTICATED principal — never taken from the request body (Decision 3).
    return this.svc.submitDecision(id, dto, user.userId);
  }

  @Post(':id/reopen')
  @RequirePermissions('review:manage')
  reopen(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReopenReviewDto) {
    return this.svc.reopen(id, dto, user.userId);
  }

  @Post(':id/cancel')
  @RequirePermissions('review:manage')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.cancel(id, user.userId);
  }
}
