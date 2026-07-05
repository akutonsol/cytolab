-- CreateEnum
CREATE TYPE "EMRSystem" AS ENUM ('Epic', 'Cerner', 'Meditech', 'Allscripts', 'Generic');

-- CreateEnum
CREATE TYPE "FHIRAuthType" AS ENUM ('Bearer', 'OAuth2', 'APIKey', 'None');

-- CreateEnum
CREATE TYPE "TransmissionStatus" AS ENUM ('Pending', 'Sending', 'Success', 'Failed', 'Retrying');

-- CreateTable
CREATE TABLE "FHIREndpoint" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "system" "EMRSystem" NOT NULL DEFAULT 'Epic',
    "authType" "FHIRAuthType" NOT NULL DEFAULT 'Bearer',
    "authToken" TEXT,
    "clientId" TEXT,
    "clientSecret" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSandbox" BOOLEAN NOT NULL DEFAULT true,
    "lastTestedAt" TIMESTAMP(3),
    "lastTestStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FHIREndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FHIRTransmission" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "status" "TransmissionStatus" NOT NULL DEFAULT 'Pending',
    "fhirResourceId" TEXT,
    "fhirPayload" JSONB NOT NULL,
    "responseCode" INTEGER,
    "responseBody" TEXT,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "transmittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FHIRTransmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FHIREndpoint_labId_idx" ON "FHIREndpoint"("labId");

-- CreateIndex
CREATE UNIQUE INDEX "FHIREndpoint_labId_name_key" ON "FHIREndpoint"("labId", "name");

-- CreateIndex
CREATE INDEX "FHIRTransmission_labId_status_idx" ON "FHIRTransmission"("labId", "status");

-- CreateIndex
CREATE INDEX "FHIRTransmission_recordId_idx" ON "FHIRTransmission"("recordId");

-- AddForeignKey
ALTER TABLE "FHIREndpoint" ADD CONSTRAINT "FHIREndpoint_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FHIRTransmission" ADD CONSTRAINT "FHIRTransmission_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FHIRTransmission" ADD CONSTRAINT "FHIRTransmission_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "FHIREndpoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FHIRTransmission" ADD CONSTRAINT "FHIRTransmission_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

