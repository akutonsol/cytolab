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
  description = "Create placeholder Cloud Run service/job shells now (true) or defer all Cloud Run to D-2C (false). Default false per D-2A architectural ruling — Cloud Run is created in D-2C after secrets/networking/DB/pipeline are finalized."
  type        = bool
  default     = false
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
