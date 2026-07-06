-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('DRAFT', 'PENDING_PAYMENT', 'PAID', 'SUBMITTED', 'PROCESSING', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CARD', 'BANK_TRANSFER', 'CHEQUE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('UPLOADING', 'PROCESSING', 'EXTRACTED', 'NEEDS_REVIEW', 'CONFIRMED');

-- CreateTable
CREATE TABLE "RequisitionBatch" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'DRAFT',
    "totalForms" INTEGER NOT NULL DEFAULT 0,
    "totalAmountCents" INTEGER NOT NULL DEFAULT 0,
    "paymentMethod" "PaymentMethod",
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paymentRef" TEXT,
    "paymentPaidAt" TIMESTAMP(3),
    "notes" TEXT,
    "manifestUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "RequisitionBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DigitalRequisitionForm" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "clientId" TEXT,
    "batchId" TEXT NOT NULL,
    "formNumber" INTEGER NOT NULL,
    "scanStatus" "ScanStatus",
    "rawScanUrl" TEXT,
    "extractedData" JSONB,
    "ocrConfidence" DOUBLE PRECISION,
    "patientName" TEXT,
    "patientDob" TIMESTAMP(3),
    "hospRegNumber" TEXT,
    "doctorName" TEXT,
    "doctorAddress" TEXT,
    "specimenDate" TIMESTAMP(3),
    "specimenType" TEXT,
    "routineCheck" BOOLEAN,
    "lmp" TEXT,
    "lengthOfCycle" TEXT,
    "abnormalBleeding" BOOLEAN,
    "leucorrhoea" BOOLEAN,
    "specialType" TEXT,
    "noPregnancies" TEXT,
    "nowPregnant" BOOLEAN,
    "menopauseDate" TIMESTAMP(3),
    "clinicalAppearance" TEXT,
    "pelvicAbnormalities" TEXT,
    "otherClinicalData" TEXT,
    "clinicalDiagnosis" TEXT,
    "previousCytology" BOOLEAN,
    "hormone" TEXT,
    "radiation" TEXT,
    "surgical" TEXT,
    "otherTherapy" TEXT,
    "signatureDataUrl" TEXT,
    "signedAt" TIMESTAMP(3),
    "signedByName" TEXT,
    "accessionNumber" TEXT,
    "requisitionId" TEXT,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DigitalRequisitionForm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RequisitionBatch_batchNumber_key" ON "RequisitionBatch"("batchNumber");

-- CreateIndex
CREATE INDEX "RequisitionBatch_labId_status_idx" ON "RequisitionBatch"("labId", "status");

-- CreateIndex
CREATE INDEX "RequisitionBatch_clientId_idx" ON "RequisitionBatch"("clientId");

-- CreateIndex
CREATE INDEX "DigitalRequisitionForm_labId_batchId_idx" ON "DigitalRequisitionForm"("labId", "batchId");

-- CreateIndex
CREATE INDEX "DigitalRequisitionForm_clientId_idx" ON "DigitalRequisitionForm"("clientId");

-- AddForeignKey
ALTER TABLE "RequisitionBatch" ADD CONSTRAINT "RequisitionBatch_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitionBatch" ADD CONSTRAINT "RequisitionBatch_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigitalRequisitionForm" ADD CONSTRAINT "DigitalRequisitionForm_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigitalRequisitionForm" ADD CONSTRAINT "DigitalRequisitionForm_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigitalRequisitionForm" ADD CONSTRAINT "DigitalRequisitionForm_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "RequisitionBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

