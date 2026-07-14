-- CreateEnum
CREATE TYPE "AncillaryKind" AS ENUM ('IHC', 'SpecialStain', 'Molecular', 'Cytochemistry', 'Other');

-- CreateEnum
CREATE TYPE "AncillaryStatus" AS ENUM ('Ordered', 'InProcess', 'Completed', 'Cancelled');

-- CreateTable
CREATE TABLE "AncillaryOrder" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "kind" "AncillaryKind" NOT NULL,
    "target" TEXT NOT NULL,
    "status" "AncillaryStatus" NOT NULL DEFAULT 'Ordered',
    "blocksSignOut" BOOLEAN NOT NULL DEFAULT true,
    "orderedById" TEXT,
    "orderedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "AncillaryOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AncillaryOrder_labId_status_idx" ON "AncillaryOrder"("labId", "status");

-- CreateIndex
CREATE INDEX "AncillaryOrder_recordId_idx" ON "AncillaryOrder"("recordId");

-- AddForeignKey
ALTER TABLE "AncillaryOrder" ADD CONSTRAINT "AncillaryOrder_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AncillaryOrder" ADD CONSTRAINT "AncillaryOrder_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;
