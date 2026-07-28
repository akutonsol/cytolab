-- CreateEnum
CREATE TYPE "DicomConformanceStatus" AS ENUM ('VALID', 'UNSUPPORTED', 'NONCONFORMANT');

-- AlterEnum
ALTER TYPE "IngestionSourceKind" ADD VALUE 'DICOMWEB';

-- CreateTable
CREATE TABLE "SlideDicomMetadata" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "slideId" TEXT NOT NULL,
    "studyInstanceUID" TEXT NOT NULL,
    "seriesInstanceUID" TEXT NOT NULL,
    "representativeSopInstanceUID" TEXT,
    "sopClassUID" TEXT NOT NULL,
    "transferSyntaxUID" TEXT NOT NULL,
    "frameOfReferenceUID" TEXT,
    "totalPixelMatrixColumns" INTEGER,
    "totalPixelMatrixRows" INTEGER,
    "numberOfFrames" INTEGER,
    "frameColumns" INTEGER,
    "frameRows" INTEGER,
    "opticalPaths" JSONB,
    "containerIdentifier" TEXT,
    "conformanceStatus" "DicomConformanceStatus" NOT NULL,
    "conformanceReasons" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlideDicomMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SlideDicomMetadata_slideId_key" ON "SlideDicomMetadata"("slideId");

-- CreateIndex
CREATE INDEX "SlideDicomMetadata_labId_studyInstanceUID_idx" ON "SlideDicomMetadata"("labId", "studyInstanceUID");

-- CreateIndex
CREATE UNIQUE INDEX "SlideDicomMetadata_labId_studyInstanceUID_seriesInstanceUID_key" ON "SlideDicomMetadata"("labId", "studyInstanceUID", "seriesInstanceUID");

-- AddForeignKey
ALTER TABLE "SlideDicomMetadata" ADD CONSTRAINT "SlideDicomMetadata_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlideDicomMetadata" ADD CONSTRAINT "SlideDicomMetadata_slideId_fkey" FOREIGN KEY ("slideId") REFERENCES "DigitalSlide"("id") ON DELETE CASCADE ON UPDATE CASCADE;

