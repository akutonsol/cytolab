-- P5-5 — support the primary ordered slide-discovery browse/search path.
-- `GET /wsi` orders by (uploadedAt) within the tenant (labId) scope for newest/oldest pagination; this
-- composite index makes that ordered, tenant-scoped scan index-backed. No column/data change.
CREATE INDEX "DigitalSlide_labId_uploadedAt_idx" ON "DigitalSlide"("labId", "uploadedAt");
