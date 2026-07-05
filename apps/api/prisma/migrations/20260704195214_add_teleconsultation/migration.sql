-- CreateEnum
CREATE TYPE "ConsultUrgency" AS ENUM ('Routine', 'Priority', 'Urgent');

-- CreateEnum
CREATE TYPE "ConsultStatus" AS ENUM ('Pending', 'Viewed', 'InProgress', 'Responded', 'Accepted', 'Declined', 'Expired');

-- CreateEnum
CREATE TYPE "ConsultAgreement" AS ENUM ('FullAgreement', 'PartialAgreement', 'Disagreement');

-- CreateTable
CREATE TABLE "ConsultRequest" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "consultantName" TEXT NOT NULL,
    "consultantEmail" TEXT NOT NULL,
    "consultantInstitution" TEXT,
    "clinicalSummary" TEXT NOT NULL,
    "specificQuestion" TEXT NOT NULL,
    "urgency" "ConsultUrgency" NOT NULL DEFAULT 'Routine',
    "sharedNarrative" BOOLEAN NOT NULL DEFAULT true,
    "sharedBethesda" BOOLEAN NOT NULL DEFAULT true,
    "sharedImages" BOOLEAN NOT NULL DEFAULT false,
    "status" "ConsultStatus" NOT NULL DEFAULT 'Pending',
    "consultantResponse" TEXT,
    "consultantDiagnosis" TEXT,
    "agreementLevel" "ConsultAgreement",
    "respondedAt" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConsultRequest_accessToken_key" ON "ConsultRequest"("accessToken");

-- CreateIndex
CREATE INDEX "ConsultRequest_labId_status_idx" ON "ConsultRequest"("labId", "status");

-- CreateIndex
CREATE INDEX "ConsultRequest_recordId_idx" ON "ConsultRequest"("recordId");

-- AddForeignKey
ALTER TABLE "ConsultRequest" ADD CONSTRAINT "ConsultRequest_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultRequest" ADD CONSTRAINT "ConsultRequest_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultRequest" ADD CONSTRAINT "ConsultRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

