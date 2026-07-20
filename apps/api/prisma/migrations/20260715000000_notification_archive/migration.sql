-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "WorkforceNotification" ADD COLUMN     "archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Notification_labId_userId_archived_idx" ON "Notification"("labId", "userId", "archived");

-- CreateIndex
CREATE INDEX "WorkforceNotification_labId_recipientId_archived_idx" ON "WorkforceNotification"("labId", "recipientId", "archived");

