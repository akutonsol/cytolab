-- CreateEnum
CREATE TYPE "FormFieldType" AS ENUM ('TEXT', 'CHECKBOX');

-- CreateTable
CREATE TABLE "FormConfig" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "formType" "RequisitionFormType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormFieldConfig" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "formConfigId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fieldType" "FormFieldType" NOT NULL DEFAULT 'TEXT',
    "showWhenPrinting" BOOLEAN NOT NULL DEFAULT true,
    "printGroupId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormFieldConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormPrintGroup" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "formConfigId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormPrintGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FormConfig_labId_idx" ON "FormConfig"("labId");

-- CreateIndex
CREATE UNIQUE INDEX "FormConfig_labId_formType_key" ON "FormConfig"("labId", "formType");

-- CreateIndex
CREATE INDEX "FormFieldConfig_labId_idx" ON "FormFieldConfig"("labId");

-- CreateIndex
CREATE UNIQUE INDEX "FormFieldConfig_formConfigId_fieldKey_key" ON "FormFieldConfig"("formConfigId", "fieldKey");

-- CreateIndex
CREATE INDEX "FormPrintGroup_labId_idx" ON "FormPrintGroup"("labId");

-- AddForeignKey
ALTER TABLE "FormConfig" ADD CONSTRAINT "FormConfig_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormFieldConfig" ADD CONSTRAINT "FormFieldConfig_formConfigId_fkey" FOREIGN KEY ("formConfigId") REFERENCES "FormConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormFieldConfig" ADD CONSTRAINT "FormFieldConfig_printGroupId_fkey" FOREIGN KEY ("printGroupId") REFERENCES "FormPrintGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormPrintGroup" ADD CONSTRAINT "FormPrintGroup_formConfigId_fkey" FOREIGN KEY ("formConfigId") REFERENCES "FormConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

