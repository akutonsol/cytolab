-- CreateEnum
CREATE TYPE "DatasetKind" AS ENUM ('VALIDATION', 'TRAINING_REFERENCE');

-- CreateEnum
CREATE TYPE "DatasetVersionState" AS ENUM ('DRAFT', 'FROZEN');

-- CreateEnum
CREATE TYPE "DatasetPurpose" AS ENUM ('ALGORITHM_VALIDATION', 'REGULATORY_SUBMISSION', 'INTERNAL_BENCHMARKING', 'CLINICAL_QA', 'RESEARCH', 'DEMONSTRATION');

-- CreateEnum
CREATE TYPE "DatasetSlideMembership" AS ENUM ('INCLUDED', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "AnnotationMethod" AS ENUM ('PATHOLOGIST_ASSERTED', 'CONSENSUS', 'IMPORTED');

-- CreateTable
CREATE TABLE "Dataset" (
    "id" TEXT NOT NULL,
    "datasetUuid" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "kind" "DatasetKind" NOT NULL,
    "description" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatasetVersion" (
    "id" TEXT NOT NULL,
    "versionUuid" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "state" "DatasetVersionState" NOT NULL DEFAULT 'DRAFT',
    "purpose" "DatasetPurpose" NOT NULL,
    "inclusionRules" JSONB,
    "manifestDigest" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "frozenAt" TIMESTAMP(3),

    CONSTRAINT "DatasetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatasetSlide" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "datasetVersionId" TEXT NOT NULL,
    "slideId" TEXT NOT NULL,
    "specimenId" TEXT,
    "membership" "DatasetSlideMembership" NOT NULL DEFAULT 'INCLUDED',
    "exclusionReason" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DatasetSlide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroundTruthLabel" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "datasetVersionId" TEXT NOT NULL,
    "slideId" TEXT NOT NULL,
    "labelSchemaKey" TEXT NOT NULL,
    "labelSchemaVersion" TEXT NOT NULL,
    "labelValue" TEXT NOT NULL,
    "assertedById" TEXT,
    "assertedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroundTruthLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnotationLineageEvent" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "groundTruthLabelId" TEXT NOT NULL,
    "method" "AnnotationMethod" NOT NULL,
    "actorId" TEXT,
    "sourceRef" TEXT,
    "eventId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnotationLineageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingDatasetReference" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "descriptor" TEXT NOT NULL,
    "provenanceUri" TEXT NOT NULL,
    "contentDigest" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingDatasetReference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Dataset_datasetUuid_key" ON "Dataset"("datasetUuid");

-- CreateIndex
CREATE INDEX "Dataset_labId_idx" ON "Dataset"("labId");

-- CreateIndex
CREATE UNIQUE INDEX "Dataset_labId_key_key" ON "Dataset"("labId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "DatasetVersion_versionUuid_key" ON "DatasetVersion"("versionUuid");

-- CreateIndex
CREATE INDEX "DatasetVersion_labId_idx" ON "DatasetVersion"("labId");

-- CreateIndex
CREATE INDEX "DatasetVersion_labId_datasetId_idx" ON "DatasetVersion"("labId", "datasetId");

-- CreateIndex
CREATE INDEX "DatasetVersion_datasetId_idx" ON "DatasetVersion"("datasetId");

-- CreateIndex
CREATE UNIQUE INDEX "DatasetVersion_labId_datasetId_versionNumber_key" ON "DatasetVersion"("labId", "datasetId", "versionNumber");

-- CreateIndex
CREATE INDEX "DatasetSlide_labId_idx" ON "DatasetSlide"("labId");

-- CreateIndex
CREATE INDEX "DatasetSlide_datasetVersionId_idx" ON "DatasetSlide"("datasetVersionId");

-- CreateIndex
CREATE INDEX "DatasetSlide_slideId_idx" ON "DatasetSlide"("slideId");

-- CreateIndex
CREATE UNIQUE INDEX "DatasetSlide_labId_datasetVersionId_slideId_key" ON "DatasetSlide"("labId", "datasetVersionId", "slideId");

-- CreateIndex
CREATE INDEX "GroundTruthLabel_labId_idx" ON "GroundTruthLabel"("labId");

-- CreateIndex
CREATE INDEX "GroundTruthLabel_datasetVersionId_idx" ON "GroundTruthLabel"("datasetVersionId");

-- CreateIndex
CREATE INDEX "GroundTruthLabel_slideId_idx" ON "GroundTruthLabel"("slideId");

-- CreateIndex
CREATE UNIQUE INDEX "GroundTruthLabel_labId_datasetVersionId_slideId_labelSchema_key" ON "GroundTruthLabel"("labId", "datasetVersionId", "slideId", "labelSchemaKey");

-- CreateIndex
CREATE INDEX "AnnotationLineageEvent_labId_idx" ON "AnnotationLineageEvent"("labId");

-- CreateIndex
CREATE INDEX "AnnotationLineageEvent_groundTruthLabelId_idx" ON "AnnotationLineageEvent"("groundTruthLabelId");

-- CreateIndex
CREATE INDEX "TrainingDatasetReference_labId_idx" ON "TrainingDatasetReference"("labId");

-- CreateIndex
CREATE INDEX "TrainingDatasetReference_datasetId_idx" ON "TrainingDatasetReference"("datasetId");

-- AddForeignKey
ALTER TABLE "Dataset" ADD CONSTRAINT "Dataset_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetVersion" ADD CONSTRAINT "DatasetVersion_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetVersion" ADD CONSTRAINT "DatasetVersion_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetSlide" ADD CONSTRAINT "DatasetSlide_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetSlide" ADD CONSTRAINT "DatasetSlide_datasetVersionId_fkey" FOREIGN KEY ("datasetVersionId") REFERENCES "DatasetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetSlide" ADD CONSTRAINT "DatasetSlide_slideId_fkey" FOREIGN KEY ("slideId") REFERENCES "DigitalSlide"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetSlide" ADD CONSTRAINT "DatasetSlide_specimenId_fkey" FOREIGN KEY ("specimenId") REFERENCES "Specimen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroundTruthLabel" ADD CONSTRAINT "GroundTruthLabel_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroundTruthLabel" ADD CONSTRAINT "GroundTruthLabel_datasetVersionId_fkey" FOREIGN KEY ("datasetVersionId") REFERENCES "DatasetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroundTruthLabel" ADD CONSTRAINT "GroundTruthLabel_slideId_fkey" FOREIGN KEY ("slideId") REFERENCES "DigitalSlide"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnotationLineageEvent" ADD CONSTRAINT "AnnotationLineageEvent_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnotationLineageEvent" ADD CONSTRAINT "AnnotationLineageEvent_groundTruthLabelId_fkey" FOREIGN KEY ("groundTruthLabelId") REFERENCES "GroundTruthLabel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingDatasetReference" ADD CONSTRAINT "TrainingDatasetReference_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingDatasetReference" ADD CONSTRAINT "TrainingDatasetReference_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

