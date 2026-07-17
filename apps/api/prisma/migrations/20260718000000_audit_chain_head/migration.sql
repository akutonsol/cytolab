-- DropIndex
DROP INDEX "AuditEvent_chainId_sequence_idx";

-- CreateTable
CREATE TABLE "AuditChainHead" (
    "chainId" TEXT NOT NULL,
    "lastSequence" BIGINT NOT NULL,
    "lastSelfHash" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditChainHead_pkey" PRIMARY KEY ("chainId")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_chainId_sequence_key" ON "AuditEvent"("chainId", "sequence");
