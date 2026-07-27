-- Rollback for 20260726000000_grant_wsi_view_to_viewer_roles.
--
-- PROVENANCE LIMITATION (read before running): the repository's migration policy is plain forward-only SQL
-- applied with `prisma migrate deploy`. There is no down-migration framework and no per-grant provenance
-- tracking, so this statement CANNOT distinguish a wsi:view grant created by the forward migration from one
-- an operator created by hand. It removes the wsi:view grant from these three roles regardless of origin.
--
-- REQUIRED PRECONDITION for this to restore the *exact* verified pre-migration state:
--   Before the forward migration was applied, none of {Authorizers, Pathologist, Lab Technician} held
--   wsi:view. This holds for any database provisioned from `prisma db seed` at or before this migration:
--   the pre-migration seed's buildRoleDefs never selects the 'wsi' prefix, so no default role carries any
--   wsi:* permission (verified in apps/api/prisma/seed.ts history + slide-review.authz.spec.ts). Under that
--   precondition, removing wsi:view from exactly these three roles returns them to the pre-migration baseline.
--
--   If — and only if — an operator MANUALLY granted wsi:view to one of these roles BEFORE applying the
--   forward migration, this rollback would also remove that manual grant. In that case reconcile by hand.
--
-- VERIFY the precondition first (expects 0 rows on a seed-provisioned DB prior to the forward migration):
--   SELECT r.name FROM "RolePermission" rp
--     JOIN "Role" r ON r.id = rp."roleId"
--     JOIN "Permission" p ON p.id = rp."permissionId"
--    WHERE p.code = 'wsi:view' AND r.name IN ('Authorizers','Pathologist','Lab Technician');
--
-- Scope: touches ONLY wsi:view for these three roles. record:view, wsi:review, wsi:publish, and every other
-- grant are untouched.

DELETE FROM "RolePermission"
WHERE "permissionId" = (SELECT id FROM "Permission" WHERE code = 'wsi:view')
  AND "roleId" IN (SELECT id FROM "Role" WHERE name IN ('Authorizers', 'Pathologist', 'Lab Technician'));
