# Program 4 · Phase D-2A — Cloud SQL SKELETON (OPTIONAL, default OFF). Review only.
#
# DEFERRED TO D-2B by default (var.create_cloud_sql_skeleton = false). Rationale: a Cloud SQL instance's
# backup_configuration / PITR settings depend on the still-BLOCKED backup/DR decision (#11), which D-2A
# must not pre-empt. This file only RESERVES the instance name + minimal metadata when explicitly
# enabled; it does NOT restore databases, migrate data, create app/migrate DB users, or configure
# backups/PITR (all excluded from D-2A).

locals {
  sql_count = var.create_cloud_sql_skeleton ? 1 : 0
}

resource "google_sql_database_instance" "prod" {
  count               = local.sql_count
  project             = google_project.prod.project_id
  name                = "osieri-prod-pg"
  region              = var.region
  database_version    = "POSTGRES_16" # spec §7 silo candidate; confirm prod target under #7
  deletion_protection = true

  settings {
    tier              = "db-custom-1-3840" # placeholder sizing; right-sized in D-2B (#15)
    availability_type = "ZONAL"            # HA decision deferred to D-2B

    # Backups / PITR intentionally NOT configured here — gated by #11 (D-2B).
    # backup_configuration { ... }  # ← deferred

    ip_configuration {
      ipv4_enabled = false # private path finalized in D-2B (#14); no public IP by default
    }
  }

  lifecycle {
    # Settings (backups/HA/sizing/network) are finalized in D-2B; avoid churn on this reserved skeleton.
    ignore_changes = [settings]
  }

  depends_on = [google_project_service.apis]
}
