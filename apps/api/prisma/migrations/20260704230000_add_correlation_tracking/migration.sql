-- CreateEnum
CREATE TYPE "HistologySource" AS ENUM ('Internal', 'External', 'Unknown');

-- CreateEnum
CREATE TYPE "CorrelationResult" AS ENUM ('Concordant', 'MinorDiscordant', 'MajorDiscordant', 'Unresolved');

-- CreateTable
CREATE TABLE "CorrelationCase" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "cytologyRecordId" TEXT NOT NULL,
    "cytologyDate" TIMESTAMP(3) NOT NULL,
    "cytologyDiagnosis" TEXT NOT NULL,
    "cytologyBethesdaId" TEXT,
    "histologyRecordId" TEXT,
    "histologyDate" TIMESTAMP(3),
    "histologyDiagnosis" TEXT,
    "histologySource" "HistologySource" NOT NULL DEFAULT 'Internal',
    "externalLabName" TEXT,
    "correlationResult" "CorrelationResult",
    "discordanceReason" TEXT,
    "reviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "clinicalOutcome" TEXT,
    "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CorrelationCase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CorrelationCase_labId_cytologyDate_idx" ON "CorrelationCase"("labId", "cytologyDate");

-- CreateIndex
CREATE INDEX "CorrelationCase_patientId_idx" ON "CorrelationCase"("patientId");

-- AddForeignKey
ALTER TABLE "CorrelationCase" ADD CONSTRAINT "CorrelationCase_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrelationCase" ADD CONSTRAINT "CorrelationCase_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrelationCase" ADD CONSTRAINT "CorrelationCase_cytologyRecordId_fkey" FOREIGN KEY ("cytologyRecordId") REFERENCES "Record"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrelationCase" ADD CONSTRAINT "CorrelationCase_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrelationCase" ADD CONSTRAINT "CorrelationCase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

