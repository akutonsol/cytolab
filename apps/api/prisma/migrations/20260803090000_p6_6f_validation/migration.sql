-- Program 6 · Phase 6F — validation evidence (no claim beyond recorded evidence).
-- ADDITIVE ONLY: one new enum + four new tables (ValidationRun/Metric/ConfusionCell/CurvePoint), all provenance
-- FKs ON DELETE RESTRICT. NO existing table is dropped or altered destructively (the only ALTER TABLE statements
-- add FKs to the new tables); model lifecycle + datasets + the clinical path are untouched (no support lifecycle
-- promotion). Plain validated numeric/coded columns — no raw-SQL-only invariant. References — never modifies —
-- Program 5 / accepted 6A / 6B / 6C / 6D / 6E.

-- CreateEnum
CREATE TYPE "ValidationMetricKind" AS ENUM ('CONFUSION_MATRIX', 'SENSITIVITY', 'SPECIFICITY', 'PRECISION', 'RECALL', 'F_SCORE', 'ROC_POINT', 'CALIBRATION_POINT', 'OPERATING_THRESHOLD');

-- CreateTable
CREATE TABLE "ValidationRun" (
    "id" TEXT NOT NULL,
    "runUuid" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "modelVersionId" TEXT NOT NULL,
    "datasetVersionId" TEXT NOT NULL,
    "datasetManifestDigest" TEXT,
    "groundTruthDigest" TEXT NOT NULL,
    "modelVersionUuid" TEXT NOT NULL,
    "modelUuid" TEXT NOT NULL,
    "modelArtifactDigest" TEXT,
    "adapterId" TEXT,
    "adapterVersion" TEXT,
    "modelLifecycleStateAtRun" "AiModelLifecycleState" NOT NULL,
    "validatorId" TEXT NOT NULL,
    "validatorVersion" TEXT NOT NULL,
    "computationVersion" TEXT NOT NULL,
    "metricSchemaVersion" TEXT NOT NULL,
    "calculationId" TEXT NOT NULL,
    "configDigest" TEXT,
    "thresholdConfigDigest" TEXT,
    "metricSelectionDigest" TEXT,
    "computationConfigDigest" TEXT,
    "eventId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValidationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidationMetric" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "metricKind" "ValidationMetricKind" NOT NULL,
    "labelClassCode" TEXT,
    "value" DOUBLE PRECISION,
    "numeratorSource" TEXT,
    "denominatorSource" TEXT,
    "ordinal" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValidationMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidationConfusionCell" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "trueClassCode" TEXT NOT NULL,
    "predClassCode" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValidationConfusionCell_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidationCurvePoint" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "curveKind" "ValidationMetricKind" NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "threshold" DOUBLE PRECISION,
    "ordinal" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValidationCurvePoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ValidationRun_runUuid_key" ON "ValidationRun"("runUuid");

-- CreateIndex
CREATE INDEX "ValidationRun_labId_idx" ON "ValidationRun"("labId");

-- CreateIndex
CREATE INDEX "ValidationRun_labId_modelVersionId_idx" ON "ValidationRun"("labId", "modelVersionId");

-- CreateIndex
CREATE INDEX "ValidationRun_labId_datasetVersionId_idx" ON "ValidationRun"("labId", "datasetVersionId");

-- CreateIndex
CREATE INDEX "ValidationRun_modelVersionId_idx" ON "ValidationRun"("modelVersionId");

-- CreateIndex
CREATE INDEX "ValidationRun_datasetVersionId_idx" ON "ValidationRun"("datasetVersionId");

-- CreateIndex
CREATE INDEX "ValidationMetric_labId_idx" ON "ValidationMetric"("labId");

-- CreateIndex
CREATE INDEX "ValidationMetric_labId_runId_idx" ON "ValidationMetric"("labId", "runId");

-- CreateIndex
CREATE INDEX "ValidationMetric_runId_idx" ON "ValidationMetric"("runId");

-- CreateIndex
CREATE INDEX "ValidationConfusionCell_labId_idx" ON "ValidationConfusionCell"("labId");

-- CreateIndex
CREATE INDEX "ValidationConfusionCell_labId_runId_idx" ON "ValidationConfusionCell"("labId", "runId");

-- CreateIndex
CREATE INDEX "ValidationConfusionCell_runId_idx" ON "ValidationConfusionCell"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "ValidationConfusionCell_labId_runId_trueClassCode_predClass_key" ON "ValidationConfusionCell"("labId", "runId", "trueClassCode", "predClassCode");

-- CreateIndex
CREATE INDEX "ValidationCurvePoint_labId_idx" ON "ValidationCurvePoint"("labId");

-- CreateIndex
CREATE INDEX "ValidationCurvePoint_labId_runId_idx" ON "ValidationCurvePoint"("labId", "runId");

-- CreateIndex
CREATE INDEX "ValidationCurvePoint_runId_idx" ON "ValidationCurvePoint"("runId");

-- AddForeignKey
ALTER TABLE "ValidationRun" ADD CONSTRAINT "ValidationRun_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationRun" ADD CONSTRAINT "ValidationRun_modelVersionId_fkey" FOREIGN KEY ("modelVersionId") REFERENCES "AiModelVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationRun" ADD CONSTRAINT "ValidationRun_datasetVersionId_fkey" FOREIGN KEY ("datasetVersionId") REFERENCES "DatasetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationMetric" ADD CONSTRAINT "ValidationMetric_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationMetric" ADD CONSTRAINT "ValidationMetric_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ValidationRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationConfusionCell" ADD CONSTRAINT "ValidationConfusionCell_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationConfusionCell" ADD CONSTRAINT "ValidationConfusionCell_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ValidationRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationCurvePoint" ADD CONSTRAINT "ValidationCurvePoint_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationCurvePoint" ADD CONSTRAINT "ValidationCurvePoint_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ValidationRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

