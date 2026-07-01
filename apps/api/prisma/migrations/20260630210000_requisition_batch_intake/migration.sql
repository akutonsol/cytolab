-- CreateEnum
CREATE TYPE "RequisitionFormType" AS ENUM ('Gynecology', 'NonGynecology');

-- AlterEnum
ALTER TYPE "RequisitionStatus" ADD VALUE 'Partial';

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "accountNo" TEXT;

-- AlterTable
ALTER TABLE "Requisition" DROP COLUMN "entriesCompleted",
ADD COLUMN     "referenceNo" TEXT,
ALTER COLUMN "amount" SET DEFAULT 0,
ALTER COLUMN "amount" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "RequisitionLine" DROP COLUMN "description",
ADD COLUMN     "formType" "RequisitionFormType" NOT NULL DEFAULT 'Gynecology',
ADD COLUMN     "notes" TEXT,
ALTER COLUMN "amount" SET DEFAULT 0,
ALTER COLUMN "amount" SET DATA TYPE INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Client_labId_accountNo_key" ON "Client"("labId", "accountNo");

-- CreateIndex
CREATE UNIQUE INDEX "Requisition_labId_referenceNo_key" ON "Requisition"("labId", "referenceNo");

