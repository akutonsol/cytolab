-- P5-4a — Publication Provenance Schema.
-- Adds the publication-event vocabulary + an append-only publication-history table, and a supersededAt
-- timestamp on the generation. NO runtime publication logic ships here (that is P5-4b); this migration
-- only makes the durable shape exist.
--
-- Notes:
--   * PublicationAction is a NEW enum (CREATE TYPE) — safe in a single migration (no ALTER TYPE ADD VALUE).
--   * supersededAt records when a generation CEASED to be published; publishedAt is never cleared, so the
--     pair (publishedAt, supersededAt) is the authority window began→ended.
--   * GenerationPublication is append-only. All rows of ONE publication transaction share publicationEventId
--     so a PUBLISHED + SUPERSEDED replacement is reconstructable without timestamp coincidence.
--   * All three FKs are ON DELETE RESTRICT: this is clinical audit history, NOT disposable runtime data —
--     a later retention/GC checkpoint decides when deletion is permitted, never a silent cascade.
--   * No uniqueness constraint (append-only; per-slide publication exclusivity is already enforced by the
--     existing partial unique index DerivativeGeneration_slideId_published_key and the P5-4b transaction).

-- CreateEnum
CREATE TYPE "PublicationAction" AS ENUM ('PUBLISHED', 'SUPERSEDED');

-- AlterTable
ALTER TABLE "DerivativeGeneration" ADD COLUMN     "supersededAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "GenerationPublication" (
    "id" TEXT NOT NULL,
    "publicationEventId" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "slideId" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "action" "PublicationAction" NOT NULL,
    "actorUserId" TEXT,
    "at" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GenerationPublication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GenerationPublication_labId_idx" ON "GenerationPublication"("labId");

-- CreateIndex
CREATE INDEX "GenerationPublication_slideId_idx" ON "GenerationPublication"("slideId");

-- CreateIndex
CREATE INDEX "GenerationPublication_generationId_idx" ON "GenerationPublication"("generationId");

-- CreateIndex
CREATE INDEX "GenerationPublication_publicationEventId_idx" ON "GenerationPublication"("publicationEventId");

-- CreateIndex
CREATE INDEX "GenerationPublication_slideId_at_idx" ON "GenerationPublication"("slideId", "at");

-- AddForeignKey
ALTER TABLE "GenerationPublication" ADD CONSTRAINT "GenerationPublication_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationPublication" ADD CONSTRAINT "GenerationPublication_slideId_fkey" FOREIGN KEY ("slideId") REFERENCES "DigitalSlide"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationPublication" ADD CONSTRAINT "GenerationPublication_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "DerivativeGeneration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
