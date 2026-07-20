-- CreateEnum
CREATE TYPE "TenancyMode" AS ENUM ('POOL', 'SILO');

-- CreateEnum
CREATE TYPE "DomainStatus" AS ENUM ('PENDING', 'VERIFYING', 'ACTIVE', 'DISABLED');

-- AlterTable
ALTER TABLE "Lab" ADD COLUMN     "dataRegion" TEXT,
ADD COLUMN     "databaseSecretRef" TEXT,
ADD COLUMN     "migrationSecretRef" TEXT,
ADD COLUMN     "tenancyMode" "TenancyMode" NOT NULL DEFAULT 'POOL';

-- CreateTable
CREATE TABLE "LabDomain" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "status" "DomainStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabDomain_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LabDomain_hostname_key" ON "LabDomain"("hostname");

-- CreateIndex
CREATE INDEX "LabDomain_labId_idx" ON "LabDomain"("labId");

-- CreateIndex
CREATE INDEX "LabDomain_status_idx" ON "LabDomain"("status");

-- AddForeignKey
ALTER TABLE "LabDomain" ADD CONSTRAINT "LabDomain_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE CASCADE ON UPDATE CASCADE;

