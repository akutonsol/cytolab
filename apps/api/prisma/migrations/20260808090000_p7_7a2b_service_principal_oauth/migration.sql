-- Program 7 · Phase 7A.2b — Service-Principal OAuth (ADDITIVE). 2 new tables
-- (ServicePrincipalCredential, ServicePrincipalScope) + 1 enum (ServiceCredentialStatus)
-- + 4 provenance FKs ALL ON DELETE RESTRICT. The frozen ServicePrincipal table is
-- UNCHANGED. Zero destructive statements. Touches no existing table DATA, the human login
-- path, tenancy, the clinical path, or AI evidence.

-- CreateEnum
CREATE TYPE "ServiceCredentialStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "ServicePrincipalCredential" (
    "id" TEXT NOT NULL,
    "credentialUuid" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "servicePrincipalId" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "status" "ServiceCredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "rotatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServicePrincipalCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServicePrincipalScope" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "servicePrincipalId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServicePrincipalScope_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServicePrincipalCredential_credentialUuid_key" ON "ServicePrincipalCredential"("credentialUuid");

-- CreateIndex
CREATE INDEX "ServicePrincipalCredential_labId_idx" ON "ServicePrincipalCredential"("labId");

-- CreateIndex
CREATE INDEX "ServicePrincipalCredential_labId_servicePrincipalId_idx" ON "ServicePrincipalCredential"("labId", "servicePrincipalId");

-- CreateIndex
CREATE INDEX "ServicePrincipalCredential_servicePrincipalId_idx" ON "ServicePrincipalCredential"("servicePrincipalId");

-- CreateIndex
CREATE INDEX "ServicePrincipalScope_labId_idx" ON "ServicePrincipalScope"("labId");

-- CreateIndex
CREATE INDEX "ServicePrincipalScope_servicePrincipalId_idx" ON "ServicePrincipalScope"("servicePrincipalId");

-- CreateIndex
CREATE UNIQUE INDEX "ServicePrincipalScope_labId_servicePrincipalId_permissionId_key" ON "ServicePrincipalScope"("labId", "servicePrincipalId", "permissionId");

-- AddForeignKey
ALTER TABLE "ServicePrincipalCredential" ADD CONSTRAINT "ServicePrincipalCredential_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePrincipalCredential" ADD CONSTRAINT "ServicePrincipalCredential_servicePrincipalId_fkey" FOREIGN KEY ("servicePrincipalId") REFERENCES "ServicePrincipal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePrincipalScope" ADD CONSTRAINT "ServicePrincipalScope_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePrincipalScope" ADD CONSTRAINT "ServicePrincipalScope_servicePrincipalId_fkey" FOREIGN KEY ("servicePrincipalId") REFERENCES "ServicePrincipal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePrincipalScope" ADD CONSTRAINT "ServicePrincipalScope_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

