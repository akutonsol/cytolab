-- Program 2 · P2-R016A-2a — authoritative restoration of the AuditEvent organization-scope CHECK
-- constraint for the ISOLATED test database.
--
-- WHY: Prisma's datamodel does not model CHECK constraints, so the datamodel-diff provisioning
-- (migrate diff --from-empty --to-schema-datamodel) omits this constraint. It must be restored so the
-- audit-constraint integration tests exercise production-equivalent behavior.
--
-- REPOSITORY AUTHORITY: this constraint body is copied verbatim from the migration that defines it —
-- prisma/migrations/20260717000000_audit_event_ledger/migration.sql. Keep the two in sync; globalSetup
-- verifies the installed definition against the authoritative canonical form and fails on divergence.
--
-- Idempotent: applies only when the constraint is absent. Applied by globalSetup to the isolated
-- test database only (guarded).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AuditEvent_organization_scope_check'
  ) THEN
    ALTER TABLE "AuditEvent"
    ADD CONSTRAINT "AuditEvent_organization_scope_check"
    CHECK (
      ("organizationScope" = 'LAB' AND "scopeLabId" IS NOT NULL)
      OR
      ("organizationScope" IN ('SYSTEM', 'CROSS_LAB') AND "scopeLabId" IS NULL)
    );
  END IF;
END $$;
