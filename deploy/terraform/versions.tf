# Program 4 · Phase D-2A — provider + version pins. Authored for review; not applied.

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }

  # State backend is a D-2B bootstrap step (the GCS bucket does not exist in D-2A).
  # Intentionally left commented — local state by default until the bucket is provisioned.
  # backend "gcs" {
  #   bucket = "osieri-prod-tfstate"   # created during D-2B bootstrap
  #   prefix = "d2a-foundation"
  # }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
