-- CreateEnum
CREATE TYPE "SamlCertificateStatus" AS ENUM ('ACTIVE', 'RETIRED');

-- AlterTable
ALTER TABLE "IdentityProvider" ADD COLUMN     "samlAcsUrl" TEXT,
ADD COLUMN     "samlIdpSsoUrl" TEXT,
ADD COLUMN     "samlNameIdFormat" TEXT,
ADD COLUMN     "samlSpEntityId" TEXT,
ADD COLUMN     "samlWantAssertionsSigned" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "SamlIdpCertificate" (
    "id" TEXT NOT NULL,
    "certificateUuid" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "identityProviderId" TEXT NOT NULL,
    "pemCertificate" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" "SamlCertificateStatus" NOT NULL DEFAULT 'ACTIVE',
    "notAfter" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SamlIdpCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SamlAuthRequest" (
    "id" TEXT NOT NULL,
    "samlAuthRequestUuid" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "identityProviderId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "relayState" TEXT NOT NULL,
    "expectedAcsUrl" TEXT NOT NULL,
    "configFingerprint" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SamlAuthRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SamlConsumedAssertion" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "identityProviderId" TEXT NOT NULL,
    "assertionId" TEXT NOT NULL,
    "notOnOrAfter" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SamlConsumedAssertion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SamlIdpCertificate_certificateUuid_key" ON "SamlIdpCertificate"("certificateUuid");

-- CreateIndex
CREATE INDEX "SamlIdpCertificate_labId_idx" ON "SamlIdpCertificate"("labId");

-- CreateIndex
CREATE INDEX "SamlIdpCertificate_labId_identityProviderId_status_idx" ON "SamlIdpCertificate"("labId", "identityProviderId", "status");

-- CreateIndex
CREATE INDEX "SamlIdpCertificate_identityProviderId_idx" ON "SamlIdpCertificate"("identityProviderId");

-- CreateIndex
CREATE UNIQUE INDEX "SamlIdpCertificate_labId_identityProviderId_fingerprint_key" ON "SamlIdpCertificate"("labId", "identityProviderId", "fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "SamlAuthRequest_samlAuthRequestUuid_key" ON "SamlAuthRequest"("samlAuthRequestUuid");

-- CreateIndex
CREATE INDEX "SamlAuthRequest_labId_idx" ON "SamlAuthRequest"("labId");

-- CreateIndex
CREATE INDEX "SamlAuthRequest_identityProviderId_idx" ON "SamlAuthRequest"("identityProviderId");

-- CreateIndex
CREATE INDEX "SamlAuthRequest_relayState_idx" ON "SamlAuthRequest"("relayState");

-- CreateIndex
CREATE UNIQUE INDEX "SamlAuthRequest_labId_requestId_key" ON "SamlAuthRequest"("labId", "requestId");

-- CreateIndex
CREATE INDEX "SamlConsumedAssertion_labId_idx" ON "SamlConsumedAssertion"("labId");

-- CreateIndex
CREATE INDEX "SamlConsumedAssertion_identityProviderId_idx" ON "SamlConsumedAssertion"("identityProviderId");

-- CreateIndex
CREATE UNIQUE INDEX "SamlConsumedAssertion_labId_identityProviderId_assertionId_key" ON "SamlConsumedAssertion"("labId", "identityProviderId", "assertionId");

-- AddForeignKey
ALTER TABLE "SamlIdpCertificate" ADD CONSTRAINT "SamlIdpCertificate_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SamlIdpCertificate" ADD CONSTRAINT "SamlIdpCertificate_identityProviderId_fkey" FOREIGN KEY ("identityProviderId") REFERENCES "IdentityProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SamlAuthRequest" ADD CONSTRAINT "SamlAuthRequest_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SamlAuthRequest" ADD CONSTRAINT "SamlAuthRequest_identityProviderId_fkey" FOREIGN KEY ("identityProviderId") REFERENCES "IdentityProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SamlConsumedAssertion" ADD CONSTRAINT "SamlConsumedAssertion_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SamlConsumedAssertion" ADD CONSTRAINT "SamlConsumedAssertion_identityProviderId_fkey" FOREIGN KEY ("identityProviderId") REFERENCES "IdentityProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

