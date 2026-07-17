-- CreateEnum
CREATE TYPE "AuditCategory" AS ENUM ('AUTHENTICATION', 'AUTHORIZATION', 'PHI_ACCESS', 'RECORD_LIFECYCLE', 'CLINICAL_WORKFLOW', 'ADMINISTRATIVE', 'CONFIGURATION', 'DATA_EXPORT', 'SECURITY', 'DATA_MAINTENANCE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('STAFF', 'PORTAL', 'SERVICE', 'SYSTEM', 'ANONYMOUS');

-- CreateEnum
CREATE TYPE "AuditOrganizationScope" AS ENUM ('LAB', 'SYSTEM', 'CROSS_LAB');

-- CreateEnum
CREATE TYPE "AuditOutcome" AS ENUM ('SUCCESS', 'FAILURE', 'DENIED', 'ERROR');

-- CreateEnum
CREATE TYPE "AuditSeverity" AS ENUM ('INFO', 'NOTICE', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AuditDataClass" AS ENUM ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'PHI');

-- CreateEnum
CREATE TYPE "AuditRetentionClass" AS ENUM ('SHORT', 'STANDARD', 'EXTENDED', 'PERMANENT');

-- CreateEnum
CREATE TYPE "AuditDurabilityClass" AS ENUM ('CRITICAL_TRANSACTIONAL', 'REQUIRED_DURABLE', 'OPERATIONAL');

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sequence" BIGINT,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "eventVersion" INTEGER NOT NULL,
    "category" "AuditCategory" NOT NULL,
    "severity" "AuditSeverity" NOT NULL,
    "phiIndicator" BOOLEAN NOT NULL DEFAULT false,
    "dataClass" "AuditDataClass" NOT NULL,
    "retentionClass" "AuditRetentionClass" NOT NULL,
    "durabilityClass" "AuditDurabilityClass" NOT NULL,
    "actorType" "AuditActorType" NOT NULL,
    "actorId" TEXT,
    "onBehalfOfActorId" TEXT,
    "servicePrincipal" TEXT,
    "organizationScope" "AuditOrganizationScope" NOT NULL,
    "scopeLabId" TEXT,
    "organizationId" TEXT,
    "requestId" TEXT,
    "correlationId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "deviceId" TEXT,
    "route" TEXT,
    "httpMethod" TEXT,
    "sessionId" TEXT,
    "sessionKind" TEXT,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "resourceLabId" TEXT,
    "parentResourceType" TEXT,
    "parentResourceId" TEXT,
    "patientRef" TEXT,
    "actionCode" TEXT NOT NULL,
    "detailCode" TEXT,
    "outcome" "AuditOutcome" NOT NULL,
    "statusCode" INTEGER,
    "errorCode" TEXT,
    "reasonCode" TEXT,
    "changedFields" TEXT[],
    "beforeHash" TEXT,
    "afterHash" TEXT,
    "chainId" TEXT,
    "prevHash" TEXT,
    "selfHash" TEXT,
    "hashAlgorithm" TEXT,
    "producerModule" TEXT NOT NULL,
    "executionId" TEXT,
    "metadata" JSONB,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditEvent_scopeLabId_recordedAt_idx" ON "AuditEvent"("scopeLabId", "recordedAt");

-- CreateIndex
CREATE INDEX "AuditEvent_category_recordedAt_idx" ON "AuditEvent"("category", "recordedAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_recordedAt_idx" ON "AuditEvent"("actorId", "recordedAt");

-- CreateIndex
CREATE INDEX "AuditEvent_resourceType_resourceId_idx" ON "AuditEvent"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "AuditEvent_correlationId_idx" ON "AuditEvent"("correlationId");

-- CreateIndex
CREATE INDEX "AuditEvent_chainId_sequence_idx" ON "AuditEvent"("chainId", "sequence");

-- CreateIndex
CREATE INDEX "AuditEvent_recordedAt_idx" ON "AuditEvent"("recordedAt");

-- Organization-scope invariant, enforced at the database layer so no future script,
-- migration, admin tool, or accidental direct write can bypass the TypeScript validator:
--   LAB       -> scopeLabId NOT NULL
--   SYSTEM    -> scopeLabId NULL
--   CROSS_LAB -> scopeLabId NULL
-- No sentinel tenant; SYSTEM/CROSS_LAB never carry a lab id.
ALTER TABLE "AuditEvent"
ADD CONSTRAINT "AuditEvent_organization_scope_check"
CHECK (
  ("organizationScope" = 'LAB' AND "scopeLabId" IS NOT NULL)
  OR
  ("organizationScope" IN ('SYSTEM', 'CROSS_LAB') AND "scopeLabId" IS NULL)
);

