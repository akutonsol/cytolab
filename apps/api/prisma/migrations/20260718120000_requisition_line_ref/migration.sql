-- AlterTable
ALTER TABLE "RequisitionLine" ADD COLUMN     "referenceNo" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "RequisitionLine_labId_referenceNo_key" ON "RequisitionLine"("labId", "referenceNo");

