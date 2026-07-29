-- CreateEnum
CREATE TYPE "AiModelLifecycleState" AS ENUM ('DRAFT', 'VALIDATION', 'APPROVED', 'DEPRECATED', 'RETIRED');

-- CreateTable
CREATE TABLE "AiModel" (
    "id" TEXT NOT NULL,
    "modelUuid" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "description" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiModelVersion" (
    "id" TEXT NOT NULL,
    "versionUuid" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "semverMajor" INTEGER NOT NULL,
    "semverMinor" INTEGER NOT NULL,
    "semverPatch" INTEGER NOT NULL,
    "lifecycleState" "AiModelLifecycleState" NOT NULL DEFAULT 'DRAFT',
    "artifactDigest" TEXT,
    "provenanceRef" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "validatedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "deprecatedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),

    CONSTRAINT "AiModelVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiModelLifecycleEvent" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "modelVersionId" TEXT NOT NULL,
    "fromState" "AiModelLifecycleState" NOT NULL,
    "toState" "AiModelLifecycleState" NOT NULL,
    "actorId" TEXT,
    "reason" TEXT,
    "eventId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiModelLifecycleEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InferenceRecord" (
    "id" TEXT NOT NULL,
    "recordUuid" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "modelVersionId" TEXT NOT NULL,
    "subjectSlideId" TEXT,
    "inputDigest" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InferenceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiModel_modelUuid_key" ON "AiModel"("modelUuid");

-- CreateIndex
CREATE INDEX "AiModel_labId_idx" ON "AiModel"("labId");

-- CreateIndex
CREATE UNIQUE INDEX "AiModel_labId_key_key" ON "AiModel"("labId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "AiModelVersion_versionUuid_key" ON "AiModelVersion"("versionUuid");

-- CreateIndex
CREATE INDEX "AiModelVersion_labId_idx" ON "AiModelVersion"("labId");

-- CreateIndex
CREATE INDEX "AiModelVersion_labId_lifecycleState_idx" ON "AiModelVersion"("labId", "lifecycleState");

-- CreateIndex
CREATE INDEX "AiModelVersion_modelId_idx" ON "AiModelVersion"("modelId");

-- CreateIndex
CREATE UNIQUE INDEX "AiModelVersion_labId_modelId_semverMajor_semverMinor_semver_key" ON "AiModelVersion"("labId", "modelId", "semverMajor", "semverMinor", "semverPatch");

-- CreateIndex
CREATE INDEX "AiModelLifecycleEvent_labId_idx" ON "AiModelLifecycleEvent"("labId");

-- CreateIndex
CREATE INDEX "AiModelLifecycleEvent_labId_modelVersionId_idx" ON "AiModelLifecycleEvent"("labId", "modelVersionId");

-- CreateIndex
CREATE INDEX "AiModelLifecycleEvent_modelVersionId_idx" ON "AiModelLifecycleEvent"("modelVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "InferenceRecord_recordUuid_key" ON "InferenceRecord"("recordUuid");

-- CreateIndex
CREATE INDEX "InferenceRecord_labId_idx" ON "InferenceRecord"("labId");

-- CreateIndex
CREATE INDEX "InferenceRecord_labId_modelVersionId_idx" ON "InferenceRecord"("labId", "modelVersionId");

-- AddForeignKey
ALTER TABLE "AiModel" ADD CONSTRAINT "AiModel_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiModelVersion" ADD CONSTRAINT "AiModelVersion_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiModelVersion" ADD CONSTRAINT "AiModelVersion_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "AiModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiModelLifecycleEvent" ADD CONSTRAINT "AiModelLifecycleEvent_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiModelLifecycleEvent" ADD CONSTRAINT "AiModelLifecycleEvent_modelVersionId_fkey" FOREIGN KEY ("modelVersionId") REFERENCES "AiModelVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InferenceRecord" ADD CONSTRAINT "InferenceRecord_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InferenceRecord" ADD CONSTRAINT "InferenceRecord_modelVersionId_fkey" FOREIGN KEY ("modelVersionId") REFERENCES "AiModelVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InferenceRecord" ADD CONSTRAINT "InferenceRecord_subjectSlideId_fkey" FOREIGN KEY ("subjectSlideId") REFERENCES "DigitalSlide"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

