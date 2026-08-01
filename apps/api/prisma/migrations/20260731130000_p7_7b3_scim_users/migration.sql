-- Program 7 · Phase 7B.3 — SCIM Users. ADDITIVE ONLY: introduces the ScimUserMapping table
-- (external SCIM identifier -> canonical User.id) and NOTHING else. No existing table, column,
-- enum, or constraint is altered (the SCIM externalId lives here, never on User — GG7). All three
-- provenance FKs are ON DELETE RESTRICT. The row is immutable/append-only (no updatedAt column);
-- the two composite unique indexes enforce at most one mapping per (lab,user) and one active
-- binding per (lab,externalId). ProvisioningSource.SCIM already exists (reserved in 7B.1).

-- CreateTable
CREATE TABLE "ScimUserMapping" (
    "id" TEXT NOT NULL,
    "mappingUuid" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "servicePrincipalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScimUserMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScimUserMapping_mappingUuid_key" ON "ScimUserMapping"("mappingUuid");

-- CreateIndex
CREATE INDEX "ScimUserMapping_labId_idx" ON "ScimUserMapping"("labId");

-- CreateIndex
CREATE INDEX "ScimUserMapping_userId_idx" ON "ScimUserMapping"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ScimUserMapping_labId_userId_key" ON "ScimUserMapping"("labId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ScimUserMapping_labId_externalId_key" ON "ScimUserMapping"("labId", "externalId");

-- AddForeignKey
ALTER TABLE "ScimUserMapping" ADD CONSTRAINT "ScimUserMapping_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScimUserMapping" ADD CONSTRAINT "ScimUserMapping_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScimUserMapping" ADD CONSTRAINT "ScimUserMapping_servicePrincipalId_fkey" FOREIGN KEY ("servicePrincipalId") REFERENCES "ServicePrincipal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
