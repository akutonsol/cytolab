-- P5-3B.3B-i — Verification Provenance Schema.
-- Adds the independent-verification verdict vocabulary + an append-only provenance table, and a
-- verifiedAt timestamp on the generation. NO runtime verdict logic ships here (that is P5-3B.3B-ii);
-- this migration only makes the durable shape exist.
--
-- Notes:
--   * VerificationOutcome is a NEW enum (CREATE TYPE) — safe in a single migration (no ALTER TYPE ADD VALUE).
--   * GenerationVerification.generationId is ON DELETE RESTRICT: this is audit evidence, NOT
--     generation-owned runtime data — its deletion is a later retention/GC decision, never a silent cascade.
--   * No uniqueness constraint (append-only; the single-terminal-verdict invariant is enforced at runtime
--     by the QC_PENDING transition guard in P5-3B.3B-ii).
--   * verifiedAt = when INDEPENDENT VERIFICATION reached a terminal verdict (READY or QC_FAILED), not
--     merely "when verified=true was set".

-- CreateEnum
CREATE TYPE "VerificationOutcome" AS ENUM ('PASSED', 'FAILED');

-- AlterTable
ALTER TABLE "DerivativeGeneration" ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "GenerationVerification" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "outcome" "VerificationOutcome" NOT NULL,
    "reasons" JSONB NOT NULL,
    "manifestChecksum" TEXT NOT NULL,
    "verifierVersion" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GenerationVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GenerationVerification_labId_idx" ON "GenerationVerification"("labId");

-- CreateIndex
CREATE INDEX "GenerationVerification_generationId_idx" ON "GenerationVerification"("generationId");

-- CreateIndex
CREATE INDEX "GenerationVerification_generationId_outcome_idx" ON "GenerationVerification"("generationId", "outcome");

-- AddForeignKey
ALTER TABLE "GenerationVerification" ADD CONSTRAINT "GenerationVerification_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationVerification" ADD CONSTRAINT "GenerationVerification_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "DerivativeGeneration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
