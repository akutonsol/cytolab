-- CreateEnum
CREATE TYPE "LabInvoiceStatus" AS ENUM ('Draft', 'Sent', 'Paid', 'Overdue', 'Void');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'INVOICE_ISSUED';

-- CreateTable
CREATE TABLE "LabBillingProfile" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "billingDayOfMonth" INTEGER NOT NULL DEFAULT 1,
    "dueDays" INTEGER NOT NULL DEFAULT 14,
    "autoSend" BOOLEAN NOT NULL DEFAULT true,
    "currency" TEXT NOT NULL DEFAULT 'JMD',
    "notes" TEXT,
    "lastRunPeriod" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabBillingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabBillingItem" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LabBillingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabInvoice" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "profileId" TEXT,
    "number" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "LabInvoiceStatus" NOT NULL DEFAULT 'Draft',
    "currency" TEXT NOT NULL,
    "subtotal" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "generatedBy" TEXT NOT NULL DEFAULT 'system',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabInvoiceLine" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" INTEGER NOT NULL DEFAULT 0,
    "amount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LabInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LabBillingProfile_labId_key" ON "LabBillingProfile"("labId");

-- CreateIndex
CREATE INDEX "LabBillingProfile_active_billingDayOfMonth_idx" ON "LabBillingProfile"("active", "billingDayOfMonth");

-- CreateIndex
CREATE INDEX "LabBillingItem_labId_idx" ON "LabBillingItem"("labId");

-- CreateIndex
CREATE INDEX "LabBillingItem_profileId_idx" ON "LabBillingItem"("profileId");

-- CreateIndex
CREATE INDEX "LabInvoice_labId_idx" ON "LabInvoice"("labId");

-- CreateIndex
CREATE INDEX "LabInvoice_status_idx" ON "LabInvoice"("status");

-- CreateIndex
CREATE INDEX "LabInvoice_profileId_idx" ON "LabInvoice"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "LabInvoice_labId_number_key" ON "LabInvoice"("labId", "number");

-- CreateIndex
CREATE INDEX "LabInvoiceLine_labId_idx" ON "LabInvoiceLine"("labId");

-- CreateIndex
CREATE INDEX "LabInvoiceLine_invoiceId_idx" ON "LabInvoiceLine"("invoiceId");

-- AddForeignKey
ALTER TABLE "LabBillingProfile" ADD CONSTRAINT "LabBillingProfile_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabBillingItem" ADD CONSTRAINT "LabBillingItem_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabBillingItem" ADD CONSTRAINT "LabBillingItem_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "LabBillingProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabInvoice" ADD CONSTRAINT "LabInvoice_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabInvoice" ADD CONSTRAINT "LabInvoice_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "LabBillingProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabInvoiceLine" ADD CONSTRAINT "LabInvoiceLine_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabInvoiceLine" ADD CONSTRAINT "LabInvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "LabInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

