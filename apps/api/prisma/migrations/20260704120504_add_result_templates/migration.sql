-- CreateEnum
CREATE TYPE "TemplateCategory" AS ENUM ('Cervical', 'Endometrial', 'Respiratory', 'Urinary', 'Breast', 'Thyroid', 'Other');

-- CreateTable
CREATE TABLE "ResultTemplate" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "TemplateCategory" NOT NULL DEFAULT 'Cervical',
    "shortCode" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "specimenAdequacy" TEXT,
    "generalCategory" TEXT,
    "interpretation" TEXT,
    "recommendation" TEXT,
    "additionalNotes" TEXT,
    "findings" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResultTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResultTemplate_labId_idx" ON "ResultTemplate"("labId");

-- CreateIndex
CREATE INDEX "ResultTemplate_category_idx" ON "ResultTemplate"("category");

-- CreateIndex
CREATE UNIQUE INDEX "ResultTemplate_labId_name_key" ON "ResultTemplate"("labId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ResultTemplate_labId_shortCode_key" ON "ResultTemplate"("labId", "shortCode");

-- AddForeignKey
ALTER TABLE "ResultTemplate" ADD CONSTRAINT "ResultTemplate_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultTemplate" ADD CONSTRAINT "ResultTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

