# Program 4 · Phase D-2A — inputs. Frozen defaults come from Environment Spec Rev 2 (aa2fd28).
# Real values (billing/org/project number) are supplied via an un-committed terraform.tfvars.

variable "project_id" {
  description = "Pooled-production GCP project id (spec §5a)."
  type        = string
  default     = "osieri-prod"
}

variable "project_name" {
  description = "Human-readable project name."
  type        = string
  default     = "Osieri Production"
}

variable "region" {
  description = "Default region (spec: us-central1)."
  type        = string
  default     = "us-central1"
}

variable "billing_account" {
  description = "Billing account id to link (verification per D-2A #1). Required at apply time."
  type        = string
}

variable "org_id" {
  description = "Organization id under which to create the project (mutually exclusive with folder_id)."
  type        = string
  default     = null
}

variable "folder_id" {
  description = "Folder id under which to create the project (mutually exclusive with org_id)."
  type        = string
  default     = null
}

variable "labels" {
  description = "Project + resource labels."
  type        = map(string)
  default = {
    program     = "program-4"
    environment = "production"
    app         = "osieri"
    managed_by  = "terraform"
    phase       = "d-2a-foundational"
  }
}

variable "artifact_repo_id" {
  description = "Artifact Registry Docker repo id (spec §8: 'osieri')."
  type        = string
  default     = "osieri"
}

variable "create_cloud_run_shells" {
  description = "DEPRECATED (superseded by the real Cloud Run definitions gated by var.provision_cloud_run). Retained to avoid breaking external tfvars; no longer referenced."
  type        = bool
  default     = false
}

variable "provision_cloud_run" {
  description = "SAFETY GATE. Create the live, recurring-cost Cloud Run services/job. Default FALSE (readiness-validation posture). Program 9 sets this true to provision."
  type        = bool
  default     = false
}

variable "image_tag" {
  description = "Container image tag to deploy (CI overrides with the commit SHA)."
  type        = string
  default     = "latest"
}

variable "api_prefix" {
  description = "API global route prefix (must match the app's API_PREFIX)."
  type        = string
  default     = "api/v1"
}

variable "portal_web_origin" {
  description = "Canonical portal origin for the payment iframe (app throws in prod if unset). Set to the real portal origin."
  type        = string
  default     = "https://osieri.com"
}

variable "allowed_origins" {
  description = "Comma-separated CORS allow-list for the API."
  type        = string
  default     = "https://osieri.com,https://www.osieri.com"
}

variable "api_health_path" {
  description = "API liveness path for Cloud Run probes (prefix + /health)."
  type        = string
  default     = "/api/v1/health"
}

variable "provision_lb" {
  description = "SAFETY GATE. Create the external HTTPS load balancer + managed SSL (recurring cost + reserves a static IP). Default FALSE (readiness posture). Program 9 sets true."
  type        = bool
  default     = false
}

variable "domain" {
  description = "Primary public domain. The apex + www are placed on the managed SSL certificate and routed to the web service (/api/* → the API service)."
  type        = string
  default     = "osieri.com"
}

variable "provision_monitoring" {
  description = "SAFETY GATE. Create Cloud Monitoring uptime checks + alert policies + notification channel. Default FALSE (readiness posture). Program 9 sets true. (Monitoring cost is negligible, but kept gated for a uniform posture.)"
  type        = bool
  default     = false
}

variable "alert_email" {
  description = "Email address for the ops alert notification channel. Set to the real ops address at launch."
  type        = string
  default     = "alerts@osieri.com"
}

variable "provision_cicd" {
  description = "SAFETY GATE. Create the Workload Identity Federation trust for GitHub Actions → deployer SA (keyless CI). Default FALSE (readiness posture). Program 9 sets true. (WIF itself has no recurring cost, but gated for a uniform posture.)"
  type        = bool
  default     = false
}

variable "github_repo" {
  description = "GitHub repo (owner/name) allowed to impersonate the deployer SA via WIF."
  type        = string
  default     = "akutonsol/cytolab"
}

variable "create_cloud_sql_skeleton" {
  description = "DEPRECATED (superseded by the real Cloud SQL config in cloud_sql.tf). Retained to avoid breaking any external tfvars; no longer referenced."
  type        = bool
  default     = false
}

variable "provision_cloud_sql" {
  description = "SAFETY GATE. Create the live, recurring-cost Cloud SQL instance. Default FALSE for the production-readiness-VALIDATION posture (Terraform is authored + plan-clean but not applied). Program 9 — Production Launch Readiness Review sets this true to actually provision."
  type        = bool
  default     = false
}

variable "db_tier" {
  description = "Cloud SQL machine tier (spec #15). Start lean — scalable live with a settings change."
  type        = string
  default     = "db-custom-1-3840" # 1 vCPU / 3.75 GB
}

variable "db_name" {
  description = "Application database name."
  type        = string
  default     = "osieri"
}

variable "db_user" {
  description = "Application database user. Cloud SQL grants it cloudsqlsuperuser; used by BOTH runtime and migrations for launch (future hardening: split runtime-CRUD vs migrate-DDL users)."
  type        = string
  default     = "osieri_app"
}

# ── Frozen identity locals (spec §5b/§5c) ─────────────────────────────────────
locals {
  sa_deployer = "osieri-deployer" # CI deploy SA (JSON key path — launch exception, spec §5b)
  sa_api_run  = "osieri-api-run"  # API runtime
  sa_web_run  = "osieri-web-run"  # Web runtime
  sa_migrate  = "osieri-migrate"  # Migration job runtime

  # Secret Manager containers (names => osieri-prod-<KEY>). Empty containers only (no versions/values).
  # Sourced from Environment Spec §6 (Secret-Manager-sourced runtime secrets).
  runtime_secret_keys = [
    "DATABASE_URL",
    "JWT_SECRET",
    "JWT_REFRESH_SECRET",
    "JWT_PORTAL_SECRET",
    "JWT_PORTAL_REFRESH_SECRET",
    "ENCRYPTION_KEY",
    "ANTHROPIC_API_KEY",
    "POWERTRANZ_ID",
    "POWERTRANZ_PASSWORD",
    "REDIS_URL",
  ]
  migration_secret_key = "DATABASE_MIGRATION_URL"

  all_secret_keys = concat(local.runtime_secret_keys, [local.migration_secret_key])

  required_apis = [
    "cloudresourcemanager.googleapis.com",
    "serviceusage.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "logging.googleapis.com",
    "clouderrorreporting.googleapis.com",
    "sqladmin.googleapis.com",
  ]
}
