# Program 4 — outputs consumed out-of-band (Program 9) to construct secret values, never stored as
# secret versions by Terraform. Null while var.provision_cloud_sql = false. The DB password is
# sensitive; retrieve with: terraform output -raw db_app_password.

output "sql_instance_connection_name" {
  description = "Cloud SQL instance connection name (PROJECT:REGION:INSTANCE) for the Auth Proxy socket."
  value       = one(google_sql_database_instance.prod[*].connection_name)
}

output "sql_instance_name" {
  description = "Cloud SQL instance name."
  value       = one(google_sql_database_instance.prod[*].name)
}

output "db_name" {
  description = "Application database name."
  value       = one(google_sql_database.app[*].name)
}

output "db_user" {
  description = "Application database user."
  value       = one(google_sql_user.app[*].name)
}

output "db_app_password" {
  description = "Generated application-user password (build DATABASE_URL from this; push via gcloud)."
  value       = one(random_password.db_app[*].result)
  sensitive   = true
}

output "lb_ip_address" {
  description = "Reserved external LB IP — point the registrar A record (apex + www) here. Null until provisioned."
  value       = one(google_compute_global_address.lb_ip[*].address)
}

output "wif_provider_name" {
  description = "Full WIF provider resource name → GitHub secret GCP_WORKLOAD_IDENTITY_PROVIDER. Null until provisioned."
  value       = one(google_iam_workload_identity_pool_provider.github[*].name)
}

output "deployer_sa_email" {
  description = "Deployer SA email → GitHub secret GCP_DEPLOY_SA."
  value       = google_service_account.deployer.email
}
