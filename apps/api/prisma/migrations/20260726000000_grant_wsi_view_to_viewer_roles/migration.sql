-- P5-4 — grant wsi:view to the staff roles that already hold record:view and legitimately view slides.
--
-- wsi:view gates delivery-session issuance (authenticated slide viewing). It is granted ONLY to the three
-- default roles that currently receive record:view: Authorizers, Pathologist, Lab Technician. This does NOT
-- grant wsi:review or wsi:publish to any role (those remain super-role-only via the guard bypass), and it
-- does not weaken delivery-session issuance to record:view (the dedicated WSI boundary is preserved).
--
-- Idempotent: RolePermission's PK is (roleId, permissionId); ON CONFLICT DO NOTHING makes re-application and
-- overlap with a fresh seed safe. No-op for a lab whose roles were renamed (grant is by the default names).

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.id, p.id
FROM "Role" r
CROSS JOIN "Permission" p
WHERE p.code = 'wsi:view'
  AND r.name IN ('Authorizers', 'Pathologist', 'Lab Technician')
  AND r."isSuperRole" = false
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
