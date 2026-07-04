-- CreateEnum
CREATE TYPE "SpecimenAdequacy" AS ENUM ('Satisfactory', 'Unsatisfactory');

-- CreateEnum
CREATE TYPE "GeneralCategory" AS ENUM ('NILM', 'EpithelialAbnormality', 'OtherMalignancy');

-- CreateEnum
CREATE TYPE "SquamousCategory" AS ENUM ('ASC', 'LSIL', 'HSIL', 'SCC');

-- CreateEnum
CREATE TYPE "ASCSubtype" AS ENUM ('ASCUS', 'ASCH');

-- CreateEnum
CREATE TYPE "GlandularCategory" AS ENUM ('AGC', 'AGC_FavorNeoplastic', 'AIS', 'Adenocarcinoma', 'Other');

-- CreateEnum
CREATE TYPE "HPVResult" AS ENUM ('Positive', 'Negative', 'NotPerformed');

-- CreateEnum
CREATE TYPE "BethesdaRecommendation" AS ENUM ('RoutineScreening', 'RepeatIn1Year', 'HPVReflexTesting', 'Colposcopy', 'UrgentColposcopy', 'EndocervicalSampling', 'RepeatSpecimen', 'ClinicalCorrelation');

-- CreateTable
CREATE TABLE "BethesdaResult" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "specimenAdequacy" "SpecimenAdequacy" NOT NULL,
    "unsatisfactoryReason" TEXT,
    "generalCategory" "GeneralCategory",
    "organisms" TEXT[],
    "otherNonNeoplastic" TEXT[],
    "squamousCategory" "SquamousCategory",
    "ascSubtype" "ASCSubtype",
    "glandularCategory" "GlandularCategory",
    "glandularSubtype" TEXT,
    "otherMalignancy" TEXT,
    "hpvResult" "HPVResult",
    "hpvGenotype" TEXT,
    "recommendation" "BethesdaRecommendation",
    "recommendationNotes" TEXT,
    "generatedNarrative" TEXT,
    "reportedById" TEXT,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BethesdaResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BethesdaResult_recordId_key" ON "BethesdaResult"("recordId");

-- CreateIndex
CREATE INDEX "BethesdaResult_labId_idx" ON "BethesdaResult"("labId");

-- AddForeignKey
ALTER TABLE "BethesdaResult" ADD CONSTRAINT "BethesdaResult_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BethesdaResult" ADD CONSTRAINT "BethesdaResult_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BethesdaResult" ADD CONSTRAINT "BethesdaResult_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

