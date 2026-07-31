-- Program 7 · Phase 7A.2a — OIDC federation schema (ADDITIVE). Adds the OidcAuthTransaction
-- table (short-lived single-use redirect state + config-immutability fingerprint; provider FK
-- ON DELETE RESTRICT) and two nullable OIDC public-client config columns on IdentityProvider
-- (clientId, redirectUri). Zero destructive statements. Touches no existing table DATA, the
-- live login path, tenancy, the clinical path, or AI evidence.

-- AlterTable
ALTER TABLE "IdentityProvider" ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "redirectUri" TEXT;

-- CreateTable
CREATE TABLE "OidcAuthTransaction" (
    "id" TEXT NOT NULL,
    "transactionUuid" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "identityProviderId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "pkceVerifier" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "expectedIssuer" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "configFingerprint" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OidcAuthTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OidcAuthTransaction_transactionUuid_key" ON "OidcAuthTransaction"("transactionUuid");

-- CreateIndex
CREATE INDEX "OidcAuthTransaction_labId_idx" ON "OidcAuthTransaction"("labId");

-- CreateIndex
CREATE INDEX "OidcAuthTransaction_identityProviderId_idx" ON "OidcAuthTransaction"("identityProviderId");

-- CreateIndex
CREATE UNIQUE INDEX "OidcAuthTransaction_labId_state_key" ON "OidcAuthTransaction"("labId", "state");

-- AddForeignKey
ALTER TABLE "OidcAuthTransaction" ADD CONSTRAINT "OidcAuthTransaction_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OidcAuthTransaction" ADD CONSTRAINT "OidcAuthTransaction_identityProviderId_fkey" FOREIGN KEY ("identityProviderId") REFERENCES "IdentityProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

