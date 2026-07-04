-- CreateEnum
CREATE TYPE "RecallStatus" AS ENUM ('Pending', 'Due', 'Overdue', 'Completed', 'Cancelled', 'Declined');

-- CreateTable
CREATE TABLE "RecallRecord" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "triggerRecordId" TEXT NOT NULL,
    "triggerDiagnosis" TEXT NOT NULL,
    "triggerDate" TIMESTAMP(3) NOT NULL,
    "recallIntervalMonths" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "RecallStatus" NOT NULL DEFAULT 'Pending',
    "reminderSentAt" TIMESTAMP(3),
    "reminderSentById" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedRecordId" TEXT,
    "clientNotifiedAt" TIMESTAMP(3),
    "clientId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecallRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecallRecord_labId_dueDate_idx" ON "RecallRecord"("labId", "dueDate");

-- CreateIndex
CREATE INDEX "RecallRecord_patientId_idx" ON "RecallRecord"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "RecallRecord_labId_triggerRecordId_key" ON "RecallRecord"("labId", "triggerRecordId");

-- AddForeignKey
ALTER TABLE "RecallRecord" ADD CONSTRAINT "RecallRecord_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecallRecord" ADD CONSTRAINT "RecallRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecallRecord" ADD CONSTRAINT "RecallRecord_triggerRecordId_fkey" FOREIGN KEY ("triggerRecordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

