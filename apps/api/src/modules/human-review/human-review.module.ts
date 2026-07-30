import { Module } from '@nestjs/common';
import { HumanReviewService } from './human-review.service';
import { HumanReviewController } from './human-review.controller';

/**
 * Program 6 · Phase 6E — human review workflow. Parallel to 6A registry / 6B datasets / 6C inference / 6D
 * explainability (all untouched) and SEPARATE from the clinical Record/ResultSheet/AiDraft path (untouched).
 * PrismaService + AuditRecorder come from their @Global modules. Manual, human-initiated actions only — no worker,
 * no scheduler, no automation. No support inference; no support clinical authorization.
 */
@Module({
  controllers: [HumanReviewController],
  providers: [HumanReviewService],
  exports: [HumanReviewService],
})
export class HumanReviewModule {}
