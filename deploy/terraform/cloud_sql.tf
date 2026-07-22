# Program 4 · Production Cloud SQL (PostgreSQL 16) — the app database.
#
# READINESS POSTURE: this definition is authored + validated + plan-clean, but is gated OFF by default
# (var.provision_cloud_sql = false) so it incurs NO recurring cost and cannot be provisioned by an
# accidental `terraform apply`. Live provisioning is deferred to Program 9 — Production Launch Readiness
# Review, which sets var.provision_cloud_sql = true. See docs/PROGRAM_4_DEFERRED_ITEM_REGISTER.md §E.
#
# Connectivity model (approved): PUBLIC IP + Cloud SQL Auth Proxy. The instance has a public IP but
# NO authorized networks, so it is not reachable from the internet; Cloud Run reaches it through the
# built-in, IAM-authenticated, TLS-encrypted Auth Proxy (the api_run + migrate SAs already hold
# roles/cloudsql.client — see iam.tf). ssl_mode = ENCRYPTED_ONLY blocks any unencrypted direct path.
#
# Durability: REGIONAL HA, automated backups, and PITR are ON; deletion protection is ON at both the
# Terraform layer (won't destroy) and the API layer. When provisioned, the DB password is generated
# here and surfaced as a SENSITIVE Terraform output; the DATABASE_URL / DATABASE_MIGRATION_URL secret
# VALUES are constructed from it and pushed to Secret Manager out-of-band (gcloud), so Terraform never
# stores a secret version.

locals {
  sql_count = var.provision_cloud_sql ? 1 : 0
}

resource "google_sql_database_instance" "prod" {
  count               = local.sql_count
  project             = google_project.prod.project_id
  name                = "osieri-prod-pg"
  region              = var.region
  database_version    = "POSTGRES_16"
  deletion_protection = true # Terraform-layer guard: refuse to destroy this instance

  settings {
    tier              = var.db_tier
    availability_type = "REGIONAL" # HA: automatic failover to a standby in another zone
    disk_type         = "PD_SSD"
    disk_autoresize   = true

    # Automated backups + point-in-time recovery (WAL archiving).
    backup_configuration {
      enabled                        = true
      start_time                     = "03:00" # UTC daily backup window
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = 14
        retention_unit   = "COUNT"
      }
    }

    ip_configuration {
      ipv4_enabled = true             # public IP, but no authorized_networks below → not internet-reachable
      ssl_mode     = "ENCRYPTED_ONLY" # reject unencrypted direct connections; Auth Proxy uses mTLS
    }

    maintenance_window {
      day          = 7 # Sunday
      hour         = 4 # 04:00 UTC
      update_track = "stable"
    }

    deletion_protection_enabled = true # API-layer guard (independent of the Terraform-layer guard above)

    user_labels = var.labels
  }

  depends_on = [google_project_service.apis]
}

# Application database.
resource "google_sql_database" "app" {
  count    = local.sql_count
  project  = google_project.prod.project_id
  name     = var.db_name
  instance = google_sql_database_instance.prod[0].name
}

# Generated application-user password (alphanumeric → always URL-safe in a connection string).
resource "random_password" "db_app" {
  count   = local.sql_count
  length  = 32
  special = false
}

# Application user. Cloud SQL grants API-created users cloudsqlsuperuser, so this user can run
# migrations (DDL, incl. the cutover's schema reset) as well as runtime DML.
resource "google_sql_user" "app" {
  count    = local.sql_count
  project  = google_project.prod.project_id
  name     = var.db_user
  instance = google_sql_database_instance.prod[0].name
  password = random_password.db_app[0].result
}
