-- CreateEnum
CREATE TYPE "EscalationSeverity" AS ENUM ('Abnormal', 'HighGrade', 'Malignant');

-- CreateEnum
CREATE TYPE "EscalationTrigger" AS ENUM ('BethesdaClassification', 'NarrativeKeyword', 'ManualFlag');

-- CreateEnum
CREATE TYPE "EscalationStatus" AS ENUM ('Pending', 'Acknowledged', 'UnderReview', 'Resolved', 'Dismissed');

-- CreateTable
CREATE TABLE "EscalationRecord" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "severity" "EscalationSeverity" NOT NULL,
    "trigger" "EscalationTrigger" NOT NULL,
    "status" "EscalationStatus" NOT NULL DEFAULT 'Pending',
    "assignedToId" TEXT,
    "physicianNotifiedAt" TIMESTAMP(3),
    "physicianNotifiedVia" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EscalationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EscalationRecord_labId_status_idx" ON "EscalationRecord"("labId", "status");

-- CreateIndex
CREATE INDEX "EscalationRecord_recordId_idx" ON "EscalationRecord"("recordId");

-- AddForeignKey
ALTER TABLE "EscalationRecord" ADD CONSTRAINT "EscalationRecord_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalationRecord" ADD CONSTRAINT "EscalationRecord_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalationRecord" ADD CONSTRAINT "EscalationRecord_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalationRecord" ADD CONSTRAINT "EscalationRecord_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

