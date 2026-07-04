-- CreateEnum
CREATE TYPE "ProfTestType" AS ENUM ('Internal', 'CAP', 'CLIA', 'External');

-- CreateEnum
CREATE TYPE "ProfTestStatus" AS ENUM ('Draft', 'Active', 'Grading', 'Completed', 'Archived');

-- CreateEnum
CREATE TYPE "CaseDifficulty" AS ENUM ('Easy', 'Standard', 'Difficult', 'Expert');

-- CreateEnum
CREATE TYPE "ConfidenceLevel" AS ENUM ('Low', 'Moderate', 'High');

-- CreateTable
CREATE TABLE "ProficiencyTest" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "testType" "ProfTestType" NOT NULL DEFAULT 'Internal',
    "status" "ProfTestStatus" NOT NULL DEFAULT 'Draft',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "passingScore" INTEGER NOT NULL DEFAULT 80,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProficiencyTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProficiencyCase" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "caseNumber" INTEGER NOT NULL,
    "specimenType" TEXT NOT NULL,
    "clinicalHistory" TEXT,
    "imageUrl" TEXT,
    "expectedDiagnosis" TEXT NOT NULL,
    "expectedBethesda" TEXT,
    "difficulty" "CaseDifficulty" NOT NULL DEFAULT 'Standard',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProficiencyCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProficiencyResponse" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "responderId" TEXT NOT NULL,
    "diagnosis" TEXT NOT NULL,
    "bethesdaAnswer" TEXT,
    "confidence" "ConfidenceLevel" NOT NULL DEFAULT 'Moderate',
    "notes" TEXT,
    "isCorrect" BOOLEAN,
    "score" INTEGER,
    "gradedAt" TIMESTAMP(3),
    "gradedById" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProficiencyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProficiencyTest_labId_name_key" ON "ProficiencyTest"("labId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ProficiencyResponse_caseId_responderId_key" ON "ProficiencyResponse"("caseId", "responderId");

-- AddForeignKey
ALTER TABLE "ProficiencyTest" ADD CONSTRAINT "ProficiencyTest_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProficiencyTest" ADD CONSTRAINT "ProficiencyTest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProficiencyCase" ADD CONSTRAINT "ProficiencyCase_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProficiencyCase" ADD CONSTRAINT "ProficiencyCase_testId_fkey" FOREIGN KEY ("testId") REFERENCES "ProficiencyTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProficiencyResponse" ADD CONSTRAINT "ProficiencyResponse_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProficiencyResponse" ADD CONSTRAINT "ProficiencyResponse_testId_fkey" FOREIGN KEY ("testId") REFERENCES "ProficiencyTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProficiencyResponse" ADD CONSTRAINT "ProficiencyResponse_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ProficiencyCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProficiencyResponse" ADD CONSTRAINT "ProficiencyResponse_responderId_fkey" FOREIGN KEY ("responderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

