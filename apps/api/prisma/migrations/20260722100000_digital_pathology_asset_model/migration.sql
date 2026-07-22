-- CreateEnum
CREATE TYPE "SlideAvailabilityStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "IngestionStatus" AS ENUM ('UPLOADING', 'UPLOADED', 'VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "ProcessingJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT');

-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('PROCESSING', 'QC_PENDING', 'QC_FAILED', 'READY', 'PUBLISHED', 'SUPERSEDED', 'ARCHIVED', 'FAILED');

-- CreateEnum
CREATE TYPE "TileSourceType" AS ENUM ('IMAGE', 'DZI', 'IIIF', 'DICOMWEB');

-- CreateEnum
CREATE TYPE "SlideSourceKind" AS ENUM ('EXTERNAL_URL', 'UPLOAD', 'WATCH_FOLDER', 'SCANNER', 'DICOM');

-- CreateEnum
CREATE TYPE "SlideAssetRole" AS ENUM ('DZI_DESCRIPTOR', 'TILE_PYRAMID', 'LABEL', 'MACRO', 'THUMBNAIL');

-- AlterTable
ALTER TABLE "DigitalSlide" ADD COLUMN     "availabilityStatus" "SlideAvailabilityStatus",
ADD COLUMN     "mpp" DOUBLE PRECISION,
ADD COLUMN     "objectivePower" DOUBLE PRECISION,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "publishedById" TEXT,
ADD COLUMN     "publishedGenerationId" TEXT,
ADD COLUMN     "sourceHeight" INTEGER,
ADD COLUMN     "sourceKind" "SlideSourceKind",
ADD COLUMN     "sourceWidth" INTEGER,
ADD COLUMN     "specimenId" TEXT,
ADD COLUMN     "storageKey" TEXT,
ADD COLUMN     "tileSourceType" "TileSourceType";

-- CreateTable
CREATE TABLE "SlideIngestion" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "slideId" TEXT NOT NULL,
    "sourceKind" "SlideSourceKind" NOT NULL,
    "status" "IngestionStatus" NOT NULL DEFAULT 'UPLOADING',
    "sourceChecksum" TEXT,
    "sourceObjectKey" TEXT,
    "originalFilename" TEXT,
    "sizeBytes" INTEGER,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlideIngestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlideProcessingJob" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "ingestionId" TEXT NOT NULL,
    "status" "ProcessingJobStatus" NOT NULL DEFAULT 'QUEUED',
    "idempotencyKey" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorDetail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlideProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DerivativeGeneration" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "slideId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" "GenerationStatus" NOT NULL DEFAULT 'PROCESSING',
    "tileSourceType" "TileSourceType" NOT NULL,
    "tiledWidth" INTEGER,
    "tiledHeight" INTEGER,
    "tileSize" INTEGER,
    "levelCount" INTEGER,
    "derivativeManifestChecksum" TEXT,
    "sealed" BOOLEAN NOT NULL DEFAULT false,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "sealedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DerivativeGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlideAsset" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "role" "SlideAssetRole" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "checksum" TEXT,
    "sizeBytes" INTEGER,
    "purgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlideAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SlideIngestion_labId_idx" ON "SlideIngestion"("labId");

-- CreateIndex
CREATE INDEX "SlideIngestion_slideId_idx" ON "SlideIngestion"("slideId");

-- CreateIndex
CREATE INDEX "SlideIngestion_labId_sourceChecksum_idx" ON "SlideIngestion"("labId", "sourceChecksum");

-- CreateIndex
CREATE INDEX "SlideProcessingJob_labId_idx" ON "SlideProcessingJob"("labId");

-- CreateIndex
CREATE INDEX "SlideProcessingJob_ingestionId_idx" ON "SlideProcessingJob"("ingestionId");

-- CreateIndex
CREATE INDEX "SlideProcessingJob_labId_status_idx" ON "SlideProcessingJob"("labId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SlideProcessingJob_labId_idempotencyKey_key" ON "SlideProcessingJob"("labId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "DerivativeGeneration_jobId_key" ON "DerivativeGeneration"("jobId");

-- CreateIndex
CREATE INDEX "DerivativeGeneration_labId_idx" ON "DerivativeGeneration"("labId");

-- CreateIndex
CREATE INDEX "DerivativeGeneration_slideId_idx" ON "DerivativeGeneration"("slideId");

-- CreateIndex
CREATE INDEX "DerivativeGeneration_slideId_status_idx" ON "DerivativeGeneration"("slideId", "status");

-- CreateIndex
CREATE INDEX "SlideAsset_labId_idx" ON "SlideAsset"("labId");

-- CreateIndex
CREATE INDEX "SlideAsset_generationId_idx" ON "SlideAsset"("generationId");

-- CreateIndex
CREATE INDEX "SlideAsset_generationId_role_idx" ON "SlideAsset"("generationId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "DigitalSlide_publishedGenerationId_key" ON "DigitalSlide"("publishedGenerationId");

-- CreateIndex
CREATE INDEX "DigitalSlide_specimenId_idx" ON "DigitalSlide"("specimenId");

-- CreateIndex
CREATE INDEX "DigitalSlide_labId_availabilityStatus_idx" ON "DigitalSlide"("labId", "availabilityStatus");

-- CreateIndex
CREATE INDEX "DigitalSlide_labId_publishedGenerationId_idx" ON "DigitalSlide"("labId", "publishedGenerationId");

-- AddForeignKey
ALTER TABLE "DigitalSlide" ADD CONSTRAINT "DigitalSlide_specimenId_fkey" FOREIGN KEY ("specimenId") REFERENCES "Specimen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigitalSlide" ADD CONSTRAINT "DigitalSlide_publishedGenerationId_fkey" FOREIGN KEY ("publishedGenerationId") REFERENCES "DerivativeGeneration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlideIngestion" ADD CONSTRAINT "SlideIngestion_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlideIngestion" ADD CONSTRAINT "SlideIngestion_slideId_fkey" FOREIGN KEY ("slideId") REFERENCES "DigitalSlide"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlideProcessingJob" ADD CONSTRAINT "SlideProcessingJob_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlideProcessingJob" ADD CONSTRAINT "SlideProcessingJob_ingestionId_fkey" FOREIGN KEY ("ingestionId") REFERENCES "SlideIngestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DerivativeGeneration" ADD CONSTRAINT "DerivativeGeneration_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DerivativeGeneration" ADD CONSTRAINT "DerivativeGeneration_slideId_fkey" FOREIGN KEY ("slideId") REFERENCES "DigitalSlide"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DerivativeGeneration" ADD CONSTRAINT "DerivativeGeneration_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "SlideProcessingJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlideAsset" ADD CONSTRAINT "SlideAsset_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlideAsset" ADD CONSTRAINT "SlideAsset_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "DerivativeGeneration"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- P5-1A: enforce "at most one PUBLISHED derivative generation per slide" (invariant #4).
-- Prisma cannot express a partial (WHERE) unique index, so it is added here by hand. The
-- DerivativeGeneration table is created empty above, so this lands safely in the same migration.
CREATE UNIQUE INDEX "DerivativeGeneration_slideId_published_key"
  ON "DerivativeGeneration" ("slideId")
  WHERE "status" = 'PUBLISHED';
