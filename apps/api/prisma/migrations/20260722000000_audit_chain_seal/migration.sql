-- R-016b — Sealed-Generation Audit Monitor.
-- An authorized, APPEND-ONLY seal for a FROZEN prior audit-chain generation. The integrity
-- monitor proves a sealed generation is unchanged since sealing by recomputing snapshotDigest
-- (a full-generation fingerprint) and matching it here. No update/delete path is created.

-- CreateTable
CREATE TABLE "AuditChainSeal" (
    "chainId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "sealedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sealedBy" TEXT,
    "eventCount" INTEGER NOT NULL,
    "terminalSequence" BIGINT NOT NULL,
    "terminalSelfHash" TEXT NOT NULL,
    "snapshotDigest" TEXT NOT NULL,

    CONSTRAINT "AuditChainSeal_pkey" PRIMARY KEY ("chainId")
);
