-- CreateTable
CREATE TABLE "MaintenanceLog" (
    "id" TEXT NOT NULL,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ranBy" TEXT,
    "duration" INTEGER NOT NULL,
    "results" JSONB NOT NULL,
    "notes" TEXT,

    CONSTRAINT "MaintenanceLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaintenanceLog_ranAt_idx" ON "MaintenanceLog"("ranAt");

