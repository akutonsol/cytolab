-- CreateEnum
CREATE TYPE "ScreeningBatchStatus" AS ENUM ('Draft', 'Ready', 'Assigned', 'InScreening', 'Completed', 'Closed', 'Cancelled');

-- CreateEnum
CREATE TYPE "ScreeningDisposition" AS ENUM ('Pending', 'Screened', 'Flagged', 'QCSelected');

-- CreateTable
CREATE TABLE "ScreeningBatch" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "status" "ScreeningBatchStatus" NOT NULL DEFAULT 'Draft',
    "assignedToId" TEXT,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "ScreeningBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScreeningBatchCase" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "disposition" "ScreeningDisposition" NOT NULL DEFAULT 'Pending',
    "screenedById" TEXT,
    "screenedAt" TIMESTAMP(3),
    "notes" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScreeningBatchCase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScreeningBatch_labId_status_idx" ON "ScreeningBatch"("labId", "status");

-- CreateIndex
CREATE INDEX "ScreeningBatch_assignedToId_idx" ON "ScreeningBatch"("assignedToId");

-- CreateIndex
CREATE UNIQUE INDEX "ScreeningBatch_labId_batchNumber_key" ON "ScreeningBatch"("labId", "batchNumber");

-- CreateIndex
CREATE INDEX "ScreeningBatchCase_labId_idx" ON "ScreeningBatchCase"("labId");

-- CreateIndex
CREATE INDEX "ScreeningBatchCase_recordId_idx" ON "ScreeningBatchCase"("recordId");

-- CreateIndex
CREATE INDEX "ScreeningBatchCase_batchId_disposition_idx" ON "ScreeningBatchCase"("batchId", "disposition");

-- CreateIndex
CREATE UNIQUE INDEX "ScreeningBatchCase_batchId_recordId_key" ON "ScreeningBatchCase"("batchId", "recordId");

-- AddForeignKey
ALTER TABLE "ScreeningBatch" ADD CONSTRAINT "ScreeningBatch_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreeningBatchCase" ADD CONSTRAINT "ScreeningBatchCase_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreeningBatchCase" ADD CONSTRAINT "ScreeningBatchCase_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ScreeningBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreeningBatchCase" ADD CONSTRAINT "ScreeningBatchCase_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

