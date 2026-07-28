-- CreateEnum
CREATE TYPE "IngestionAdapterType" AS ENUM ('FILESYSTEM_IMAGE', 'FILESYSTEM_DICOM', 'DICOMWEB');

-- AlterTable
ALTER TABLE "IngestionSource" ADD COLUMN     "adapterType" "IngestionAdapterType";

