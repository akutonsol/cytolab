-- CreateEnum
CREATE TYPE "AIScreenStatus" AS ENUM ('Pending', 'Processing', 'Completed', 'Failed', 'Skipped');

-- CreateEnum
CREATE TYPE "AIConfidence" AS ENUM ('High', 'Medium', 'Low');

-- CreateTable
CREATE TABLE "AIScreeningResult" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "status" "AIScreenStatus" NOT NULL DEFAULT 'Pending',
    "confidence" DOUBLE PRECISION,
    "confidenceLevel" "AIConfidence",
    "findings" JSONB,
    "primaryFinding" TEXT,
    "flaggedAreas" INTEGER NOT NULL DEFAULT 0,
    "agreedWithAI" BOOLEAN,
    "pathologistNote" TEXT,
    "processedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIScreeningResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AIScreeningResult_recordId_key" ON "AIScreeningResult"("recordId");

-- CreateIndex
CREATE INDEX "AIScreeningResult_labId_idx" ON "AIScreeningResult"("labId");

-- CreateIndex
CREATE INDEX "AIScreeningResult_labId_status_idx" ON "AIScreeningResult"("labId", "status");

-- AddForeignKey
ALTER TABLE "AIScreeningResult" ADD CONSTRAINT "AIScreeningResult_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIScreeningResult" ADD CONSTRAINT "AIScreeningResult_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIScreeningResult" ADD CONSTRAINT "AIScreeningResult_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

