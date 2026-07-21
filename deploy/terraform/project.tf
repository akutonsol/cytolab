# Program 4 · Phase D-2A — project bootstrap + API enablement. Authored for review; not applied.

resource "google_project" "prod" {
  name            = var.project_name
  project_id      = var.project_id
  billing_account = var.billing_account
  org_id          = var.org_id
  folder_id       = var.folder_id
  labels          = var.labels

  # Foundational project; deletion protection left to org policy.
}

# Enable exactly the APIs D-2A needs. Networking/compute (LB) APIs are deferred to D-2B.
resource "google_project_service" "apis" {
  for_each = toset(local.required_apis)

  project = google_project.prod.project_id
  service = each.value

  disable_on_destroy         = false
  disable_dependent_services = false
}
