-- Phase 3: Results & Coding
-- Cabinet, CodeSheet, CodeFinding, LabCode, ResultSheet, ResultEntry, ResultLine, Report.
-- Result sheet authorization (authorized/authorizedAt/authorizedById) gates report release.
-- All new tenant tables carry labId; Record gains an optional cabinetId.

-- AlterTable
ALTER TABLE "Record" ADD COLUMN     "cabinetId" TEXT;

-- CreateTable
CREATE TABLE "Cabinet" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "identifier" TEXT,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cabinet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeSheet" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "abbreviation" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodeSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeFinding" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "abbreviation" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodeFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabCode" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "region" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResultSheet" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "viewed" BOOLEAN NOT NULL DEFAULT false,
    "authorized" BOOLEAN NOT NULL DEFAULT false,
    "authorizedAt" TIMESTAMP(3),
    "authorizedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResultSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResultEntry" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "resultSheetId" TEXT NOT NULL,
    "specimenId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResultEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResultLine" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "resultEntryId" TEXT NOT NULL,
    "abbreviation" TEXT,
    "result" TEXT,
    "findings" TEXT,
    "abnormalFinding" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResultLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "resultSheetId" TEXT NOT NULL,
    "authorizerReference" TEXT,
    "content" TEXT,
    "signature" TEXT,
    "digitalSignature" TEXT,
    "medicalEntry" TEXT,
    "writtenById" TEXT,
    "releasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Cabinet_labId_idx" ON "Cabinet"("labId");

-- CreateIndex
CREATE INDEX "CodeSheet_labId_idx" ON "CodeSheet"("labId");

-- CreateIndex
CREATE INDEX "CodeFinding_labId_idx" ON "CodeFinding"("labId");

-- CreateIndex
CREATE INDEX "LabCode_labId_idx" ON "LabCode"("labId");

-- CreateIndex
CREATE INDEX "ResultSheet_labId_idx" ON "ResultSheet"("labId");

-- CreateIndex
CREATE INDEX "ResultSheet_recordId_idx" ON "ResultSheet"("recordId");

-- CreateIndex
CREATE INDEX "ResultEntry_labId_idx" ON "ResultEntry"("labId");

-- CreateIndex
CREATE INDEX "ResultEntry_resultSheetId_idx" ON "ResultEntry"("resultSheetId");

-- CreateIndex
CREATE INDEX "ResultLine_labId_idx" ON "ResultLine"("labId");

-- CreateIndex
CREATE INDEX "ResultLine_resultEntryId_idx" ON "ResultLine"("resultEntryId");

-- CreateIndex
CREATE INDEX "Report_labId_idx" ON "Report"("labId");

-- CreateIndex
CREATE INDEX "Report_resultSheetId_idx" ON "Report"("resultSheetId");

-- CreateIndex
CREATE INDEX "Record_cabinetId_idx" ON "Record"("cabinetId");

-- AddForeignKey
ALTER TABLE "Record" ADD CONSTRAINT "Record_cabinetId_fkey" FOREIGN KEY ("cabinetId") REFERENCES "Cabinet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cabinet" ADD CONSTRAINT "Cabinet_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeSheet" ADD CONSTRAINT "CodeSheet_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeFinding" ADD CONSTRAINT "CodeFinding_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabCode" ADD CONSTRAINT "LabCode_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultSheet" ADD CONSTRAINT "ResultSheet_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultSheet" ADD CONSTRAINT "ResultSheet_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultSheet" ADD CONSTRAINT "ResultSheet_authorizedById_fkey" FOREIGN KEY ("authorizedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultEntry" ADD CONSTRAINT "ResultEntry_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultEntry" ADD CONSTRAINT "ResultEntry_resultSheetId_fkey" FOREIGN KEY ("resultSheetId") REFERENCES "ResultSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultEntry" ADD CONSTRAINT "ResultEntry_specimenId_fkey" FOREIGN KEY ("specimenId") REFERENCES "Specimen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultLine" ADD CONSTRAINT "ResultLine_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultLine" ADD CONSTRAINT "ResultLine_resultEntryId_fkey" FOREIGN KEY ("resultEntryId") REFERENCES "ResultEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_resultSheetId_fkey" FOREIGN KEY ("resultSheetId") REFERENCES "ResultSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_writtenById_fkey" FOREIGN KEY ("writtenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

