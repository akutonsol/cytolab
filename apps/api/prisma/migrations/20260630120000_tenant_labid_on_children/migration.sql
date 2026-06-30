-- F1 tenancy: give RequisitionLine, RecordStatusEvent and Therapy their own
-- labId column so the Prisma tenancy guard scopes them at the column level,
-- instead of relying on parent-mediated (relation) access.
--
-- Denormalization is intentional: labId is copied from the owning parent and is
-- immutable, so the duplication can't drift. Each column is added nullable,
-- backfilled from the parent, then locked to NOT NULL before the FK/index.

-- RequisitionLine: labId from its parent Requisition
ALTER TABLE "RequisitionLine" ADD COLUMN "labId" TEXT;
UPDATE "RequisitionLine" rl SET "labId" = r."labId"
  FROM "Requisition" r WHERE rl."requisitionId" = r."id";
ALTER TABLE "RequisitionLine" ALTER COLUMN "labId" SET NOT NULL;
CREATE INDEX "RequisitionLine_labId_idx" ON "RequisitionLine"("labId");
ALTER TABLE "RequisitionLine" ADD CONSTRAINT "RequisitionLine_labId_fkey"
  FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RecordStatusEvent: labId from its parent Record
ALTER TABLE "RecordStatusEvent" ADD COLUMN "labId" TEXT;
UPDATE "RecordStatusEvent" e SET "labId" = r."labId"
  FROM "Record" r WHERE e."recordId" = r."id";
ALTER TABLE "RecordStatusEvent" ALTER COLUMN "labId" SET NOT NULL;
CREATE INDEX "RecordStatusEvent_labId_idx" ON "RecordStatusEvent"("labId");
ALTER TABLE "RecordStatusEvent" ADD CONSTRAINT "RecordStatusEvent_labId_fkey"
  FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Therapy: labId from its parent Record
ALTER TABLE "Therapy" ADD COLUMN "labId" TEXT;
UPDATE "Therapy" t SET "labId" = r."labId"
  FROM "Record" r WHERE t."recordId" = r."id";
ALTER TABLE "Therapy" ALTER COLUMN "labId" SET NOT NULL;
CREATE INDEX "Therapy_labId_idx" ON "Therapy"("labId");
ALTER TABLE "Therapy" ADD CONSTRAINT "Therapy_labId_fkey"
  FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
