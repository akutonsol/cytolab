# Program 4 · Phase D-2A — Secret Manager SKELETON: empty containers only. Review only.
# Naming convention frozen in spec: osieri-prod-<SECRET_NAME>.
# NO versions, NO values, NO credentials are created here (that is D-2B, gated by #10).

# Runtime secret containers (API runtime is granted per-secret access in iam.tf).
resource "google_secret_manager_secret" "runtime" {
  for_each  = toset(local.runtime_secret_keys)
  project   = google_project.prod.project_id
  secret_id = "osieri-prod-${each.value}"
  labels    = var.labels

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

# Migration URL container — isolated; only osieri-migrate is granted access (iam.tf).
resource "google_secret_manager_secret" "migration" {
  project   = google_project.prod.project_id
  secret_id = "osieri-prod-${local.migration_secret_key}"
  labels    = var.labels

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

# NOTE (spec #10, still BLOCKED): secret VALUES/versions, ownership, and rotation policy are NOT set
# here. Adding a google_secret_manager_secret_version with a real value is explicitly out of D-2A.
