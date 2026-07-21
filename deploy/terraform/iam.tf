# Program 4 · Phase D-2A — role-level IAM, frozen from Environment Spec §5d. Review only.
# Invariants: no primitive roles; deploy authority not inherited by runtime; serviceAccountUser scoped
# per-SA; secret access individual-secret-scoped; migration authority isolated to osieri-migrate.

# ── Deployer (CI): deploy roles ONLY (no runtime data/secret roles) ───────────
resource "google_project_iam_member" "deployer_run_admin" {
  project = google_project.prod.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_project_iam_member" "deployer_serviceusage_consumer" {
  project = google_project.prod.project_id
  role    = "roles/serviceusage.serviceUsageConsumer"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}
# (artifactregistry.writer is granted repo-scoped in artifact_registry.tf, not project-wide.)

# ── serviceAccountUser scoped PER runtime SA (NEVER project-wide) ─────────────
# The deployer may actAs exactly the three runtime SAs to deploy them onto Cloud Run.
resource "google_service_account_iam_member" "deployer_actas_api" {
  service_account_id = google_service_account.api_run.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_service_account_iam_member" "deployer_actas_web" {
  service_account_id = google_service_account.web_run.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_service_account_iam_member" "deployer_actas_migrate" {
  service_account_id = google_service_account.migrate.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}

# ── API runtime: cloudsql.client + logging.logWriter (project-level) ──────────
# NOTE: roles/storage.objectUser is DEFERRED to D-2B (bucket not created here; STORAGE_BUCKET TBD).
resource "google_project_iam_member" "api_run_cloudsql_client" {
  project = google_project.prod.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.api_run.email}"
}

resource "google_project_iam_member" "api_run_log_writer" {
  project = google_project.prod.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.api_run.email}"
}

# ── Web runtime: logging only (no privileged roles — spec §5d) ───────────────
resource "google_project_iam_member" "web_run_log_writer" {
  project = google_project.prod.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.web_run.email}"
}

# ── Migration runtime: cloudsql.client + log writer (privileged DB user in D-2B) ─
resource "google_project_iam_member" "migrate_cloudsql_client" {
  project = google_project.prod.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.migrate.email}"
}

resource "google_project_iam_member" "migrate_log_writer" {
  project = google_project.prod.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.migrate.email}"
}

# ── Individual-secret secretAccessor (spec §5d: individual-secret scope) ──────
# API runtime reads every RUNTIME secret container (never the migration URL).
resource "google_secret_manager_secret_iam_member" "api_run_secret_accessor" {
  for_each  = google_secret_manager_secret.runtime
  project   = google_project.prod.project_id
  secret_id = each.value.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api_run.email}"
}

# Migration runtime reads ONLY the DATABASE_MIGRATION_URL secret (isolated authority).
resource "google_secret_manager_secret_iam_member" "migrate_secret_accessor" {
  project   = google_project.prod.project_id
  secret_id = google_secret_manager_secret.migration.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.migrate.email}"
}
