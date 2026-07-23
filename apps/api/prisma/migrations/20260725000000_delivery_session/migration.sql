-- P5-5A-i — Delivery Session Schema.
-- Adds the viewing-capability vocabulary + a short-lived, generation-bound delivery-session table. NO
-- runtime issuance/resolution/delivery ships here (that is P5-5A-ii / P5-5B); this migration only makes
-- the durable capability shape exist.
--
-- Notes:
--   * DeliveryScope is a CLOSED security enum (CREATE TYPE) — a new capability requires a schema/security
--     review, never an arbitrary string. Stored as a scopes[] array.
--   * Only tokenHash = SHA-256(rawToken) is persisted; the raw 256-bit bearer token is NEVER stored. The
--     UNIQUE index on tokenHash gives received-token → hash → indexed lookup.
--   * The DB is authoritative for validity: a session is valid iff revokedAt IS NULL AND expiresAt > now.
--   * This is OPERATIONAL capability state, not clinical audit history — so slide/generation FKs Cascade
--     (ephemeral: they disappear with their subject), while labId stays Restrict per tenancy convention.
--     actorUserId is a plain id (no FK) so actor identity survives user deletion.

-- CreateEnum
CREATE TYPE "DeliveryScope" AS ENUM ('DESCRIPTOR', 'TILES', 'ASSOCIATED_IMAGES', 'MANIFEST');

-- CreateTable
CREATE TABLE "DeliverySession" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "slideId" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "scopes" "DeliveryScope"[],
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliverySession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeliverySession_tokenHash_key" ON "DeliverySession"("tokenHash");

-- CreateIndex
CREATE INDEX "DeliverySession_labId_idx" ON "DeliverySession"("labId");

-- CreateIndex
CREATE INDEX "DeliverySession_actorUserId_idx" ON "DeliverySession"("actorUserId");

-- CreateIndex
CREATE INDEX "DeliverySession_slideId_idx" ON "DeliverySession"("slideId");

-- CreateIndex
CREATE INDEX "DeliverySession_generationId_idx" ON "DeliverySession"("generationId");

-- CreateIndex
CREATE INDEX "DeliverySession_expiresAt_idx" ON "DeliverySession"("expiresAt");

-- CreateIndex
CREATE INDEX "DeliverySession_labId_expiresAt_idx" ON "DeliverySession"("labId", "expiresAt");

-- AddForeignKey
ALTER TABLE "DeliverySession" ADD CONSTRAINT "DeliverySession_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliverySession" ADD CONSTRAINT "DeliverySession_slideId_fkey" FOREIGN KEY ("slideId") REFERENCES "DigitalSlide"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliverySession" ADD CONSTRAINT "DeliverySession_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "DerivativeGeneration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
