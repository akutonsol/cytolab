# Program 4 · Production observability — Cloud Monitoring uptime checks + alert policies.
#
# READINESS POSTURE: authored + validated + plan-clean, gated OFF by default
# (var.provision_monitoring = false). Live provisioning deferred to Program 9. Register §E.
# Complements the in-app Sentry wiring (instrument.ts) and Pino structured logs → Cloud Logging.

locals {
  mon_count = var.provision_monitoring ? 1 : 0
}

# Monitoring API — enabled only when monitoring is provisioned (keeps the default plan clean).
resource "google_project_service" "monitoring" {
  count              = local.mon_count
  project            = var.project_id
  service            = "monitoring.googleapis.com"
  disable_on_destroy = false
}

# Ops email notification channel.
resource "google_monitoring_notification_channel" "email" {
  count        = local.mon_count
  project      = var.project_id
  display_name = "Osieri ops email"
  type         = "email"
  labels = {
    email_address = var.alert_email
  }
  depends_on = [google_project_service.monitoring]
}

# Public HTTPS uptime check against the web root (via the LB / managed cert).
resource "google_monitoring_uptime_check_config" "web" {
  count        = local.mon_count
  project      = var.project_id
  display_name = "osieri-web-uptime"
  timeout      = "10s"
  period       = "300s"

  http_check {
    path         = "/"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = var.domain
    }
  }

  depends_on = [google_project_service.monitoring]
}

# Alert: the web uptime check is failing.
resource "google_monitoring_alert_policy" "uptime" {
  count        = local.mon_count
  project      = var.project_id
  display_name = "Osieri web uptime failing"
  combiner     = "OR"

  conditions {
    display_name = "Uptime check failed"
    condition_threshold {
      filter          = "resource.type = \"uptime_url\" AND metric.type = \"monitoring.googleapis.com/uptime_check/check_passed\" AND metric.label.check_id = \"${google_monitoring_uptime_check_config.web[0].uptime_check_id}\""
      comparison      = "COMPARISON_LT"
      threshold_value = 1
      duration        = "300s"
      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.host"]
      }
      trigger {
        count = 1
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email[0].id]
}

# Alert: Cloud Run 5xx responses spiking (api or web).
resource "google_monitoring_alert_policy" "run_5xx" {
  count        = local.mon_count
  project      = var.project_id
  display_name = "Osieri Cloud Run 5xx elevated"
  combiner     = "OR"

  conditions {
    display_name = "5xx request rate high"
    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND metric.type = \"run.googleapis.com/request_count\" AND metric.label.response_code_class = \"5xx\""
      comparison      = "COMPARISON_GT"
      threshold_value = 5
      duration        = "300s"
      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
        group_by_fields      = ["resource.label.service_name"]
      }
      trigger {
        count = 1
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email[0].id]
}

# Alert: Cloud SQL CPU sustained above 90%.
resource "google_monitoring_alert_policy" "sql_cpu" {
  count        = local.mon_count
  project      = var.project_id
  display_name = "Osieri Cloud SQL CPU > 90%"
  combiner     = "OR"

  conditions {
    display_name = "CPU utilization > 90%"
    condition_threshold {
      filter          = "resource.type = \"cloudsql_database\" AND metric.type = \"cloudsql.googleapis.com/database/cpu/utilization\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0.9
      duration        = "300s"
      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_MEAN"
      }
      trigger {
        count = 1
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email[0].id]
}
