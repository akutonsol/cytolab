-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('RECORD_SUBMITTED', 'RECORD_RESULTED', 'RECORD_APPROVED', 'RECORD_FAILED', 'AUTHORIZATION_NEEDED', 'CHANGE_REQUEST_RECEIVED', 'CHANGE_REQUEST_REPLIED', 'PAYMENT_RECEIVED', 'APPOINTMENT_REMINDER', 'SYSTEM_ALERT');

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "link" TEXT,
    "entityId" TEXT,
    "entityType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_labId_userId_idx" ON "Notification"("labId", "userId");

-- CreateIndex
CREATE INDEX "Notification_labId_userId_read_idx" ON "Notification"("labId", "userId", "read");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

