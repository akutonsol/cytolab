-- CreateEnum
CREATE TYPE "SourceHealthState" AS ENUM ('UNKNOWN', 'HEALTHY', 'DEGRADED', 'UNREACHABLE', 'AUTH_REJECTED', 'MISCONFIGURED', 'DISABLED');

-- CreateTable
CREATE TABLE "IngestionSourceHealth" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "state" "SourceHealthState" NOT NULL DEFAULT 'UNKNOWN',
    "checkedAt" TIMESTAMP(3),
    "lastSuccessfulCheckAt" TIMESTAMP(3),
    "lastFailedCheckAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "responseTimeMs" INTEGER,
    "nextEligibleCheckAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionSourceHealth_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IngestionSourceHealth_sourceId_key" ON "IngestionSourceHealth"("sourceId");

-- CreateIndex
CREATE INDEX "IngestionSourceHealth_labId_state_idx" ON "IngestionSourceHealth"("labId", "state");

-- CreateIndex
CREATE INDEX "IngestionSourceHealth_labId_nextEligibleCheckAt_idx" ON "IngestionSourceHealth"("labId", "nextEligibleCheckAt");

-- AddForeignKey
ALTER TABLE "IngestionSourceHealth" ADD CONSTRAINT "IngestionSourceHealth_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionSourceHealth" ADD CONSTRAINT "IngestionSourceHealth_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "IngestionSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

