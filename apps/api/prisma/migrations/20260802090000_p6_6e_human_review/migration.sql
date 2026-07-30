-- Program 6 · Phase 6E — human review workflow (the human owns the diagnosis).
-- ADDITIVE ONLY: two new enums + four new tables (HumanReviewRequest/Decision/ModifiedFinding/RequestEvent),
-- all provenance FKs ON DELETE RESTRICT (incl. the NON-NULL reviewer User FK — human ownership). NO existing
-- table is dropped or altered destructively (the only ALTER TABLE statements add FKs to the new tables); the
-- clinical Record/ResultSheet/AiDraft path is untouched. Plain validated structured columns — no raw-SQL-only
-- invariant. References — never modifies — Program 5 / accepted 6A / 6B / 6C / 6D and the clinical sign-out path.

-- CreateEnum
CREATE TYPE "HumanReviewRequestState" AS ENUM ('PENDING', 'ASSIGNED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HumanReviewDecisionType" AS ENUM ('ACCEPT', 'REJECT', 'MODIFY');

-- CreateTable
CREATE TABLE "HumanReviewRequest" (
    "id" TEXT NOT NULL,
    "requestUuid" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "inferenceRecordId" TEXT NOT NULL,
    "state" "HumanReviewRequestState" NOT NULL DEFAULT 'PENDING',
    "assigneeUserId" TEXT,
    "validationOnly" BOOLEAN NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HumanReviewRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HumanReviewDecision" (
    "id" TEXT NOT NULL,
    "decisionUuid" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "inferenceRecordId" TEXT NOT NULL,
    "reviewerUserId" TEXT NOT NULL,
    "reviewDecision" "HumanReviewDecisionType" NOT NULL,
    "validationOnly" BOOLEAN NOT NULL,
    "reviewedModelVersionId" TEXT NOT NULL,
    "reviewedResultDigest" TEXT,
    "modelLifecycleStateAtReview" "AiModelLifecycleState",
    "reviewRationale" TEXT,
    "correctionDigest" TEXT,
    "explainabilityGenerationId" TEXT,
    "eventId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HumanReviewDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HumanReviewModifiedFinding" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "findingCode" TEXT NOT NULL,
    "valueCode" TEXT,
    "valueNum" DOUBLE PRECISION,
    "ordinal" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HumanReviewModifiedFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HumanReviewRequestEvent" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fromState" "HumanReviewRequestState",
    "toState" "HumanReviewRequestState" NOT NULL,
    "actorId" TEXT,
    "eventId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HumanReviewRequestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HumanReviewRequest_requestUuid_key" ON "HumanReviewRequest"("requestUuid");

-- CreateIndex
CREATE INDEX "HumanReviewRequest_labId_idx" ON "HumanReviewRequest"("labId");

-- CreateIndex
CREATE INDEX "HumanReviewRequest_labId_inferenceRecordId_idx" ON "HumanReviewRequest"("labId", "inferenceRecordId");

-- CreateIndex
CREATE INDEX "HumanReviewRequest_labId_state_idx" ON "HumanReviewRequest"("labId", "state");

-- CreateIndex
CREATE INDEX "HumanReviewRequest_inferenceRecordId_idx" ON "HumanReviewRequest"("inferenceRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "HumanReviewDecision_decisionUuid_key" ON "HumanReviewDecision"("decisionUuid");

-- CreateIndex
CREATE INDEX "HumanReviewDecision_labId_idx" ON "HumanReviewDecision"("labId");

-- CreateIndex
CREATE INDEX "HumanReviewDecision_labId_requestId_idx" ON "HumanReviewDecision"("labId", "requestId");

-- CreateIndex
CREATE INDEX "HumanReviewDecision_labId_inferenceRecordId_idx" ON "HumanReviewDecision"("labId", "inferenceRecordId");

-- CreateIndex
CREATE INDEX "HumanReviewDecision_requestId_idx" ON "HumanReviewDecision"("requestId");

-- CreateIndex
CREATE INDEX "HumanReviewDecision_reviewerUserId_idx" ON "HumanReviewDecision"("reviewerUserId");

-- CreateIndex
CREATE INDEX "HumanReviewModifiedFinding_labId_idx" ON "HumanReviewModifiedFinding"("labId");

-- CreateIndex
CREATE INDEX "HumanReviewModifiedFinding_labId_decisionId_idx" ON "HumanReviewModifiedFinding"("labId", "decisionId");

-- CreateIndex
CREATE INDEX "HumanReviewModifiedFinding_decisionId_idx" ON "HumanReviewModifiedFinding"("decisionId");

-- CreateIndex
CREATE INDEX "HumanReviewRequestEvent_labId_idx" ON "HumanReviewRequestEvent"("labId");

-- CreateIndex
CREATE INDEX "HumanReviewRequestEvent_labId_requestId_idx" ON "HumanReviewRequestEvent"("labId", "requestId");

-- CreateIndex
CREATE INDEX "HumanReviewRequestEvent_requestId_idx" ON "HumanReviewRequestEvent"("requestId");

-- AddForeignKey
ALTER TABLE "HumanReviewRequest" ADD CONSTRAINT "HumanReviewRequest_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanReviewRequest" ADD CONSTRAINT "HumanReviewRequest_inferenceRecordId_fkey" FOREIGN KEY ("inferenceRecordId") REFERENCES "InferenceRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanReviewRequest" ADD CONSTRAINT "HumanReviewRequest_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanReviewDecision" ADD CONSTRAINT "HumanReviewDecision_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanReviewDecision" ADD CONSTRAINT "HumanReviewDecision_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "HumanReviewRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanReviewDecision" ADD CONSTRAINT "HumanReviewDecision_inferenceRecordId_fkey" FOREIGN KEY ("inferenceRecordId") REFERENCES "InferenceRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanReviewDecision" ADD CONSTRAINT "HumanReviewDecision_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanReviewDecision" ADD CONSTRAINT "HumanReviewDecision_explainabilityGenerationId_fkey" FOREIGN KEY ("explainabilityGenerationId") REFERENCES "ExplainabilityGeneration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanReviewModifiedFinding" ADD CONSTRAINT "HumanReviewModifiedFinding_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanReviewModifiedFinding" ADD CONSTRAINT "HumanReviewModifiedFinding_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "HumanReviewDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanReviewRequestEvent" ADD CONSTRAINT "HumanReviewRequestEvent_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanReviewRequestEvent" ADD CONSTRAINT "HumanReviewRequestEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "HumanReviewRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

