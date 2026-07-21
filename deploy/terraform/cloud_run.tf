# Program 4 · Phase D-2A — Cloud Run foundations (SHELLS ONLY). Review only.
#
# A Cloud Run v2 service/job cannot exist without an image, so these shells use the PUBLIC placeholder
# `us-docker.pkg.dev/cloudrun/container/hello` with ignore_changes=[template] so the real osieri image
# is deployed in D-2C WITHOUT Terraform reverting it. This is a placeholder revision, NOT an application
# revision. Set var.create_cloud_run_shells=false to defer ALL Cloud Run creation to D-2C.
#
# No secrets are wired in (containers are empty in D-2A); no --allow-unauthenticated / ingress / DNS /
# Cloud SQL attachment here (that is D-2B/D-2C). Runtime identities are attached so bindings are exercised.

locals {
  placeholder_image = "us-docker.pkg.dev/cloudrun/container/hello"
  run_count         = var.create_cloud_run_shells ? 1 : 0
}

resource "google_cloud_run_v2_service" "api" {
  count               = local.run_count
  project             = google_project.prod.project_id
  name                = "osieri-api"
  location            = var.region
  deletion_protection = false
  labels              = var.labels

  template {
    service_account = google_service_account.api_run.email
    containers {
      image = local.placeholder_image
    }
  }

  # Real image + env/secrets/scaling arrive in D-2C; don't let Terraform revert the deployed revision.
  lifecycle {
    ignore_changes = [template, client, client_version]
  }

  depends_on = [google_project_service.apis]
}

resource "google_cloud_run_v2_service" "web" {
  count               = local.run_count
  project             = google_project.prod.project_id
  name                = "osieri-web"
  location            = var.region
  deletion_protection = false
  labels              = var.labels

  template {
    service_account = google_service_account.web_run.email
    containers {
      image = local.placeholder_image
    }
  }

  lifecycle {
    ignore_changes = [template, client, client_version]
  }

  depends_on = [google_project_service.apis]
}

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
      containers {
        image = local.placeholder_image
      }
      max_retries = 0
    }
  }

  lifecycle {
    ignore_changes = [template]
  }

  depends_on = [google_project_service.apis]
}
