-- CreateEnum
CREATE TYPE "QCCheckType" AS ENUM ('SlidePreparation', 'StainingQuality', 'FixationAdequacy', 'CellularityCheck', 'EquipmentCalibration', 'ReagentCheck', 'ExternalQC');

-- CreateEnum
CREATE TYPE "QCResult" AS ENUM ('Pass', 'Fail', 'Marginal');

-- CreateEnum
CREATE TYPE "EquipmentType" AS ENUM ('Stainer', 'Centrifuge', 'Microscope', 'Processor', 'Scanner', 'Other');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('Open', 'Acknowledged', 'Resolved');

-- CreateTable
CREATE TABLE "QCCheck" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "recordId" TEXT,
    "checkType" "QCCheckType" NOT NULL,
    "result" "QCResult" NOT NULL,
    "performedById" TEXT NOT NULL,
    "equipmentId" TEXT,
    "batchId" TEXT,
    "notes" TEXT,
    "failureReason" TEXT,
    "correctiveAction" TEXT,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QCCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "EquipmentType" NOT NULL,
    "serialNumber" TEXT,
    "lastServiceDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QCFailureAlert" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "qcCheckId" TEXT NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'Open',
    "assignedToId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QCFailureAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QCCheck_labId_performedAt_idx" ON "QCCheck"("labId", "performedAt");

-- CreateIndex
CREATE INDEX "QCCheck_recordId_idx" ON "QCCheck"("recordId");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_labId_name_key" ON "Equipment"("labId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "QCFailureAlert_qcCheckId_key" ON "QCFailureAlert"("qcCheckId");

-- CreateIndex
CREATE INDEX "QCFailureAlert_labId_status_idx" ON "QCFailureAlert"("labId", "status");

-- AddForeignKey
ALTER TABLE "QCCheck" ADD CONSTRAINT "QCCheck_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QCCheck" ADD CONSTRAINT "QCCheck_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QCCheck" ADD CONSTRAINT "QCCheck_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QCCheck" ADD CONSTRAINT "QCCheck_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QCFailureAlert" ADD CONSTRAINT "QCFailureAlert_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QCFailureAlert" ADD CONSTRAINT "QCFailureAlert_qcCheckId_fkey" FOREIGN KEY ("qcCheckId") REFERENCES "QCCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

