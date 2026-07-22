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
