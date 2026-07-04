-- CreateEnum
CREATE TYPE "TrackingStage" AS ENUM ('Pending', 'FormReceived', 'BenchReceived', 'Verified', 'Processing', 'Filed', 'Rejected');

-- CreateEnum
CREATE TYPE "FormCondition" AS ENUM ('Good', 'Damaged', 'Incomplete', 'Illegible');

-- CreateTable
CREATE TABLE "RequisitionTracking" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "formReceivedAt" TIMESTAMP(3),
    "formReceivedById" TEXT,
    "formCondition" "FormCondition" NOT NULL DEFAULT 'Good',
    "formConditionNotes" TEXT,
    "benchReceivedAt" TIMESTAMP(3),
    "benchReceivedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "verificationNotes" TEXT,
    "filedAt" TIMESTAMP(3),
    "filedById" TEXT,
    "fileLocation" TEXT,
    "barcodeScanned" BOOLEAN NOT NULL DEFAULT false,
    "barcodeValue" TEXT,
    "currentStage" "TrackingStage" NOT NULL DEFAULT 'Pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequisitionTracking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackingEvent" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "stage" "TrackingStage" NOT NULL,
    "performedById" TEXT NOT NULL,
    "notes" TEXT,
    "scannedBarcode" TEXT,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RequisitionTracking_requisitionId_key" ON "RequisitionTracking"("requisitionId");

-- CreateIndex
CREATE INDEX "RequisitionTracking_labId_currentStage_idx" ON "RequisitionTracking"("labId", "currentStage");

-- CreateIndex
CREATE INDEX "TrackingEvent_requisitionId_idx" ON "TrackingEvent"("requisitionId");

-- CreateIndex
CREATE INDEX "TrackingEvent_labId_performedAt_idx" ON "TrackingEvent"("labId", "performedAt");

-- AddForeignKey
ALTER TABLE "RequisitionTracking" ADD CONSTRAINT "RequisitionTracking_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitionTracking" ADD CONSTRAINT "RequisitionTracking_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "Requisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitionTracking" ADD CONSTRAINT "RequisitionTracking_formReceivedById_fkey" FOREIGN KEY ("formReceivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitionTracking" ADD CONSTRAINT "RequisitionTracking_benchReceivedById_fkey" FOREIGN KEY ("benchReceivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitionTracking" ADD CONSTRAINT "RequisitionTracking_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitionTracking" ADD CONSTRAINT "RequisitionTracking_filedById_fkey" FOREIGN KEY ("filedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingEvent" ADD CONSTRAINT "TrackingEvent_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingEvent" ADD CONSTRAINT "TrackingEvent_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "Requisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingEvent" ADD CONSTRAINT "TrackingEvent_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

