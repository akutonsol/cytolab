-- Program 6 · Phase 6D — explainability artifact architecture (assists, never asserts correctness).
-- ADDITIVE ONLY: two new enums + four new tables (ExplainabilityGeneration/Artifact/Region/Probability),
-- all provenance FKs ON DELETE RESTRICT. NO existing table is dropped or altered destructively (the only
-- ALTER TABLE statements add FKs to the new tables). Plain validated numeric coordinates — no raw-SQL-only
-- invariant (no partial/geometry index). References — never modifies — Program 5 / accepted 6A / 6B / 6C.

-- CreateEnum
CREATE TYPE "ExplainabilityArtifactKind" AS ENUM ('HEATMAP', 'ATTENTION_OVERLAY', 'FEATURE_REGION', 'PROBABILITY_DISTRIBUTION');

-- CreateEnum
CREATE TYPE "ExplainabilityRegionType" AS ENUM ('BOUNDING_BOX', 'POLYGON');

-- CreateTable
CREATE TABLE "ExplainabilityGeneration" (
    "id" TEXT NOT NULL,
    "generationUuid" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "inferenceRecordId" TEXT NOT NULL,
    "subjectSlideId" TEXT,
    "generatorId" TEXT NOT NULL,
    "generatorVersion" TEXT NOT NULL,
    "configDigest" TEXT,
    "validationOnly" BOOLEAN NOT NULL,
    "coordinateSpace" TEXT,
    "slideWidthPx" INTEGER,
    "slideHeightPx" INTEGER,
    "eventId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExplainabilityGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExplainabilityArtifact" (
    "id" TEXT NOT NULL,
    "artifactUuid" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "inferenceRecordId" TEXT NOT NULL,
    "kind" "ExplainabilityArtifactKind" NOT NULL,
    "generatorId" TEXT NOT NULL,
    "generatorVersion" TEXT NOT NULL,
    "configDigest" TEXT,
    "contentDigest" TEXT NOT NULL,
    "contentRef" TEXT,
    "validationOnly" BOOLEAN NOT NULL,
    "slideId" TEXT,
    "coordinateSpace" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExplainabilityArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExplainabilityRegion" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "regionType" "ExplainabilityRegionType" NOT NULL,
    "categoryCode" TEXT NOT NULL,
    "geometry" JSONB NOT NULL,
    "weight" DOUBLE PRECISION,
    "ordinal" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExplainabilityRegion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExplainabilityProbability" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "classCode" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExplainabilityProbability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExplainabilityGeneration_generationUuid_key" ON "ExplainabilityGeneration"("generationUuid");

-- CreateIndex
CREATE INDEX "ExplainabilityGeneration_labId_idx" ON "ExplainabilityGeneration"("labId");

-- CreateIndex
CREATE INDEX "ExplainabilityGeneration_labId_inferenceRecordId_idx" ON "ExplainabilityGeneration"("labId", "inferenceRecordId");

-- CreateIndex
CREATE INDEX "ExplainabilityGeneration_inferenceRecordId_idx" ON "ExplainabilityGeneration"("inferenceRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "ExplainabilityArtifact_artifactUuid_key" ON "ExplainabilityArtifact"("artifactUuid");

-- CreateIndex
CREATE INDEX "ExplainabilityArtifact_labId_idx" ON "ExplainabilityArtifact"("labId");

-- CreateIndex
CREATE INDEX "ExplainabilityArtifact_labId_generationId_idx" ON "ExplainabilityArtifact"("labId", "generationId");

-- CreateIndex
CREATE INDEX "ExplainabilityArtifact_labId_inferenceRecordId_idx" ON "ExplainabilityArtifact"("labId", "inferenceRecordId");

-- CreateIndex
CREATE INDEX "ExplainabilityArtifact_generationId_idx" ON "ExplainabilityArtifact"("generationId");

-- CreateIndex
CREATE INDEX "ExplainabilityRegion_labId_idx" ON "ExplainabilityRegion"("labId");

-- CreateIndex
CREATE INDEX "ExplainabilityRegion_labId_artifactId_idx" ON "ExplainabilityRegion"("labId", "artifactId");

-- CreateIndex
CREATE INDEX "ExplainabilityRegion_artifactId_idx" ON "ExplainabilityRegion"("artifactId");

-- CreateIndex
CREATE INDEX "ExplainabilityProbability_labId_idx" ON "ExplainabilityProbability"("labId");

-- CreateIndex
CREATE INDEX "ExplainabilityProbability_labId_artifactId_idx" ON "ExplainabilityProbability"("labId", "artifactId");

-- CreateIndex
CREATE INDEX "ExplainabilityProbability_artifactId_idx" ON "ExplainabilityProbability"("artifactId");

-- CreateIndex
CREATE UNIQUE INDEX "ExplainabilityProbability_labId_artifactId_classCode_key" ON "ExplainabilityProbability"("labId", "artifactId", "classCode");

-- AddForeignKey
ALTER TABLE "ExplainabilityGeneration" ADD CONSTRAINT "ExplainabilityGeneration_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExplainabilityGeneration" ADD CONSTRAINT "ExplainabilityGeneration_inferenceRecordId_fkey" FOREIGN KEY ("inferenceRecordId") REFERENCES "InferenceRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExplainabilityGeneration" ADD CONSTRAINT "ExplainabilityGeneration_subjectSlideId_fkey" FOREIGN KEY ("subjectSlideId") REFERENCES "DigitalSlide"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExplainabilityArtifact" ADD CONSTRAINT "ExplainabilityArtifact_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExplainabilityArtifact" ADD CONSTRAINT "ExplainabilityArtifact_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "ExplainabilityGeneration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExplainabilityArtifact" ADD CONSTRAINT "ExplainabilityArtifact_inferenceRecordId_fkey" FOREIGN KEY ("inferenceRecordId") REFERENCES "InferenceRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExplainabilityArtifact" ADD CONSTRAINT "ExplainabilityArtifact_slideId_fkey" FOREIGN KEY ("slideId") REFERENCES "DigitalSlide"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExplainabilityRegion" ADD CONSTRAINT "ExplainabilityRegion_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExplainabilityRegion" ADD CONSTRAINT "ExplainabilityRegion_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "ExplainabilityArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExplainabilityProbability" ADD CONSTRAINT "ExplainabilityProbability_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExplainabilityProbability" ADD CONSTRAINT "ExplainabilityProbability_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "ExplainabilityArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

