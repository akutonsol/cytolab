-- Program 6 · Phase 6G — continuous evaluation evidence (longitudinal, not autonomous).
-- ADDITIVE ONLY: six new enums + five new tables (EvaluationWindow/WindowMember/Metric/Recommendation/
-- RecommendationEvidence), all provenance FKs ON DELETE RESTRICT. NO existing table is dropped or altered
-- destructively (the only ALTER TABLE statements add FKs to the new tables); model lifecycle + inference +
-- validation + the clinical path are untouched (no support lifecycle mutation; no automatic retirement). Plain
-- validated numeric/coded columns — no raw-SQL-only invariant. References — never modifies — Program 5 / accepted
-- 6A / 6B / 6C / 6D / 6E / 6F. Manual-trigger only; no worker/scheduler.

-- CreateEnum
CREATE TYPE "EvaluationEvidenceProvenance" AS ENUM ('OBSERVED', 'SYNTHETIC_STUB', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "EvaluationCohort" AS ENUM ('NON_VALIDATION', 'VALIDATION_ONLY');

-- CreateEnum
CREATE TYPE "EvaluationCoverageStatus" AS ENUM ('COVERED', 'SPARSE', 'EMPTY');

-- CreateEnum
CREATE TYPE "EvaluationMetricKind" AS ENUM ('INFERENCE_COUNT', 'SUCCESS_RATE', 'FAILURE_RATE', 'TIMEOUT_RATE', 'LATENCY_PERCENTILE', 'CONFIDENCE_BIN', 'DRIFT_INDICATOR', 'CALIBRATION_DECAY');

-- CreateEnum
CREATE TYPE "EvaluationRecommendationCode" AS ENUM ('LIFECYCLE_REVIEW_RECOMMENDED');

-- CreateEnum
CREATE TYPE "EvaluationWindowStatus" AS ENUM ('COMPLETE');

-- CreateTable
CREATE TABLE "EvaluationWindow" (
    "id" TEXT NOT NULL,
    "windowUuid" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "modelVersionId" TEXT NOT NULL,
    "modelVersionUuid" TEXT NOT NULL,
    "modelUuid" TEXT NOT NULL,
    "modelLifecycleStateAtRun" "AiModelLifecycleState" NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "timeBasis" TEXT NOT NULL,
    "windowDefinitionVersion" TEXT NOT NULL,
    "cohort" "EvaluationCohort" NOT NULL,
    "baselineValidationRunId" TEXT,
    "baselineCalculationId" TEXT,
    "baselineCompatibility" "EvaluationEvidenceProvenance" NOT NULL,
    "sampleCount" INTEGER NOT NULL,
    "coverageStatus" "EvaluationCoverageStatus" NOT NULL,
    "evaluatorId" TEXT NOT NULL,
    "evaluatorVersion" TEXT NOT NULL,
    "computationVersion" TEXT NOT NULL,
    "metricSchemaVersion" TEXT NOT NULL,
    "configDigest" TEXT,
    "calculationId" TEXT NOT NULL,
    "windowSignature" TEXT NOT NULL,
    "completionState" "EvaluationWindowStatus" NOT NULL DEFAULT 'COMPLETE',
    "eventId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluationWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationWindowMember" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "windowId" TEXT NOT NULL,
    "inferenceRecordId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluationWindowMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationMetric" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "windowId" TEXT NOT NULL,
    "metricKind" "EvaluationMetricKind" NOT NULL,
    "provenance" "EvaluationEvidenceProvenance" NOT NULL,
    "cohort" "EvaluationCohort" NOT NULL,
    "binCode" TEXT,
    "value" DOUBLE PRECISION,
    "numeratorSource" TEXT,
    "denominatorSource" TEXT,
    "unit" TEXT,
    "sampleCount" INTEGER,
    "baselineRelation" TEXT,
    "unavailableReason" TEXT,
    "ordinal" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluationMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationRecommendation" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "windowId" TEXT NOT NULL,
    "recommendationCode" "EvaluationRecommendationCode" NOT NULL,
    "ruleId" TEXT NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "thresholdConfigDigest" TEXT,
    "coverageStatus" "EvaluationCoverageStatus" NOT NULL,
    "provenance" "EvaluationEvidenceProvenance" NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluationRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationRecommendationEvidence" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "metricId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluationRecommendationEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationWindow_windowUuid_key" ON "EvaluationWindow"("windowUuid");

-- CreateIndex
CREATE INDEX "EvaluationWindow_labId_idx" ON "EvaluationWindow"("labId");

-- CreateIndex
CREATE INDEX "EvaluationWindow_labId_modelVersionId_idx" ON "EvaluationWindow"("labId", "modelVersionId");

-- CreateIndex
CREATE INDEX "EvaluationWindow_labId_windowSignature_idx" ON "EvaluationWindow"("labId", "windowSignature");

-- CreateIndex
CREATE INDEX "EvaluationWindow_modelVersionId_idx" ON "EvaluationWindow"("modelVersionId");

-- CreateIndex
CREATE INDEX "EvaluationWindowMember_labId_idx" ON "EvaluationWindowMember"("labId");

-- CreateIndex
CREATE INDEX "EvaluationWindowMember_labId_windowId_idx" ON "EvaluationWindowMember"("labId", "windowId");

-- CreateIndex
CREATE INDEX "EvaluationWindowMember_windowId_idx" ON "EvaluationWindowMember"("windowId");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationWindowMember_labId_windowId_inferenceRecordId_key" ON "EvaluationWindowMember"("labId", "windowId", "inferenceRecordId");

-- CreateIndex
CREATE INDEX "EvaluationMetric_labId_idx" ON "EvaluationMetric"("labId");

-- CreateIndex
CREATE INDEX "EvaluationMetric_labId_windowId_idx" ON "EvaluationMetric"("labId", "windowId");

-- CreateIndex
CREATE INDEX "EvaluationMetric_windowId_idx" ON "EvaluationMetric"("windowId");

-- CreateIndex
CREATE INDEX "EvaluationRecommendation_labId_idx" ON "EvaluationRecommendation"("labId");

-- CreateIndex
CREATE INDEX "EvaluationRecommendation_labId_windowId_idx" ON "EvaluationRecommendation"("labId", "windowId");

-- CreateIndex
CREATE INDEX "EvaluationRecommendation_windowId_idx" ON "EvaluationRecommendation"("windowId");

-- CreateIndex
CREATE INDEX "EvaluationRecommendationEvidence_labId_idx" ON "EvaluationRecommendationEvidence"("labId");

-- CreateIndex
CREATE INDEX "EvaluationRecommendationEvidence_recommendationId_idx" ON "EvaluationRecommendationEvidence"("recommendationId");

-- CreateIndex
CREATE INDEX "EvaluationRecommendationEvidence_metricId_idx" ON "EvaluationRecommendationEvidence"("metricId");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationRecommendationEvidence_labId_recommendationId_met_key" ON "EvaluationRecommendationEvidence"("labId", "recommendationId", "metricId");

-- AddForeignKey
ALTER TABLE "EvaluationWindow" ADD CONSTRAINT "EvaluationWindow_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationWindow" ADD CONSTRAINT "EvaluationWindow_modelVersionId_fkey" FOREIGN KEY ("modelVersionId") REFERENCES "AiModelVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationWindow" ADD CONSTRAINT "EvaluationWindow_baselineValidationRunId_fkey" FOREIGN KEY ("baselineValidationRunId") REFERENCES "ValidationRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationWindowMember" ADD CONSTRAINT "EvaluationWindowMember_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationWindowMember" ADD CONSTRAINT "EvaluationWindowMember_windowId_fkey" FOREIGN KEY ("windowId") REFERENCES "EvaluationWindow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationWindowMember" ADD CONSTRAINT "EvaluationWindowMember_inferenceRecordId_fkey" FOREIGN KEY ("inferenceRecordId") REFERENCES "InferenceRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationMetric" ADD CONSTRAINT "EvaluationMetric_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationMetric" ADD CONSTRAINT "EvaluationMetric_windowId_fkey" FOREIGN KEY ("windowId") REFERENCES "EvaluationWindow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationRecommendation" ADD CONSTRAINT "EvaluationRecommendation_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationRecommendation" ADD CONSTRAINT "EvaluationRecommendation_windowId_fkey" FOREIGN KEY ("windowId") REFERENCES "EvaluationWindow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationRecommendationEvidence" ADD CONSTRAINT "EvaluationRecommendationEvidence_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationRecommendationEvidence" ADD CONSTRAINT "EvaluationRecommendationEvidence_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "EvaluationRecommendation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationRecommendationEvidence" ADD CONSTRAINT "EvaluationRecommendationEvidence_metricId_fkey" FOREIGN KEY ("metricId") REFERENCES "EvaluationMetric"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

