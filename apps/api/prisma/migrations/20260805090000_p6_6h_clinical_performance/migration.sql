-- Program 6 · Phase 6H — clinical performance measurement evidence (measurement only; never clinical authority).
-- ADDITIVE ONLY: six new enums + three new tables (ClinicalPerfWindow/WindowMember/Metric), all provenance FKs
-- ON DELETE RESTRICT. NO existing table is dropped or altered destructively (the only ALTER TABLE statements add
-- FKs to the new tables); model lifecycle + inference + validation + continuous-evaluation + the clinical path are
-- untouched (no support diagnostic authority; no lifecycle/clinical mutation). Program-5 interaction is reference-
-- only coded operational metadata (no narrative/PHI, never modified). Plain validated numeric/coded columns — no
-- raw-SQL-only invariant. References — never modifies — Program 5 / accepted 6A / 6B / 6C / 6D / 6E / 6F / 6G.

-- CreateEnum
CREATE TYPE "ClinicalPerfMetricKind" AS ENUM ('READER_AGREEMENT', 'CONCORDANCE', 'REVIEW_DURATION', 'TURNAROUND_DURATION', 'WORKLOAD_COUNT', 'WORKLOAD_REDUCTION', 'OPERATIONAL_THROUGHPUT');

-- CreateEnum
CREATE TYPE "ClinicalPerfEvidenceProvenance" AS ENUM ('OBSERVED', 'SYNTHETIC_STUB', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "ClinicalPerfCohort" AS ENUM ('CLINICAL', 'VALIDATION_ONLY');

-- CreateEnum
CREATE TYPE "ClinicalPerfCoverageStatus" AS ENUM ('COVERED', 'SPARSE', 'EMPTY');

-- CreateEnum
CREATE TYPE "ClinicalPerfMemberSource" AS ENUM ('INFERENCE_RECORD', 'HUMAN_REVIEW_DECISION');

-- CreateEnum
CREATE TYPE "ClinicalPerfWindowStatus" AS ENUM ('COMPLETE');

-- CreateTable
CREATE TABLE "ClinicalPerfWindow" (
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
    "cohort" "ClinicalPerfCohort" NOT NULL,
    "baselineValidationRunId" TEXT,
    "baselineCalculationId" TEXT,
    "evidenceCompatibility" "ClinicalPerfEvidenceProvenance" NOT NULL,
    "operationalDataUsed" BOOLEAN NOT NULL,
    "sampleCount" INTEGER NOT NULL,
    "coverageStatus" "ClinicalPerfCoverageStatus" NOT NULL,
    "evaluatorId" TEXT NOT NULL,
    "evaluatorVersion" TEXT NOT NULL,
    "computationVersion" TEXT NOT NULL,
    "metricSchemaVersion" TEXT NOT NULL,
    "configDigest" TEXT,
    "calculationId" TEXT NOT NULL,
    "windowSignature" TEXT NOT NULL,
    "completionState" "ClinicalPerfWindowStatus" NOT NULL DEFAULT 'COMPLETE',
    "eventId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicalPerfWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalPerfWindowMember" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "windowId" TEXT NOT NULL,
    "source" "ClinicalPerfMemberSource" NOT NULL,
    "inferenceRecordId" TEXT,
    "humanReviewDecisionId" TEXT,
    "ordinal" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicalPerfWindowMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalPerfMetric" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "windowId" TEXT NOT NULL,
    "metricKind" "ClinicalPerfMetricKind" NOT NULL,
    "provenance" "ClinicalPerfEvidenceProvenance" NOT NULL,
    "cohort" "ClinicalPerfCohort" NOT NULL,
    "sourceSubsystem" TEXT NOT NULL,
    "binCode" TEXT,
    "value" DOUBLE PRECISION,
    "numeratorSource" TEXT,
    "denominatorSource" TEXT,
    "unit" TEXT,
    "sampleCount" INTEGER,
    "unavailableReason" TEXT,
    "ordinal" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicalPerfMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalPerfWindow_windowUuid_key" ON "ClinicalPerfWindow"("windowUuid");

-- CreateIndex
CREATE INDEX "ClinicalPerfWindow_labId_idx" ON "ClinicalPerfWindow"("labId");

-- CreateIndex
CREATE INDEX "ClinicalPerfWindow_labId_modelVersionId_idx" ON "ClinicalPerfWindow"("labId", "modelVersionId");

-- CreateIndex
CREATE INDEX "ClinicalPerfWindow_labId_windowSignature_idx" ON "ClinicalPerfWindow"("labId", "windowSignature");

-- CreateIndex
CREATE INDEX "ClinicalPerfWindow_modelVersionId_idx" ON "ClinicalPerfWindow"("modelVersionId");

-- CreateIndex
CREATE INDEX "ClinicalPerfWindowMember_labId_idx" ON "ClinicalPerfWindowMember"("labId");

-- CreateIndex
CREATE INDEX "ClinicalPerfWindowMember_labId_windowId_idx" ON "ClinicalPerfWindowMember"("labId", "windowId");

-- CreateIndex
CREATE INDEX "ClinicalPerfWindowMember_windowId_idx" ON "ClinicalPerfWindowMember"("windowId");

-- CreateIndex
CREATE INDEX "ClinicalPerfMetric_labId_idx" ON "ClinicalPerfMetric"("labId");

-- CreateIndex
CREATE INDEX "ClinicalPerfMetric_labId_windowId_idx" ON "ClinicalPerfMetric"("labId", "windowId");

-- CreateIndex
CREATE INDEX "ClinicalPerfMetric_windowId_idx" ON "ClinicalPerfMetric"("windowId");

-- AddForeignKey
ALTER TABLE "ClinicalPerfWindow" ADD CONSTRAINT "ClinicalPerfWindow_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalPerfWindow" ADD CONSTRAINT "ClinicalPerfWindow_modelVersionId_fkey" FOREIGN KEY ("modelVersionId") REFERENCES "AiModelVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalPerfWindow" ADD CONSTRAINT "ClinicalPerfWindow_baselineValidationRunId_fkey" FOREIGN KEY ("baselineValidationRunId") REFERENCES "ValidationRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalPerfWindowMember" ADD CONSTRAINT "ClinicalPerfWindowMember_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalPerfWindowMember" ADD CONSTRAINT "ClinicalPerfWindowMember_windowId_fkey" FOREIGN KEY ("windowId") REFERENCES "ClinicalPerfWindow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalPerfWindowMember" ADD CONSTRAINT "ClinicalPerfWindowMember_inferenceRecordId_fkey" FOREIGN KEY ("inferenceRecordId") REFERENCES "InferenceRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalPerfWindowMember" ADD CONSTRAINT "ClinicalPerfWindowMember_humanReviewDecisionId_fkey" FOREIGN KEY ("humanReviewDecisionId") REFERENCES "HumanReviewDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalPerfMetric" ADD CONSTRAINT "ClinicalPerfMetric_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalPerfMetric" ADD CONSTRAINT "ClinicalPerfMetric_windowId_fkey" FOREIGN KEY ("windowId") REFERENCES "ClinicalPerfWindow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

