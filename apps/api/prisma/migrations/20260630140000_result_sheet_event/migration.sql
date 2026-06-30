-- Phase 3 follow-up: append-only ResultSheetEvent audit log
-- Records authorize / de-authorize (on edit) / re-authorize with userId + timestamp.

-- CreateEnum
CREATE TYPE "ResultSheetEventType" AS ENUM ('Authorized', 'Deauthorized', 'Reauthorized');

-- CreateTable
CREATE TABLE "ResultSheetEvent" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "resultSheetId" TEXT NOT NULL,
    "type" "ResultSheetEventType" NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResultSheetEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResultSheetEvent_labId_idx" ON "ResultSheetEvent"("labId");

-- CreateIndex
CREATE INDEX "ResultSheetEvent_resultSheetId_idx" ON "ResultSheetEvent"("resultSheetId");

-- CreateIndex
CREATE INDEX "ResultSheetEvent_resultSheetId_createdAt_idx" ON "ResultSheetEvent"("resultSheetId", "createdAt");

-- AddForeignKey
ALTER TABLE "ResultSheetEvent" ADD CONSTRAINT "ResultSheetEvent_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultSheetEvent" ADD CONSTRAINT "ResultSheetEvent_resultSheetId_fkey" FOREIGN KEY ("resultSheetId") REFERENCES "ResultSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultSheetEvent" ADD CONSTRAINT "ResultSheetEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

