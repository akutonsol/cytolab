-- AlterEnum
ALTER TYPE "FeatureKey" ADD VALUE 'CASE_ASSIGNMENT';

-- AlterTable
ALTER TABLE "Record" ADD COLUMN     "assignedAt" TIMESTAMP(3),
ADD COLUMN     "assignedById" TEXT,
ADD COLUMN     "assignedToId" TEXT;

-- CreateTable
CREATE TABLE "WorkloadTarget" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dailyTarget" INTEGER NOT NULL DEFAULT 20,
    "weeklyTarget" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "WorkloadTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkloadTarget_userId_key" ON "WorkloadTarget"("userId");

-- CreateIndex
CREATE INDEX "WorkloadTarget_labId_idx" ON "WorkloadTarget"("labId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkloadTarget_labId_userId_key" ON "WorkloadTarget"("labId", "userId");

-- AddForeignKey
ALTER TABLE "Record" ADD CONSTRAINT "Record_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkloadTarget" ADD CONSTRAINT "WorkloadTarget_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkloadTarget" ADD CONSTRAINT "WorkloadTarget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

