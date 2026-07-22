-- AlterTable
ALTER TABLE "SlideProcessingJob" ADD COLUMN     "heartbeatAt" TIMESTAMP(3),
ADD COLUMN     "leaseExpiresAt" TIMESTAMP(3),
ADD COLUMN     "workerId" TEXT;

-- CreateIndex
CREATE INDEX "SlideProcessingJob_status_leaseExpiresAt_idx" ON "SlideProcessingJob"("status", "leaseExpiresAt");


-- P5-3B.0: at most one ACTIVE (QUEUED/RUNNING) processing job per ingestion — the DB backstop that
-- makes duplicate-active-job prevention race-proof. Prisma cannot express the WHERE predicate; the
-- SlideProcessingJob table is empty (no jobs created yet), so this lands with zero risk.
CREATE UNIQUE INDEX "SlideProcessingJob_ingestion_active_key"
  ON "SlideProcessingJob" ("ingestionId")
  WHERE "status" IN ('QUEUED'::"ProcessingJobStatus", 'RUNNING'::"ProcessingJobStatus");
