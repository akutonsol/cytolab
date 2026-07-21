# Program 4 · Phase D-2A — Artifact Registry Docker repo + repo-scoped deploy write. Review only.

resource "google_artifact_registry_repository" "osieri" {
  project       = google_project.prod.project_id
  location      = var.region
  repository_id = var.artifact_repo_id # "osieri" (spec §8)
  format        = "DOCKER"
  description   = "Osieri production container images (api:<sha> / web:<sha>)."
  labels        = var.labels
  depends_on    = [google_project_service.apis]
}

# Deployer write access scoped to THIS repo (not project-wide artifactregistry.writer).
resource "google_artifact_registry_repository_iam_member" "deployer_writer" {
  project    = google_project.prod.project_id
  location   = google_artifact_registry_repository.osieri.location
  repository = google_artifact_registry_repository.osieri.repository_id
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.deployer.email}"
}

# Runtime SAs pull images from this repo (read-only), scoped to the repo.
resource "google_artifact_registry_repository_iam_member" "runtime_readers" {
  for_each = {
    api = google_service_account.api_run.email
    web = google_service_account.web_run.email
  }
  project    = google_project.prod.project_id
  location   = google_artifact_registry_repository.osieri.location
  repository = google_artifact_registry_repository.osieri.repository_id
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${each.value}"
}
