# Program 4 · Phase D-2A — the four identities frozen in spec §5b/§5c. Authored for review; not applied.
# No keys are created here. The osieri-deployer JSON key (launch exception, §5b) is issued out-of-band
# in D-2B and stored ONLY as the GitHub secret GCP_SA_KEY — never in Terraform state or the repo.

resource "google_service_account" "deployer" {
  project      = google_project.prod.project_id
  account_id   = local.sa_deployer
  display_name = "Osieri CI deployer (SA-key launch exception — §5b)"
  description  = "GitHub Actions deploy identity. Deploy roles only; NEVER runtime data/secret roles."
  depends_on   = [google_project_service.apis]
}

resource "google_service_account" "api_run" {
  project      = google_project.prod.project_id
  account_id   = local.sa_api_run
  display_name = "Osieri API runtime"
  description  = "Cloud Run osieri-api runtime identity. Least-privilege accessor/client only."
  depends_on   = [google_project_service.apis]
}

resource "google_service_account" "web_run" {
  project      = google_project.prod.project_id
  account_id   = local.sa_web_run
  display_name = "Osieri Web runtime"
  description  = "Cloud Run osieri-web runtime identity. Logging only unless a concrete dependency requires more."
  depends_on   = [google_project_service.apis]
}

resource "google_service_account" "migrate" {
  project      = google_project.prod.project_id
  account_id   = local.sa_migrate
  display_name = "Osieri migration job runtime"
  description  = "osieri-migrate Cloud Run job identity. Sole holder of migration authority + privileged DB access."
  depends_on   = [google_project_service.apis]
}
