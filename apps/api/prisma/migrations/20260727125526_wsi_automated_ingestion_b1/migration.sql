-- CreateEnum
CREATE TYPE "IngestionSourceKind" AS ENUM ('FILESYSTEM');

-- CreateEnum
CREATE TYPE "IngestionDiscoveryStatus" AS ENUM ('DISCOVERED', 'STABILIZING', 'MATCHED', 'UNMATCHED', 'AMBIGUOUS', 'DUPLICATE', 'INGESTED', 'FAILED', 'RECONCILED');

-- CreateTable
CREATE TABLE "IngestionSource" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "kind" "IngestionSourceKind" NOT NULL DEFAULT 'FILESYSTEM',
    "rootPath" TEXT NOT NULL,
    "matchConfig" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionDiscovery" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sizeBytes" INTEGER,
    "sourceChecksum" TEXT,
    "status" "IngestionDiscoveryStatus" NOT NULL DEFAULT 'DISCOVERED',
    "matchedRecordId" TEXT,
    "matchedSpecimenId" TEXT,
    "matchEvidence" JSONB,
    "resultingSlideId" TEXT,
    "resultingIngestionId" TEXT,
    "reconciledById" TEXT,
    "reconciliationAction" TEXT,
    "reconciledAt" TIMESTAMP(3),
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionDiscovery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IngestionSource_labId_enabled_idx" ON "IngestionSource"("labId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "IngestionSource_labId_rootPath_key" ON "IngestionSource"("labId", "rootPath");

-- CreateIndex
CREATE INDEX "IngestionDiscovery_labId_status_idx" ON "IngestionDiscovery"("labId", "status");

-- CreateIndex
CREATE INDEX "IngestionDiscovery_labId_sourceChecksum_idx" ON "IngestionDiscovery"("labId", "sourceChecksum");

-- CreateIndex
CREATE INDEX "IngestionDiscovery_sourceId_idx" ON "IngestionDiscovery"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "IngestionDiscovery_labId_sourceId_sourceRef_key" ON "IngestionDiscovery"("labId", "sourceId", "sourceRef");

-- AddForeignKey
ALTER TABLE "IngestionSource" ADD CONSTRAINT "IngestionSource_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionDiscovery" ADD CONSTRAINT "IngestionDiscovery_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionDiscovery" ADD CONSTRAINT "IngestionDiscovery_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "IngestionSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

