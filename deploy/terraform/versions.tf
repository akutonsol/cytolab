# Program 4 · Phase D-2A — provider + version pins. Authored for review; not applied.

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # D-2B remote state — GCS backend (bucket bootstrapped in compact-surfer-318619, versioned).
  backend "gcs" {
    bucket = "osieri-tfstate-9317"
    prefix = "d2a-foundation"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
