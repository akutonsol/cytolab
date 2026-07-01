-- CreateIndex
CREATE UNIQUE INDEX "Service_labId_name_key" ON "Service"("labId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Tax_labId_name_key" ON "Tax"("labId", "name");

