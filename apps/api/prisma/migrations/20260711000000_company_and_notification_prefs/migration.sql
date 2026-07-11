-- AlterTable
ALTER TABLE "Lab" ADD COLUMN     "tagline" TEXT;

-- CreateTable
CREATE TABLE "UserNotificationPreference" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recordsInApp" BOOLEAN NOT NULL DEFAULT true,
    "recordsEmail" BOOLEAN NOT NULL DEFAULT false,
    "requestsInApp" BOOLEAN NOT NULL DEFAULT true,
    "requestsEmail" BOOLEAN NOT NULL DEFAULT false,
    "paymentsInApp" BOOLEAN NOT NULL DEFAULT true,
    "paymentsEmail" BOOLEAN NOT NULL DEFAULT false,
    "systemInApp" BOOLEAN NOT NULL DEFAULT true,
    "systemEmail" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserNotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserNotificationPreference_userId_key" ON "UserNotificationPreference"("userId");

-- CreateIndex
CREATE INDEX "UserNotificationPreference_labId_idx" ON "UserNotificationPreference"("labId");

-- AddForeignKey
ALTER TABLE "UserNotificationPreference" ADD CONSTRAINT "UserNotificationPreference_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNotificationPreference" ADD CONSTRAINT "UserNotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

