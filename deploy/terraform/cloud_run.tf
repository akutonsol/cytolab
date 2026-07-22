# Program 4 · Production Cloud Run — API service, Web service, and the migration job.
#
# READINESS POSTURE: authored + validated + plan-clean, gated OFF by default
# (var.provision_cloud_run = false) → no recurring cost, no accidental provisioning. Live provisioning
# is deferred to Program 9, which sets var.provision_cloud_run = true. See the Deferred-Item Register §E.
#
# This is the real service contract (NOT the D-2A placeholder shells): least-privilege runtime SAs,
# internal-LB ingress (reachable only via the HTTPS load balancer in Stage 5), secrets injected from
# Secret Manager (values populated in Program 9, never by Terraform), CONFIG via plain env, and the
# Cloud SQL Auth Proxy socket attached at /cloudsql. The api_run SA already holds secretAccessor on the
# runtime secrets and cloudsql.client (iam.tf); the migrate SA holds only the migration-secret accessor.

locals {
  run_count  = var.provision_cloud_run ? 1 : 0
  image_base = "${var.region}-docker.pkg.dev/${var.project_id}/${var.artifact_repo_id}"
  # Deterministic instance connection name (decoupled from the Cloud SQL gate so this file plans cleanly
  # regardless of var.provision_cloud_sql): PROJECT:REGION:INSTANCE.
  sql_connection_name = "${var.project_id}:${var.region}:osieri-prod-pg"
  # The 8 real runtime secrets the API consumes (JWT_REFRESH_SECRET and REDIS_URL are intentionally
  # excluded — the Stage-1 audit found no code reads them).
  api_secret_env = toset([
    "DATABASE_URL", "JWT_SECRET", "JWT_PORTAL_SECRET", "JWT_PORTAL_REFRESH_SECRET",
    "ENCRYPTION_KEY", "ANTHROPIC_API_KEY", "POWERTRANZ_ID", "POWERTRANZ_PASSWORD",
  ])
}

# ── API service ───────────────────────────────────────────────────────────────────────────────────
resource "google_cloud_run_v2_service" "api" {
  count               = local.run_count
  project             = google_project.prod.project_id
  name                = "osieri-api"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER" # reachable only through the HTTPS LB
  deletion_protection = false
  labels              = var.labels

  template {
    service_account                  = google_service_account.api_run.email
    max_instance_request_concurrency = 80

    scaling {
      min_instance_count = 0 # scale to zero when idle (cost-safe default; raise for warm capacity)
      max_instance_count = 10
    }

    # Cloud SQL Auth Proxy socket (mounted at /cloudsql/<connection_name>).
    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [local.sql_connection_name]
      }
    }

    containers {
      image = "${local.image_base}/api:${var.image_tag}"
      ports {
        container_port = 8080 # Cloud Run sets PORT=8080; the app reads process.env.PORT
      }
      resources {
        limits = { cpu = "1", memory = "1Gi" }
      }
      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }

      # CONFIG (non-sensitive) — plain env. PORTAL_WEB_ORIGIN + ALLOWED_ORIGINS are required in prod.
      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "API_PREFIX"
        value = var.api_prefix
      }
      env {
        name  = "PORTAL_WEB_ORIGIN"
        value = var.portal_web_origin
      }
      env {
        name  = "ALLOWED_ORIGINS"
        value = var.allowed_origins
      }
      env {
        name  = "SWAGGER_ENABLED"
        value = "false"
      }
      env {
        name  = "LOG_LEVEL"
        value = "info"
      }

      # SECRETS — injected from Secret Manager (values populated in Program 9, never by Terraform).
      dynamic "env" {
        for_each = local.api_secret_env
        content {
          name = env.value
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.runtime[env.value].secret_id
              version = "latest"
            }
          }
        }
      }

      startup_probe {
        http_get {
          path = var.api_health_path
          port = 8080
        }
        initial_delay_seconds = 5
        timeout_seconds       = 3
        period_seconds        = 10
        failure_threshold     = 6
      }
      liveness_probe {
        http_get {
          path = var.api_health_path
          port = 8080
        }
        period_seconds = 30
      }
    }
  }

  depends_on = [google_project_service.apis]
}

# ── Web service (Next.js standalone) ────────────────────────────────────────────────────────────────
resource "google_cloud_run_v2_service" "web" {
  count               = local.run_count
  project             = google_project.prod.project_id
  name                = "osieri-web"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  deletion_protection = false
  labels              = var.labels

  template {
    service_account = google_service_account.web_run.email

    scaling {
      min_instance_count = 0
      max_instance_count = 10
    }

    containers {
      image = "${local.image_base}/web:${var.image_tag}"
      ports {
        container_port = 8080
      }
      resources {
        limits = { cpu = "1", memory = "512Mi" }
      }
      env {
        name  = "NODE_ENV"
        value = "production"
      }
      # Server-side rewrite target → the API service (NEXT_PUBLIC_* are build-time, set in CI, not here).
      env {
        name  = "API_INTERNAL_URL"
        value = google_cloud_run_v2_service.api[0].uri
      }
    }
  }

  depends_on = [google_project_service.apis]
}

# ── Migration job (prisma migrate deploy) ───────────────────────────────────────────────────────────
# NOTE for Program 9: confirm the image used here contains the Prisma CLI + prisma/migrations (the prod
# api image prunes devDependencies). If not, build a dedicated migrate image. The job receives the
# MIGRATION connection string (only the migrate SA can read that secret) as DATABASE_URL, which
# `prisma migrate deploy` consumes.
resource "google_cloud_run_v2_job" "migrate" {
  count               = local.run_count
  project             = google_project.prod.project_id
  name                = "osieri-migrate"
  location            = var.region
  deletion_protection = false
  labels              = var.labels

  template {
    template {
      service_account = google_service_account.migrate.email
      max_retries     = 0

      volumes {
        name = "cloudsql"
        cloud_sql_instance {
          instances = [local.sql_connection_name]
        }
      }

      containers {
        image   = "${local.image_base}/api:${var.image_tag}"
        command = ["npx"]
        args    = ["prisma", "migrate", "deploy"]
        volume_mounts {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }
        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.migration.secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }

  depends_on = [google_project_service.apis]
}

# Public invoker at the app layer (app enforces its own auth); combined with internal-LB ingress this is
# the standard "public web app behind an external HTTPS LB" posture. No org policy blocks allUsers (no org).
resource "google_cloud_run_v2_service_iam_member" "api_invoker" {
  count    = local.run_count
  project  = google_project.prod.project_id
  location = var.region
  name     = google_cloud_run_v2_service.api[0].name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "web_invoker" {
  count    = local.run_count
  project  = google_project.prod.project_id
  location = var.region
  name     = google_cloud_run_v2_service.web[0].name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
