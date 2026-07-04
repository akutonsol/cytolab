-- CreateEnum
CREATE TYPE "ReagentStatus" AS ENUM ('Active', 'Quarantined', 'Depleted', 'Expired', 'Recalled');

-- CreateTable
CREATE TABLE "ReagentLot" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "manufacturer" TEXT,
    "catalogNumber" TEXT,
    "lotNumber" TEXT NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "receivedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedDate" TIMESTAMP(3),
    "status" "ReagentStatus" NOT NULL DEFAULT 'Active',
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "storageTemp" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReagentLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReagentUsage" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "reagentLotId" TEXT NOT NULL,
    "recordId" TEXT,
    "batchId" TEXT,
    "usedById" TEXT NOT NULL,
    "quantityUsed" DOUBLE PRECISION,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "ReagentUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReagentLot_labId_status_idx" ON "ReagentLot"("labId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ReagentLot_labId_lotNumber_key" ON "ReagentLot"("labId", "lotNumber");

-- CreateIndex
CREATE INDEX "ReagentUsage_reagentLotId_idx" ON "ReagentUsage"("reagentLotId");

-- CreateIndex
CREATE INDEX "ReagentUsage_recordId_idx" ON "ReagentUsage"("recordId");

-- AddForeignKey
ALTER TABLE "ReagentLot" ADD CONSTRAINT "ReagentLot_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReagentLot" ADD CONSTRAINT "ReagentLot_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReagentUsage" ADD CONSTRAINT "ReagentUsage_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReagentUsage" ADD CONSTRAINT "ReagentUsage_reagentLotId_fkey" FOREIGN KEY ("reagentLotId") REFERENCES "ReagentLot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReagentUsage" ADD CONSTRAINT "ReagentUsage_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReagentUsage" ADD CONSTRAINT "ReagentUsage_usedById_fkey" FOREIGN KEY ("usedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

