-- CreateEnum
CREATE TYPE "TATAlertLevel" AS ENUM ('Approaching', 'Breached');

-- CreateEnum
CREATE TYPE "TATAlertStatus" AS ENUM ('Open', 'Acknowledged', 'Resolved');

-- CreateTable
CREATE TABLE "TATConfig" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "specimenType" TEXT,
    "thresholdHours" INTEGER NOT NULL,
    "warningHours" INTEGER NOT NULL DEFAULT 24,
    "urgentThresholdHours" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TATConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TATAlert" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "level" "TATAlertLevel" NOT NULL,
    "status" "TATAlertStatus" NOT NULL DEFAULT 'Open',
    "thresholdHours" INTEGER NOT NULL,
    "elapsedHours" INTEGER NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "configId" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TATAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TATConfig_labId_idx" ON "TATConfig"("labId");

-- CreateIndex
CREATE INDEX "TATAlert_labId_idx" ON "TATAlert"("labId");

-- CreateIndex
CREATE INDEX "TATAlert_labId_status_idx" ON "TATAlert"("labId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TATAlert_recordId_level_key" ON "TATAlert"("recordId", "level");

-- AddForeignKey
ALTER TABLE "TATConfig" ADD CONSTRAINT "TATConfig_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TATAlert" ADD CONSTRAINT "TATAlert_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TATAlert" ADD CONSTRAINT "TATAlert_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TATAlert" ADD CONSTRAINT "TATAlert_configId_fkey" FOREIGN KEY ("configId") REFERENCES "TATConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TATAlert" ADD CONSTRAINT "TATAlert_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

