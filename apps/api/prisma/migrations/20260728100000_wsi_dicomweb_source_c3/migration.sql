-- CreateEnum
CREATE TYPE "DicomWebAuthType" AS ENUM ('BEARER', 'BASIC');

-- AlterTable
ALTER TABLE "IngestionSource" ADD COLUMN     "authType" "DicomWebAuthType",
ADD COLUMN     "credentialCipher" TEXT,
ADD COLUMN     "endpointBaseUrl" TEXT,
ALTER COLUMN "rootPath" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "IngestionSource_labId_endpointBaseUrl_key" ON "IngestionSource"("labId", "endpointBaseUrl");

