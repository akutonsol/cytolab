-- CreateEnum
CREATE TYPE "ChangeRequestType" AS ENUM ('DemographicsCorrection', 'AddTest', 'CancelRequest', 'GeneralQuery');

-- CreateEnum
CREATE TYPE "ChangeRequestStatus" AS ENUM ('Open', 'InReview', 'Actioned', 'Declined');

-- CreateEnum
CREATE TYPE "PortalTokenType" AS ENUM ('Invite', 'Reset');

-- AlterTable
ALTER TABLE "AuthAttempt" ADD COLUMN     "portal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "portalUserId" TEXT;

-- CreateTable
CREATE TABLE "PortalUser" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notifyByEmail" BOOLEAN NOT NULL DEFAULT true,
    "notifyInApp" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalAccessToken" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "portalUserId" TEXT NOT NULL,
    "type" "PortalTokenType" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalAccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeRequest" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "recordId" TEXT,
    "type" "ChangeRequestType" NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'Open',
    "createdByPortalUserId" TEXT NOT NULL,
    "assignedToUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeRequestMessage" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "changeRequestId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorPortalUserId" TEXT,
    "authorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangeRequestMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeRequestEvent" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "changeRequestId" TEXT NOT NULL,
    "status" "ChangeRequestStatus" NOT NULL,
    "note" TEXT,
    "byPortalUserId" TEXT,
    "byUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangeRequestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PortalUser_labId_idx" ON "PortalUser"("labId");

-- CreateIndex
CREATE INDEX "PortalUser_clientId_idx" ON "PortalUser"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "PortalUser_labId_email_key" ON "PortalUser"("labId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "PortalAccessToken_tokenHash_key" ON "PortalAccessToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PortalAccessToken_labId_idx" ON "PortalAccessToken"("labId");

-- CreateIndex
CREATE INDEX "PortalAccessToken_portalUserId_idx" ON "PortalAccessToken"("portalUserId");

-- CreateIndex
CREATE INDEX "ChangeRequest_labId_idx" ON "ChangeRequest"("labId");

-- CreateIndex
CREATE INDEX "ChangeRequest_clientId_idx" ON "ChangeRequest"("clientId");

-- CreateIndex
CREATE INDEX "ChangeRequest_recordId_idx" ON "ChangeRequest"("recordId");

-- CreateIndex
CREATE INDEX "ChangeRequest_status_idx" ON "ChangeRequest"("status");

-- CreateIndex
CREATE INDEX "ChangeRequestMessage_labId_idx" ON "ChangeRequestMessage"("labId");

-- CreateIndex
CREATE INDEX "ChangeRequestMessage_clientId_idx" ON "ChangeRequestMessage"("clientId");

-- CreateIndex
CREATE INDEX "ChangeRequestMessage_changeRequestId_idx" ON "ChangeRequestMessage"("changeRequestId");

-- CreateIndex
CREATE INDEX "ChangeRequestMessage_changeRequestId_createdAt_idx" ON "ChangeRequestMessage"("changeRequestId", "createdAt");

-- CreateIndex
CREATE INDEX "ChangeRequestEvent_labId_idx" ON "ChangeRequestEvent"("labId");

-- CreateIndex
CREATE INDEX "ChangeRequestEvent_clientId_idx" ON "ChangeRequestEvent"("clientId");

-- CreateIndex
CREATE INDEX "ChangeRequestEvent_changeRequestId_idx" ON "ChangeRequestEvent"("changeRequestId");

-- CreateIndex
CREATE INDEX "ChangeRequestEvent_changeRequestId_createdAt_idx" ON "ChangeRequestEvent"("changeRequestId", "createdAt");

-- CreateIndex
CREATE INDEX "AuthAttempt_portal_email_createdAt_idx" ON "AuthAttempt"("portal", "email", "createdAt");

-- AddForeignKey
ALTER TABLE "AuthAttempt" ADD CONSTRAINT "AuthAttempt_portalUserId_fkey" FOREIGN KEY ("portalUserId") REFERENCES "PortalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalUser" ADD CONSTRAINT "PortalUser_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalUser" ADD CONSTRAINT "PortalUser_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalAccessToken" ADD CONSTRAINT "PortalAccessToken_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalAccessToken" ADD CONSTRAINT "PortalAccessToken_portalUserId_fkey" FOREIGN KEY ("portalUserId") REFERENCES "PortalUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_createdByPortalUserId_fkey" FOREIGN KEY ("createdByPortalUserId") REFERENCES "PortalUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequestMessage" ADD CONSTRAINT "ChangeRequestMessage_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequestMessage" ADD CONSTRAINT "ChangeRequestMessage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequestMessage" ADD CONSTRAINT "ChangeRequestMessage_changeRequestId_fkey" FOREIGN KEY ("changeRequestId") REFERENCES "ChangeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequestMessage" ADD CONSTRAINT "ChangeRequestMessage_authorPortalUserId_fkey" FOREIGN KEY ("authorPortalUserId") REFERENCES "PortalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequestMessage" ADD CONSTRAINT "ChangeRequestMessage_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequestEvent" ADD CONSTRAINT "ChangeRequestEvent_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequestEvent" ADD CONSTRAINT "ChangeRequestEvent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequestEvent" ADD CONSTRAINT "ChangeRequestEvent_changeRequestId_fkey" FOREIGN KEY ("changeRequestId") REFERENCES "ChangeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequestEvent" ADD CONSTRAINT "ChangeRequestEvent_byPortalUserId_fkey" FOREIGN KEY ("byPortalUserId") REFERENCES "PortalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequestEvent" ADD CONSTRAINT "ChangeRequestEvent_byUserId_fkey" FOREIGN KEY ("byUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

