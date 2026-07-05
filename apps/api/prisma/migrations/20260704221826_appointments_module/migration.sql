-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AppointmentStatus" ADD VALUE 'Scheduled';
ALTER TYPE "AppointmentStatus" ADD VALUE 'Confirmed';
ALTER TYPE "AppointmentStatus" ADD VALUE 'CheckedIn';
ALTER TYPE "AppointmentStatus" ADD VALUE 'Completed';
ALTER TYPE "AppointmentStatus" ADD VALUE 'NoShow';
ALTER TYPE "AppointmentStatus" ADD VALUE 'Cancelled';
ALTER TYPE "AppointmentStatus" ADD VALUE 'Rescheduled';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AppointmentType" ADD VALUE 'SpecimenCollection';
ALTER TYPE "AppointmentType" ADD VALUE 'FollowUp';
ALTER TYPE "AppointmentType" ADD VALUE 'RecallVisit';
ALTER TYPE "AppointmentType" ADD VALUE 'Consultation';
ALTER TYPE "AppointmentType" ADD VALUE 'Other';

-- AlterEnum
ALTER TYPE "FeatureKey" ADD VALUE 'APPOINTMENTS';

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "checkedInAt" TIMESTAMP(3),
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "doctorName" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "noShowAt" TIMESTAMP(3),
ADD COLUMN     "recallRecordId" TEXT,
ADD COLUMN     "reminderSentAt" TIMESTAMP(3),
ADD COLUMN     "resultRecordId" TEXT,
ALTER COLUMN "title" SET DEFAULT '';

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_recallRecordId_fkey" FOREIGN KEY ("recallRecordId") REFERENCES "RecallRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

