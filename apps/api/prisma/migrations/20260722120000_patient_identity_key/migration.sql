-- Patient de-duplication: one patient, many records.
-- Adds a deterministic identity fingerprint (see common/util/patient-identity.ts)
-- and a per-lab unique index so the same real-world person cannot be created twice.

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN "identityKey" TEXT;

-- CreateIndex
-- Postgres treats NULLs as distinct in a UNIQUE index, so patients without enough
-- identity info (null key) are never blocked; only computed keys are deduplicated.
CREATE UNIQUE INDEX "Patient_labId_identityKey_key" ON "Patient"("labId", "identityKey");
