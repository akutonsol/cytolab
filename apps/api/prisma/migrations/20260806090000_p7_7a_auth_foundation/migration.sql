-- Program 7 · Phase 7A.1 — Enterprise Authentication foundation (ADDITIVE).
-- 3 new tables (IdentityProvider, ServicePrincipal, FederatedIdentity) + 1 enum
-- (IdentityProviderProtocol) + 5 provenance FKs, ALL ON DELETE RESTRICT. Zero
-- destructive statements; the only ALTER TABLEs add FK constraints on the NEW tables.
-- Lab-scoped; identity is a platform service. IdentityProvider + FederatedIdentity are
-- INERT until the 7A.2/7A.3 protocol adapters ship. Touches no existing table data, the
-- live login path, tenancy, the clinical path, or AI evidence.

-- CreateEnum
CREATE TYPE "IdentityProviderProtocol" AS ENUM ('OIDC', 'OAUTH', 'SAML');

-- CreateTable
CREATE TABLE "IdentityProvider" (
    "id" TEXT NOT NULL,
    "providerUuid" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "protocol" "IdentityProviderProtocol" NOT NULL,
    "issuer" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdentityProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServicePrincipal" (
    "id" TEXT NOT NULL,
    "principalUuid" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServicePrincipal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FederatedIdentity" (
    "id" TEXT NOT NULL,
    "federatedIdentityUuid" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "identityProviderId" TEXT NOT NULL,
    "externalSubject" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FederatedIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IdentityProvider_providerUuid_key" ON "IdentityProvider"("providerUuid");

-- CreateIndex
CREATE INDEX "IdentityProvider_labId_idx" ON "IdentityProvider"("labId");

-- CreateIndex
CREATE UNIQUE INDEX "IdentityProvider_labId_key_key" ON "IdentityProvider"("labId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ServicePrincipal_principalUuid_key" ON "ServicePrincipal"("principalUuid");

-- CreateIndex
CREATE INDEX "ServicePrincipal_labId_idx" ON "ServicePrincipal"("labId");

-- CreateIndex
CREATE UNIQUE INDEX "ServicePrincipal_labId_key_key" ON "ServicePrincipal"("labId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "FederatedIdentity_federatedIdentityUuid_key" ON "FederatedIdentity"("federatedIdentityUuid");

-- CreateIndex
CREATE INDEX "FederatedIdentity_labId_idx" ON "FederatedIdentity"("labId");

-- CreateIndex
CREATE INDEX "FederatedIdentity_userId_idx" ON "FederatedIdentity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FederatedIdentity_labId_identityProviderId_externalSubject_key" ON "FederatedIdentity"("labId", "identityProviderId", "externalSubject");

-- AddForeignKey
ALTER TABLE "IdentityProvider" ADD CONSTRAINT "IdentityProvider_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePrincipal" ADD CONSTRAINT "ServicePrincipal_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FederatedIdentity" ADD CONSTRAINT "FederatedIdentity_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FederatedIdentity" ADD CONSTRAINT "FederatedIdentity_identityProviderId_fkey" FOREIGN KEY ("identityProviderId") REFERENCES "IdentityProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FederatedIdentity" ADD CONSTRAINT "FederatedIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

