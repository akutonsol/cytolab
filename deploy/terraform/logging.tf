# Program 4 · Phase D-2A — logging foundations. Review only.
# Cloud Logging + Error Reporting are enabled via their APIs (project.tf). Here we enable Data-Access
# AUDIT LOGS for the foundational services. NO log sinks and NO alerting policies (alerting = later).

resource "google_project_iam_audit_config" "data_access" {
  project = google_project.prod.project_id
  service = "allServices"

  audit_log_config {
    log_type = "ADMIN_READ"
  }
  audit_log_config {
    log_type = "DATA_READ"
  }
  audit_log_config {
    log_type = "DATA_WRITE"
  }

  depends_on = [google_project_service.apis]
}

# NOTE: Admin Activity audit logs are always-on and require no configuration. Error Reporting is active
# once clouderrorreporting.googleapis.com is enabled. Monitoring/alerting is explicitly out of D-2A (#16).
