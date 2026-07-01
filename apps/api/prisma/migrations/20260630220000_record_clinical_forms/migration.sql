-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SpecimenType" ADD VALUE 'ENDOCERV_ASP';
ALTER TYPE "SpecimenType" ADD VALUE 'CERV_SCRAP';
ALTER TYPE "SpecimenType" ADD VALUE 'VAG_POOL';

-- AlterTable
ALTER TABLE "Record" ADD COLUMN     "doctor" TEXT,
ADD COLUMN     "formType" "RequisitionFormType",
ADD COLUMN     "specimenDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "GynClinicalFeatures" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "routineCheck" BOOLEAN NOT NULL DEFAULT false,
    "previousCytology" BOOLEAN NOT NULL DEFAULT false,
    "lmp" TIMESTAMP(3),
    "clinicalAppearanceOfCervix" TEXT,
    "nowPregnant" BOOLEAN NOT NULL DEFAULT false,
    "pregnancies" INTEGER,
    "leucorrhea" TEXT,
    "menopause" BOOLEAN NOT NULL DEFAULT false,
    "dateOfMenopause" TIMESTAMP(3),
    "lengthOfCycle" TEXT,
    "pelvicAbnormalities" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GynClinicalFeatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NonGynClinicalFeatures" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "sampleDescription" TEXT,
    "natureAndSource" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NonGynClinicalFeatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecimenImage" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "specimenId" TEXT NOT NULL,
    "storageUrl" TEXT NOT NULL,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpecimenImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GynClinicalFeatures_recordId_key" ON "GynClinicalFeatures"("recordId");

-- CreateIndex
CREATE INDEX "GynClinicalFeatures_labId_idx" ON "GynClinicalFeatures"("labId");

-- CreateIndex
CREATE UNIQUE INDEX "NonGynClinicalFeatures_recordId_key" ON "NonGynClinicalFeatures"("recordId");

-- CreateIndex
CREATE INDEX "NonGynClinicalFeatures_labId_idx" ON "NonGynClinicalFeatures"("labId");

-- CreateIndex
CREATE INDEX "SpecimenImage_labId_idx" ON "SpecimenImage"("labId");

-- CreateIndex
CREATE INDEX "SpecimenImage_specimenId_idx" ON "SpecimenImage"("specimenId");

-- CreateIndex
CREATE UNIQUE INDEX "Record_labId_labNumber_key" ON "Record"("labId", "labNumber");

-- AddForeignKey
ALTER TABLE "GynClinicalFeatures" ADD CONSTRAINT "GynClinicalFeatures_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GynClinicalFeatures" ADD CONSTRAINT "GynClinicalFeatures_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NonGynClinicalFeatures" ADD CONSTRAINT "NonGynClinicalFeatures_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NonGynClinicalFeatures" ADD CONSTRAINT "NonGynClinicalFeatures_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecimenImage" ADD CONSTRAINT "SpecimenImage_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecimenImage" ADD CONSTRAINT "SpecimenImage_specimenId_fkey" FOREIGN KEY ("specimenId") REFERENCES "Specimen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

