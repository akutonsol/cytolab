-- Program 6 · Phase 6C — inference execution engine (orchestration only).
-- ADDITIVE ONLY: two new enums, two new tables (InferenceJob, InferenceEvent), additive
-- columns on the 6A-reserved InferenceRecord shell (the 6A-era columns are unchanged),
-- and provenance FKs — every one ON DELETE RESTRICT. No existing table is dropped or
-- altered destructively; the only pre-existing table touched is InferenceRecord (columns
-- added, per the 6A schema comment that reserved them for 6C). References — never modifies —
-- Program 5 / accepted 6A / accepted 6B.

-- CreateEnum
CREATE TYPE "InferenceJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT');

-- CreateEnum
CREATE TYPE "InferenceOutcome" AS ENUM ('SUCCEEDED', 'FAILED', 'TIMED_OUT');

-- AlterTable
ALTER TABLE "InferenceRecord" ADD COLUMN     "adapterId" TEXT,
ADD COLUMN     "adapterVersion" TEXT,
ADD COLUMN     "configDigest" TEXT,
ADD COLUMN     "durationMs" INTEGER,
ADD COLUMN     "engineVersion" TEXT,
ADD COLUMN     "finishedAt" TIMESTAMP(3),
ADD COLUMN     "jobId" TEXT,
ADD COLUMN     "modelLifecycleStateAtRun" "AiModelLifecycleState",
ADD COLUMN     "outcome" "InferenceOutcome",
ADD COLUMN     "resultDigest" TEXT,
ADD COLUMN     "resultRef" TEXT,
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "validationOnly" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "InferenceJob" (
    "id" TEXT NOT NULL,
    "jobUuid" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "modelVersionId" TEXT NOT NULL,
    "subjectSlideId" TEXT,
    "inputDigest" TEXT NOT NULL,
    "configDigest" TEXT,
    "adapterId" TEXT NOT NULL,
    "status" "InferenceJobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "workerId" TEXT,
    "heartbeatAt" TIMESTAMP(3),
    "leaseExpiresAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorDetail" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InferenceJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InferenceEvent" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "fromStatus" "InferenceJobStatus",
    "toStatus" "InferenceJobStatus" NOT NULL,
    "actorId" TEXT,
    "detail" TEXT,
    "eventId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InferenceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InferenceJob_jobUuid_key" ON "InferenceJob"("jobUuid");

-- CreateIndex
CREATE INDEX "InferenceJob_labId_idx" ON "InferenceJob"("labId");

-- CreateIndex
CREATE INDEX "InferenceJob_labId_status_idx" ON "InferenceJob"("labId", "status");

-- CreateIndex
CREATE INDEX "InferenceJob_status_leaseExpiresAt_idx" ON "InferenceJob"("status", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "InferenceJob_modelVersionId_idx" ON "InferenceJob"("modelVersionId");

-- CreateIndex
CREATE INDEX "InferenceEvent_labId_idx" ON "InferenceEvent"("labId");

-- CreateIndex
CREATE INDEX "InferenceEvent_labId_jobId_idx" ON "InferenceEvent"("labId", "jobId");

-- CreateIndex
CREATE INDEX "InferenceEvent_jobId_idx" ON "InferenceEvent"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "InferenceRecord_jobId_key" ON "InferenceRecord"("jobId");

-- CreateIndex
CREATE INDEX "InferenceRecord_jobId_idx" ON "InferenceRecord"("jobId");

-- AddForeignKey
ALTER TABLE "InferenceRecord" ADD CONSTRAINT "InferenceRecord_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "InferenceJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InferenceJob" ADD CONSTRAINT "InferenceJob_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InferenceJob" ADD CONSTRAINT "InferenceJob_modelVersionId_fkey" FOREIGN KEY ("modelVersionId") REFERENCES "AiModelVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InferenceJob" ADD CONSTRAINT "InferenceJob_subjectSlideId_fkey" FOREIGN KEY ("subjectSlideId") REFERENCES "DigitalSlide"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InferenceEvent" ADD CONSTRAINT "InferenceEvent_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InferenceEvent" ADD CONSTRAINT "InferenceEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "InferenceJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Decision 5 — at most one ACTIVE (QUEUED/RUNNING) inference per (modelVersionId, subjectSlideId,
-- inputDigest). Prisma cannot express a partial (WHERE) unique index, so it is added here by hand
-- (the Program-5 SlideProcessingJob active-job pattern). COALESCE keeps a null subjectSlideId
-- distinct-safe so slide-less inferences still dedupe by (modelVersion, input).
CREATE UNIQUE INDEX "InferenceJob_active_subject_input_key"
  ON "InferenceJob" ("modelVersionId", COALESCE("subjectSlideId", ''), "inputDigest")
  WHERE "status" IN ('QUEUED'::"InferenceJobStatus", 'RUNNING'::"InferenceJobStatus");

