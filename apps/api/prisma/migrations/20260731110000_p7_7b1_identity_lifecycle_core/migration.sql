-- CreateEnum
CREATE TYPE "UserLifecycleState" AS ENUM ('INVITED', 'PROVISIONED', 'ACTIVE', 'SUSPENDED', 'DEPROVISIONED');

-- CreateEnum
CREATE TYPE "ProvisioningSource" AS ENUM ('MANUAL', 'INVITATION', 'SCIM', 'JIT');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deprovisionedAt" TIMESTAMP(3),
ADD COLUMN     "lifecycleState" "UserLifecycleState" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "lifecycleUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "originProvisioningSource" "ProvisioningSource" NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "FederatedIdentity" ADD COLUMN     "deactivatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "IdentityLifecycleEvent" (
    "id" TEXT NOT NULL,
    "eventUuid" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromState" "UserLifecycleState",
    "toState" "UserLifecycleState" NOT NULL,
    "reason" TEXT,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdentityLifecycleEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IdentityLifecycleEvent_eventUuid_key" ON "IdentityLifecycleEvent"("eventUuid");

-- CreateIndex
CREATE INDEX "IdentityLifecycleEvent_labId_idx" ON "IdentityLifecycleEvent"("labId");

-- CreateIndex
CREATE INDEX "IdentityLifecycleEvent_labId_userId_idx" ON "IdentityLifecycleEvent"("labId", "userId");

-- CreateIndex
CREATE INDEX "IdentityLifecycleEvent_userId_idx" ON "IdentityLifecycleEvent"("userId");

-- AddForeignKey
ALTER TABLE "IdentityLifecycleEvent" ADD CONSTRAINT "IdentityLifecycleEvent_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityLifecycleEvent" ADD CONSTRAINT "IdentityLifecycleEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Program 7 · Phase 7B.1 — drift-safe backfill (additive; keeps the deterministic lifecycleState↔isActive mapping).
-- Existing rows default to ACTIVE via the column default; any pre-existing DEACTIVATED user (isActive=false) is mapped
-- to the reversible SUSPENDED state (never the terminal DEPROVISIONED) so no ACTIVE-with-isActive=false drift exists.
UPDATE "User" SET "lifecycleState" = 'SUSPENDED' WHERE "isActive" = false;
