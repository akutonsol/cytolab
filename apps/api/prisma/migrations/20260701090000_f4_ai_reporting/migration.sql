-- CreateEnum
CREATE TYPE "RedactionPolicy" AS ENUM ('Strict', 'Standard');

-- CreateEnum
CREATE TYPE "AiDraftKind" AS ENUM ('Narrative', 'CodeSuggestion', 'ConsistencyCheck');

-- CreateEnum
CREATE TYPE "AiDraftStatus" AS ENUM ('Generated', 'Accepted', 'Rejected', 'Superseded');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ResultSheetEventType" ADD VALUE 'AiDrafted';
ALTER TYPE "ResultSheetEventType" ADD VALUE 'AiAccepted';

-- AlterTable
ALTER TABLE "ResultSheet" ADD COLUMN     "narrative" TEXT;

-- CreateTable
CREATE TABLE "LabAiSettings" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "houseStyle" TEXT,
    "redactionPolicy" "RedactionPolicy" NOT NULL DEFAULT 'Strict',
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabAiSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiDraft" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "resultSheetId" TEXT NOT NULL,
    "kind" "AiDraftKind" NOT NULL,
    "status" "AiDraftStatus" NOT NULL DEFAULT 'Generated',
    "output" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "redactionPolicy" "RedactionPolicy" NOT NULL,
    "inputDigest" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalText" TEXT,
    "editedDiff" JSONB,
    "acceptedAt" TIMESTAMP(3),
    "acceptedById" TEXT,

    CONSTRAINT "AiDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LabAiSettings_labId_key" ON "LabAiSettings"("labId");

-- CreateIndex
CREATE INDEX "AiDraft_labId_idx" ON "AiDraft"("labId");

-- CreateIndex
CREATE INDEX "AiDraft_resultSheetId_idx" ON "AiDraft"("resultSheetId");

-- AddForeignKey
ALTER TABLE "LabAiSettings" ADD CONSTRAINT "LabAiSettings_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiDraft" ADD CONSTRAINT "AiDraft_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiDraft" ADD CONSTRAINT "AiDraft_resultSheetId_fkey" FOREIGN KEY ("resultSheetId") REFERENCES "ResultSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiDraft" ADD CONSTRAINT "AiDraft_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiDraft" ADD CONSTRAINT "AiDraft_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

