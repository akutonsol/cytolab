# Program 4 · CI/CD — keyless GitHub Actions deploy via Workload Identity Federation (WIF).
#
# READINESS POSTURE: authored + validated + plan-clean, gated OFF by default
# (var.provision_cicd = false). Live provisioning deferred to Program 9. Register §E.
#
# This establishes the TRUST that lets the GitHub repo impersonate the pre-existing osieri-deployer SA
# (deploy roles only — see iam.tf/service_accounts.tf) WITHOUT a downloaded SA JSON key, superseding the
# SA-key launch exception. The .github/workflows/deploy.yml `deploy` job already uses WIF
# (google-github-actions/auth with workload_identity_provider + service_account) and stays `if: false`
# until Program 9 sets the repo secrets/vars (from the outputs below) and flips the guard.

locals {
  cicd_count = var.provision_cicd ? 1 : 0
}

resource "google_iam_workload_identity_pool" "github" {
  count                     = local.cicd_count
  project                   = var.project_id
  workload_identity_pool_id = "github-pool"
  display_name              = "GitHub Actions"
  description               = "Keyless OIDC federation for GitHub Actions deploys."
}

resource "google_iam_workload_identity_pool_provider" "github" {
  count                              = local.cicd_count
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github[0].workload_identity_pool_id
  workload_identity_pool_provider_id = "github-provider"
  display_name                       = "GitHub OIDC"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }
  # Restrict token exchange to THIS repository (required by Google when mapping attribute.repository).
  attribute_condition = "assertion.repository == \"${var.github_repo}\""

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# Allow the repo's Actions tokens to impersonate the deployer SA (deploy roles only).
resource "google_service_account_iam_member" "deployer_wif" {
  count              = local.cicd_count
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github[0].name}/attribute.repository/${var.github_repo}"
}
