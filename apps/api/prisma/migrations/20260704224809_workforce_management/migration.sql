-- CreateEnum
CREATE TYPE "ClockEventType" AS ENUM ('ClockIn', 'ClockOut', 'BreakStart', 'BreakEnd', 'LunchStart', 'LunchEnd');

-- CreateEnum
CREATE TYPE "ClockMethod" AS ENUM ('Desktop', 'Mobile', 'Tablet', 'Kiosk', 'QRCode');

-- CreateEnum
CREATE TYPE "TimesheetStatus" AS ENUM ('Draft', 'Submitted', 'UnderReview', 'Approved', 'Rejected', 'PayrollLocked');

-- CreateEnum
CREATE TYPE "ShiftType" AS ENUM ('Morning', 'Evening', 'Night', 'Weekend', 'Holiday');

-- CreateEnum
CREATE TYPE "ShiftAssignmentStatus" AS ENUM ('Scheduled', 'Confirmed', 'Completed', 'Absent', 'Late');

-- AlterEnum
ALTER TYPE "FeatureKey" ADD VALUE 'WORKFORCE_MANAGEMENT';

-- CreateTable
CREATE TABLE "ClockEvent" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "ClockEventType" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" "ClockMethod" NOT NULL DEFAULT 'Desktop',
    "location" TEXT,
    "ipAddress" TEXT,
    "deviceId" TEXT,
    "notes" TEXT,
    "editedAt" TIMESTAMP(3),
    "editedById" TEXT,
    "editReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClockEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Timesheet" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "TimesheetStatus" NOT NULL DEFAULT 'Draft',
    "regularHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overtimeHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Timesheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimesheetEntry" (
    "id" TEXT NOT NULL,
    "timesheetId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "clockIn" TIMESTAMP(3),
    "clockOut" TIMESTAMP(3),
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "regularHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overtimeHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "shift" "ShiftType" NOT NULL DEFAULT 'Morning',
    "notes" TEXT,

    CONSTRAINT "TimesheetEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "type" "ShiftType" NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#4F46E5',
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftAssignment" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "ShiftAssignmentStatus" NOT NULL DEFAULT 'Scheduled',
    "notes" TEXT,
    "createdById" TEXT,

    CONSTRAINT "ShiftAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClockEvent_employeeId_timestamp_idx" ON "ClockEvent"("employeeId", "timestamp");

-- CreateIndex
CREATE INDEX "ClockEvent_labId_timestamp_idx" ON "ClockEvent"("labId", "timestamp");

-- CreateIndex
CREATE INDEX "Timesheet_labId_idx" ON "Timesheet"("labId");

-- CreateIndex
CREATE UNIQUE INDEX "Timesheet_labId_employeeId_periodStart_key" ON "Timesheet"("labId", "employeeId", "periodStart");

-- CreateIndex
CREATE INDEX "TimesheetEntry_timesheetId_idx" ON "TimesheetEntry"("timesheetId");

-- CreateIndex
CREATE INDEX "Shift_labId_idx" ON "Shift"("labId");

-- CreateIndex
CREATE UNIQUE INDEX "Shift_labId_name_key" ON "Shift"("labId", "name");

-- CreateIndex
CREATE INDEX "ShiftAssignment_employeeId_date_idx" ON "ShiftAssignment"("employeeId", "date");

-- CreateIndex
CREATE INDEX "ShiftAssignment_labId_date_idx" ON "ShiftAssignment"("labId", "date");

-- AddForeignKey
ALTER TABLE "ClockEvent" ADD CONSTRAINT "ClockEvent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClockEvent" ADD CONSTRAINT "ClockEvent_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Timesheet" ADD CONSTRAINT "Timesheet_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Timesheet" ADD CONSTRAINT "Timesheet_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimesheetEntry" ADD CONSTRAINT "TimesheetEntry_timesheetId_fkey" FOREIGN KEY ("timesheetId") REFERENCES "Timesheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

