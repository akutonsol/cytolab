-- AlterTable
ALTER TABLE "Cabinet" ADD COLUMN     "clientId" TEXT;

-- CreateIndex
CREATE INDEX "Cabinet_clientId_idx" ON "Cabinet"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Cabinet_labId_clientId_key" ON "Cabinet"("labId", "clientId");

-- AddForeignKey
ALTER TABLE "Cabinet" ADD CONSTRAINT "Cabinet_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

