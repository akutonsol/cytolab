-- Phase 2: Lab Intake
-- Enums and tables for Patient, ClientType, Client, Requisition,
-- RequisitionLine, Record, RecordStatusEvent, Specimen, Therapy.
-- Phase 1 tables (Lab, Account, Workspace, User, Role, Permission, etc.) already applied.

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('Male', 'Female');

-- CreateEnum
CREATE TYPE "ClientTypeEnum" AS ENUM ('Doctor', 'Laboratory');

-- CreateEnum
CREATE TYPE "SpecimenType" AS ENUM ('URINE', 'CSF', 'PLEURAL_FLD', 'BREAST_ASP', 'JOINT_ASP', 'SYNOVIAL_FLD', 'OTHER');

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('Pending', 'Submitted', 'Processing', 'Partial', 'Completed', 'Approved', 'Billed', 'Paid', 'OnHold', 'Disabled', 'Failed', 'Viewed');

-- CreateEnum
CREATE TYPE "RequisitionStatus" AS ENUM ('Pending', 'Active', 'Completed', 'Disabled');

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "registrationNo" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "middleName" TEXT,
    "age" INTEGER,
    "phoneNumber" TEXT,
    "bloodGroup" TEXT,
    "gender" "Gender",
    "height" DOUBLE PRECISION,
    "weight" DOUBLE PRECISION,
    "email" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "identityToken" TEXT,
    "motherMaidenName" TEXT,
    "clientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientType" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ClientTypeEnum" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "officeName" TEXT,
    "phoneNumber" TEXT,
    "mobileNumber" TEXT,
    "officeNumber" TEXT,
    "faxNumber" TEXT,
    "clientTypeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Requisition" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "status" "RequisitionStatus" NOT NULL DEFAULT 'Pending',
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "entriesCompleted" BOOLEAN NOT NULL DEFAULT false,
    "clientId" TEXT,
    "workspaceId" TEXT,
    "dateReceived" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Requisition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequisitionLine" (
    "id" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "isUrgent" BOOLEAN NOT NULL DEFAULT false,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recordId" TEXT,

    CONSTRAINT "RequisitionLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Record" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "clinicalDiagnosis" TEXT,
    "labNumber" TEXT,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "medicalEntry" TEXT,
    "billed" BOOLEAN NOT NULL DEFAULT false,
    "status" "RecordStatus" NOT NULL DEFAULT 'Pending',
    "dateStatus" TIMESTAMP(3),
    "patientId" TEXT NOT NULL,
    "clientId" TEXT,
    "workspaceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordStatusEvent" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "status" "RecordStatus" NOT NULL,
    "userId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Specimen" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "label" TEXT,
    "vialColour" TEXT,
    "antiserumA" TEXT,
    "antiserumB" TEXT,
    "rhSolution" TEXT,
    "type" "SpecimenType" NOT NULL,
    "bloodGroup" TEXT,
    "recordId" TEXT NOT NULL,
    "clientId" TEXT,
    "dateReceived" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Specimen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Therapy" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "hormone" BOOLEAN NOT NULL DEFAULT false,
    "radiation" BOOLEAN NOT NULL DEFAULT false,
    "surgical" BOOLEAN NOT NULL DEFAULT false,
    "other" TEXT,

    CONSTRAINT "Therapy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Patient_labId_idx" ON "Patient"("labId");

-- CreateIndex
CREATE INDEX "Patient_clientId_idx" ON "Patient"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_labId_registrationNo_key" ON "Patient"("labId", "registrationNo");

-- CreateIndex
CREATE INDEX "ClientType_labId_idx" ON "ClientType"("labId");

-- CreateIndex
CREATE INDEX "Client_labId_idx" ON "Client"("labId");

-- CreateIndex
CREATE INDEX "Requisition_labId_idx" ON "Requisition"("labId");

-- CreateIndex
CREATE INDEX "Requisition_clientId_idx" ON "Requisition"("clientId");

-- CreateIndex
CREATE INDEX "RequisitionLine_requisitionId_idx" ON "RequisitionLine"("requisitionId");

-- CreateIndex
CREATE INDEX "RequisitionLine_recordId_idx" ON "RequisitionLine"("recordId");

-- CreateIndex
CREATE INDEX "Record_labId_idx" ON "Record"("labId");

-- CreateIndex
CREATE INDEX "Record_patientId_idx" ON "Record"("patientId");

-- CreateIndex
CREATE INDEX "Record_clientId_idx" ON "Record"("clientId");

-- CreateIndex
CREATE INDEX "Record_status_idx" ON "Record"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Record_labId_identifier_key" ON "Record"("labId", "identifier");

-- CreateIndex
CREATE INDEX "RecordStatusEvent_recordId_idx" ON "RecordStatusEvent"("recordId");

-- CreateIndex
CREATE INDEX "RecordStatusEvent_recordId_createdAt_idx" ON "RecordStatusEvent"("recordId", "createdAt");

-- CreateIndex
CREATE INDEX "Specimen_labId_idx" ON "Specimen"("labId");

-- CreateIndex
CREATE INDEX "Specimen_recordId_idx" ON "Specimen"("recordId");

-- CreateIndex
CREATE UNIQUE INDEX "Therapy_recordId_key" ON "Therapy"("recordId");

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientType" ADD CONSTRAINT "ClientType_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_clientTypeId_fkey" FOREIGN KEY ("clientTypeId") REFERENCES "ClientType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requisition" ADD CONSTRAINT "Requisition_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requisition" ADD CONSTRAINT "Requisition_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requisition" ADD CONSTRAINT "Requisition_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitionLine" ADD CONSTRAINT "RequisitionLine_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "Requisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitionLine" ADD CONSTRAINT "RequisitionLine_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Record" ADD CONSTRAINT "Record_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Record" ADD CONSTRAINT "Record_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Record" ADD CONSTRAINT "Record_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Record" ADD CONSTRAINT "Record_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordStatusEvent" ADD CONSTRAINT "RecordStatusEvent_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordStatusEvent" ADD CONSTRAINT "RecordStatusEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Specimen" ADD CONSTRAINT "Specimen_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Specimen" ADD CONSTRAINT "Specimen_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Specimen" ADD CONSTRAINT "Specimen_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Therapy" ADD CONSTRAINT "Therapy_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;
