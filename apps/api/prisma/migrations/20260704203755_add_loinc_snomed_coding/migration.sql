-- CreateEnum
CREATE TYPE "CodeSystem" AS ENUM ('LOINC', 'SNOMED_CT', 'ICD10', 'CPT');

-- CreateEnum
CREATE TYPE "CodingType" AS ENUM ('Procedure', 'Diagnosis', 'Specimen', 'Finding');

-- CreateTable
CREATE TABLE "MedicalCode" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "system" "CodeSystem" NOT NULL,
    "code" TEXT NOT NULL,
    "display" TEXT NOT NULL,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicalCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordCoding" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "codeId" TEXT NOT NULL,
    "codeType" "CodingType" NOT NULL,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "RecordCoding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MedicalCode_labId_system_idx" ON "MedicalCode"("labId", "system");

-- CreateIndex
CREATE UNIQUE INDEX "MedicalCode_labId_system_code_key" ON "MedicalCode"("labId", "system", "code");

-- CreateIndex
CREATE INDEX "RecordCoding_recordId_idx" ON "RecordCoding"("recordId");

-- CreateIndex
CREATE INDEX "RecordCoding_labId_idx" ON "RecordCoding"("labId");

-- CreateIndex
CREATE UNIQUE INDEX "RecordCoding_recordId_codeId_key" ON "RecordCoding"("recordId", "codeId");

-- AddForeignKey
ALTER TABLE "MedicalCode" ADD CONSTRAINT "MedicalCode_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordCoding" ADD CONSTRAINT "RecordCoding_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordCoding" ADD CONSTRAINT "RecordCoding_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordCoding" ADD CONSTRAINT "RecordCoding_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "MedicalCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordCoding" ADD CONSTRAINT "RecordCoding_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

